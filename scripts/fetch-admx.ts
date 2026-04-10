#!/usr/bin/env node
import { mkdirSync, existsSync, writeFileSync, rmSync, cpSync, readFileSync } from 'fs'
import { join, resolve, sep } from 'path'
import { execSync } from 'child_process'
import { unzipSync } from 'fflate'
import { walkDir, runWithLimit } from '../src/admxUtils'

const ROOT = resolve(process.cwd())
const ADMX_DIR = join(ROOT, 'admx')
const ADML_CACHE = join(ROOT, '.cache', 'adml')
const CONCURRENCY = Number(process.env.FETCH_JOBS || 4)
const filter = process.argv[2]?.startsWith('-') ? null : process.argv[2] ?? null

const headers: Record<string, string> = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

const fetchOk = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, { headers, ...init })
  if (response.ok) return response
  throw new Error(`HTTP ${response.status} for ${url}`)
}
const fetchText = (url: string, extra?: Record<string, string>) =>
  fetchOk(url, { headers: { ...headers, ...extra } }).then(response => response.text())
const fetchJson = (url: string) => fetchOk(url).then(response => response.json())
const download = (url: string) =>
  fetchOk(url, { redirect: 'follow' }).then(response => response.arrayBuffer()).then(buf => Buffer.from(buf))

async function resolveRedirects(url: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual' })
    const location = response.headers.get('location')
    if (!location) return url
    url = location.startsWith('/') ? new URL(location, url).href : location
  }
  return url
}

async function githubRelease(owner: string, repo: string, asset?: RegExp): Promise<string> {
  const releases = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases`)
  const latest = releases.find((release: any) => !release.draft && !release.prerelease) || releases[0]
  if (asset) {
    const match = latest.assets.find((entry: any) => asset.test(entry.name))
    if (match) return match.browser_download_url
  }
  return latest.zipball_url
}

async function msDownloadUrls(id: number): Promise<string[]> {
  const html = await fetchText(`https://www.microsoft.com/en-us/download/details.aspx?id=${id}`)
  const match = html.match(/<script>[\w.]+__DLCDetails__=(.*?)<\/script>/)
  if (!match) throw new Error(`Cannot parse MS download ${id}`)
  return [JSON.parse(match[1]).dlcDetailsView.downloadFile].flat().map((file: any) => file.url)
}

async function msDownload(id: number, fileFilter?: (url: string) => boolean): Promise<string> {
  const urls = await msDownloadUrls(id)
  return (fileFilter ? urls.find(fileFilter) : urls[0])!
}

async function lenovoPolicyTemplateDownload(): Promise<string> {
  const pageUrl = 'https://support.lenovo.com/us/en/solutions/ht037099-download-thinkvantage-technologies-administrator-tools'
  const pageHtml = await fetchText(pageUrl)
  const contentJs = pageHtml.match(/\/us\/en\/api\/v4\/contents\/cdn\/ht037099_[0-9]+\.js/)
  if (!contentJs) throw new Error('No Lenovo content payload found')

  const js = await fetchText(`https://support.lenovo.com${contentJs[0]}`)
  const exact =
    js.match(/href=\\"(https:\/\/download\.lenovo\.com\/[^"\\]+)\\"[^>]*>Group Policy Template File</i)
    || js.match(/href="(https:\/\/download\.lenovo\.com\/[^"]+)"[^>]*>Group Policy Template File</i)
  if (exact) return exact[1].replace(/\\\//g, '/')

  const fallback = [...js.matchAll(/https:\/\/download\.lenovo\.com\/[A-Za-z0-9_./-]+\.(?:zip|exe)/ig)]
    .map(m => m[0].replace(/\\\//g, '/'))
    .find(u => /policy|template|admin/i.test(u))
  if (fallback) return fallback

  throw new Error('No Lenovo Group Policy template download URL found')
}

async function dellCommandUpdateDownload(): Promise<string> {
  const kbUrl = 'https://www.dell.com/support/kbdoc/en-au/000177325/dell-command-update'
  const kbHtml = await fetchText(kbUrl)
  const detailsUrl = kbHtml.match(/https:\/\/www\.dell\.com\/support\/home\/en-[a-z]{2}\/drivers\/driversdetails\?driverid=[A-Z0-9]+"[^>]*>Dell Command \| Update Windows Universal Application/i)
  if (!detailsUrl) throw new Error('No Dell Command Update driverdetails URL found')
  const page = detailsUrl[0].split('"')[0]
  const detailsHtml = await fetchText(page, { Referer: kbUrl })
  const exe = detailsHtml.match(/https:\/\/dl\.dell\.com\/[A-Za-z0-9_./-]+\.exe/i)
  if (!exe) throw new Error('No Dell Command Update executable URL found')
  return exe[0]
}

const LANG_MAP: Record<string, string> = {
  adm: 'en-us', en: 'en-us', de: 'de-de', es: 'es-es', 'es-419': 'es-es',
  fr: 'fr-fr', it: 'it-it', ja: 'ja-jp', ko: 'ko-kr', nl: 'nl-nl',
  pl: 'pl-pl', ru: 'ru-ru', sv: 'sv-se', tr: 'tr-tr', hu: 'hu-hu',
  'zh-cn': 'zh-hans', 'zh-tw': 'zh-hant',
}
const OFFICE_LANG: Record<string, string> = {
  '0': 'en-us', '': 'de-de', '1': 'es-es', '2': 'fr-fr', '3': 'it-it',
  '4': 'pt-br', '5': 'nl-nl', '6': 'ru-ru', '7': 'sv-se', '8': 'tr-tr',
  '9': 'pl-pl', '10': 'ja-jp',
}

const normLang = (lang: string) => { const normalized = lang.toLowerCase().replace('_', '-'); return LANG_MAP[normalized] || normalized }
const langDir = (lang: string) => lang === 'en-us' ? join(ADMX_DIR, 'en-us') : join(ADML_CACHE, lang)

function detectLang(parts: string[]): string | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (/^[a-z]{2,3}([-_][a-z0-9]{2,8}){1,2}$/i.test(part)) return normLang(part)
    if (LANG_MAP[part.toLowerCase()]) return LANG_MAP[part.toLowerCase()]
  }
  return null
}

function resolveDest(entryPath: string, isOffice: boolean): { dir: string; name: string } {
  const parts = entryPath.replace(/\\/g, '/').split('/')
  let fileName = parts.pop()!
  if (fileName.toLowerCase().startsWith('staging_')) fileName = fileName.substring(8)
  fileName = fileName.replace(/\.adml$/i, '.adml')

  if (/\.admx$/i.test(fileName)) return { dir: ADMX_DIR, name: fileName.replace(/\.admx$/i, '.admx') }

  if (isOffice) {
    const officeMatch = fileName.match(/^(.+?)\.adml(\d*)$/i)
    if (officeMatch) return { dir: langDir(OFFICE_LANG[officeMatch[2] || ''] || 'en-us'), name: officeMatch[1] + '.adml' }
  }

  const lang = detectLang(parts)
  if (lang) return { dir: langDir(lang), name: fileName }

  const langPrefixMatch = fileName.match(/^([a-z]{2}(?:[-_][a-z]{2}))_(.+)$/i)
  if (langPrefixMatch) return { dir: langDir(normLang(langPrefixMatch[1])), name: langPrefixMatch[2] }

  return { dir: langDir('en-us'), name: fileName }
}

const IS_ADMX = (name: string) => /\.admx$/i.test(name) || /\.adml\d*$/i.test(name)

function toUtf8(data: Uint8Array): Buffer {
  if (data[0] === 0xFF && data[1] === 0xFE)
    return Buffer.from(new TextDecoder('utf-16le').decode(data.slice(2)))
  if (data[0] === 0xFE && data[1] === 0xFF)
    return Buffer.from(new TextDecoder('utf-16be').decode(data.slice(2)))
  return Buffer.from(data)
}

function placeFile(entryPath: string, data: Uint8Array | string, isOffice: boolean, collector?: string[]): 'admx' | 'adml' {
  const { dir, name } = resolveDest(entryPath, isOffice)
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, name)
  if (existsSync(dest) && (dest === ADMX_DIR || dest.startsWith(ADMX_DIR + sep)))
    console.warn(`[warn] overwriting existing file: ${dest.slice(ROOT.length + 1)}`)
  if (typeof data === 'string') writeFileSync(dest, toUtf8(readFileSync(data)))
  else writeFileSync(dest, toUtf8(data))
  const type = /\.admx$/i.test(name) ? 'admx' : 'adml'
  if (type === 'admx' && collector) collector.push(name.replace(/\.admx$/i, ''))
  return type
}

function extractZip(buf: Buffer, isOffice: boolean, collector?: string[]) {
  const entries = unzipSync(new Uint8Array(buf), { filter: entry => IS_ADMX(entry.name.split('/').pop()!) })
  let admx = 0, adml = 0
  for (const [path, data] of Object.entries(entries))
    placeFile(path, data, isOffice, collector) === 'admx' ? admx++ : adml++
  return { admx, adml }
}

let tmpCounter = 0
function extract7z(buf: Buffer, isOffice: boolean, collector?: string[]) {
  const tmp = join(ROOT, '.cache', `_tmp${tmpCounter++}`)
  if (existsSync(tmp)) rmSync(tmp, { recursive: true })
  mkdirSync(tmp, { recursive: true })
  try {
    writeFileSync(join(tmp, 'a'), buf)
    execSync(`7z x -y -o"${tmp}/x" "${tmp}/a" > /dev/null 2>&1`, { timeout: 120_000 })
    for (const f of walkDir(join(tmp, 'x'), n => /\.zip$/i.test(n) || /^\[\d+\]$/.test(n)))
      try { execSync(`7z x -y -o"${f}_x" "${f}" -ir!*.admx -ir!*.adml -ir!*.zip -ir![0] > /dev/null 2>&1`, { timeout: 60_000 }) } catch { }
    let admx = 0, adml = 0
    const base = join(tmp, 'x')
    for (const f of walkDir(base, IS_ADMX))
      placeFile(f.slice(base.length + 1), f, isOffice, collector) === 'admx' ? admx++ : adml++
    return { admx, adml }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

type Source = { getUrls: () => Promise<string[]> | string[]; office?: boolean; allowMissing?: boolean }
const src = (fn: () => Promise<string> | string, office?: boolean): Source =>
  ({ getUrls: async () => [await fn()], ...(office ? { office: true } : {}) })
const srcAll = (fn: () => Promise<string[]>): Source => ({ getUrls: fn })

const sources: Source[] = [
  src(() => 'https://dl.google.com/dl/edgedl/chrome/policy/policy_templates.zip'),
  src(() => 'https://dl.google.com/update2/enterprise/googleupdateadmx.zip'),
  src(() => 'https://brave-browser-downloads.s3.brave.com/latest/policy_templates.zip'),
  src(() => 'https://ardownload2.adobe.com/pub/adobe/reader/win/AcrobatDC/misc/ReaderADMTemplate.zip'),
  src(() => 'https://ardownload2.adobe.com/pub/adobe/acrobat/win/AcrobatDC/misc/AcrobatADMTemplate.zip'),
  src(() => 'https://download.microsoft.com/download/72ea16a9-4cc9-4032-945d-3a56a483d034/WindowsNotepadAdminTemplates.cab'),
  src(() => msDownload(108428)),
  src(() => msDownload(49030, url => url.includes('x64')), true),
  src(() => msDownload(55319, url => /Security Baseline\.zip$/i.test(url))),
  src(() => 'https://web.archive.org/web/20200723045549/https://msdnshared.blob.core.windows.net/media/2016/10/MSS-legacy.zip'),
  src(() => githubRelease('microsoft', 'PowerToys', /GroupPolicyObjectFiles.*\.zip$/i)),
  { getUrls: async () => [await lenovoPolicyTemplateDownload()], allowMissing: true },
  src(() => dellCommandUpdateDownload()),
  src(async () => {
    const article = 'https://www.sparklabs.com/support/kb/article/deploy-viscosity-windows-under-a-gpo-group-policy-environment/'
    const html = await fetchText(article)
    const match = html.match(/href="(admx_templates_v[0-9-]+)"[^>]*>\s*admx_templates_v[0-9.]+\.zip/i)
    if (!match) throw new Error('No Viscosity ADMX templates link found')
    return new URL(match[1], article).href
  }),
  src(() => msDownload(105674)),
  src(() => msDownload(104405)),
  srcAll(() => msDownloadUrls(105938)),
  src(() => githubRelease('mozilla', 'policy-templates', /\.zip$/i)),
  src(() => githubRelease('microsoft', 'winget-cli', /DesktopAppInstallerPolicies\.zip/i)),
  src(() => githubRelease('EUCweb', 'BIS-F')),
  src(() => 'https://api.github.com/repos/CollaboraOnline/ADMX/zipball/master'),
  src(() => githubRelease('Romanitho', 'Winget-AutoUpdate', /\.zip$/i)),
  src(() => githubRelease('Weatherlights', 'Winget-AutoUpdate-Intune', /\.zip$/i)),
  src(() => githubRelease('PSAppDeployToolkit', 'PSAppDeployToolkit', /PSAppDeployToolkit_ModuleOnly.zip/i)),
  src(() => githubRelease('systmworks', 'Adobe-DC-ADMX')),
  src(() => githubRelease('Harvester57', 'Security-ADMX')),
  src(() => 'https://api.github.com/repos/pseymour/MakeMeAdmin/zipball/master'),
  src(() => resolveRedirects('https://aka.ms/fslogix/download')),
  src(() => resolveRedirects('https://aka.ms/avdgpo')),
  src(async () => {
    const products = await fetchJson('https://edgeupdates.microsoft.com/api/products?view=enterprise')
    const policy = products.find((product: any) => product.Product === 'Policy')
    return policy.Releases.sort((a: any, b: any) => b.ProductVersion.localeCompare(a.ProductVersion))[0].Artifacts[0].Location
  }),
  src(async () => {
    const data = await fetchJson('https://code.visualstudio.com/sha?build=stable')
    return data.products.find((product: any) => product.platform?.os === 'win32-x64-archive').url
  }),
  src(() => resolveRedirects('https://go.microsoft.com/fwlink/?linkid=844652')),
  src(async () => {
    const html = await fetchText('https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065466',
      { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' })
    const urls = [...html.matchAll(/https:\/\/assets\.zoom\.us\/docs\/msi-templates\/Zoom_[\d.]+\.zip/g)]
    if (!urls.length) throw new Error('No Zoom link found')
    return urls[urls.length - 1][0]
  }),
  src(async () => {
    const html = await fetchText('https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064784',
      { 'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' })
    const urls = [...html.matchAll(/https:\/\/assets\.zoom\.us\/docs\/msi-templates\/Zoom_VDI_[\d.]+\.zip/g)]
    if (!urls.length) throw new Error('No Zoom VDI link found')
    return urls[urls.length - 1][0]
  }),
  src(async () => {
    const html = await fetchText('https://support.1password.com/mobile-device-management/')
    const match = html.match(/https:\/\/c\.1password\.com\/dist\/1P\/win\d+\/1Password-admx-templates[-\d.]+\.zip/i)
    if (!match) throw new Error('No 1Password ADMX link found')
    return match[0]
  }),
  src(async () => {
    const ini = await fetchText('https://devolutions.net/products.htm')
    const match = ini.match(/RDM7zX64\.Url=(https:\/\/[^\s]+)/i)
    if (!match) throw new Error('No RDM 7z URL found')
    return match[1]
  }),
  src(async () => {
    const html = await fetchText('https://slack.com/intl/en-au/help/articles/11906214948755-Manage-desktop-app-configurations')
    const match = html.match(/href="(https:\/\/slack\.zendesk\.com\/hc\/[^"]*article_attachments\/[^"]*)"/)
    if (!match) throw new Error('No Slack ADMX attachment found')
    return match[1]
  }),
  src(async () => {
    const html = await fetchText('https://www.citrix.com/downloads/workspace-app/windows/workspace-app-for-windows-latest.html')
    const match = html.match(/\/\/downloads\.citrix\.com\/\d+\/CitrixWorkspace_ADMX_Files\.zip\?__gda__=[^"' ]+/)
    if (!match) throw new Error('No Citrix ADMX link found')
    return 'https:' + match[0].replace(/&amp;/g, '&')
  }),
  srcAll(async () => [
    'https://raw.githubusercontent.com/microsoft/WSL/master/intune/WSL.admx',
    'https://raw.githubusercontent.com/microsoft/WSL/master/intune/en-US/WSL.adml',
  ]),
]

function downloadAndExtract(buf: Buffer, isOffice: boolean, collector?: string[]) {
  if (buf[0] === 0x50 && buf[1] === 0x4B) {
    try { return extractZip(buf, isOffice, collector) } catch { }
  }
  return extract7z(buf, isOffice, collector)
}

async function fetchSource(source: Source, idx: number, total: number) {
  const urls = await source.getUrls()
  let admx = 0, adml = 0
  const fileSlugToDownloadUrl: Record<string, string> = {}
  for (const url of urls) {
    const urlCollector: string[] = []
    const pathname = new URL(url).pathname
    if (/\.(admx|adml)$/i.test(pathname)) {
      placeFile(pathname.split('/').pop()!, await download(url), false, urlCollector) === 'admx' ? admx++ : adml++
      console.log(`[${idx + 1}/${total}] ${url}`)
      for (const slug of urlCollector) fileSlugToDownloadUrl[slug] = url
      continue
    }
    const buf = await download(url)
    console.log(`[${idx + 1}/${total}] ${url} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`)
    const result = downloadAndExtract(buf, !!source.office, urlCollector)
    admx += result.admx; adml += result.adml
    for (const slug of urlCollector) fileSlugToDownloadUrl[slug] = url
  }
  console.log(`  ${admx} ADMX, ${adml} ADML`)
  if ((admx === 0 || adml === 0) && !source.allowMissing) throw new Error('Missing ADMX or ADML files')
  return { ok: true as const, admx, adml, fileSlugToDownloadUrl }
}

async function main() {
  const list = filter ? sources.filter((_, i) => String(i + 1) === filter) : sources
  if (filter && !list.length) { console.error(`Unknown source "${filter}". Use 1-${sources.length}.`); process.exit(1) }
  mkdirSync(ADMX_DIR, { recursive: true })
  mkdirSync(ADML_CACHE, { recursive: true })
  console.log(`Fetching ${list.length} source(s) (concurrency: ${CONCURRENCY})...\n`)

  const results = await runWithLimit(list, CONCURRENCY, async (s) => {
    const idx = sources.indexOf(s)
    try { return await fetchSource(s, idx, list.length) }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[${idx + 1}/${list.length}] FAILED: ${msg}`)
      return { ok: false as const, error: msg }
    }
  })

  // Build download-sources mapping (fileSlug → actual download URL)
  const downloadSources: Record<string, string> = {}
  for (const result of results) {
    if (result.ok) {
      for (const [slug, url] of Object.entries(result.fileSlugToDownloadUrl)) {
        downloadSources[slug] = url
      }
    }
  }

  const dataDir = join(ROOT, 'public', 'data')
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(join(dataDir, 'download-sources.json'), JSON.stringify(downloadSources, null, 2))
  console.log(`\nWrote download-sources.json (${Object.keys(downloadSources).length} entries)`)

  const ok = results.filter(r => r.ok) as { ok: true; admx: number; adml: number; fileSlugToDownloadUrl: Record<string, string> }[]
  const failed = results.filter(r => !r.ok) as { ok: false; error: string }[]
  console.log(`\nDone: ${ok.length}/${results.length} succeeded`)
  if (ok.length) console.log(`Total: ${ok.reduce((s, r) => s + r.admx, 0)} ADMX, ${ok.reduce((s, r) => s + r.adml, 0)} ADML`)
  if (failed.length) for (const f of failed) console.log(`Failed: ${f.error}`)
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
