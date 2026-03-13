import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { resolve, join, basename } from 'path'
import { parseAdmx } from '../src/parser'
import { readXmlFile } from '../src/admxUtils'

const ADMX_DIR = resolve(process.cwd(), 'admx')
const OUT_DIR = resolve(process.cwd(), 'public/data')
const CACHE_DIR = resolve(process.cwd(), '.cache/graph')
mkdirSync(CACHE_DIR, { recursive: true })
mkdirSync(OUT_DIR, { recursive: true })

function loadEnvToken() {
  if (process.env.GRAPH_TOKEN) return
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const idx = line.indexOf('=')
    if (idx === -1 || line.trim().startsWith('#')) continue
    if (line.slice(0, idx).trim() === 'GRAPH_TOKEN')
      process.env.GRAPH_TOKEN = line.slice(idx + 1).trim()
  }
}

const cachePath = join(CACHE_DIR, 'settings-catalog.json')
const loadCache = (): Record<string, any> =>
  existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {}
const saveCache = (data: Record<string, any>) => writeFileSync(cachePath, JSON.stringify(data, null, 2))

const graphGet = async (path: string, token: string) => {
  const res = await fetch(`https://graph.microsoft.com/beta/deviceManagement/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  return res.ok ? res.json() : null
}
const queryById = (id: string, token: string) =>
  graphGet(`configurationSettings/${encodeURIComponent(id)}`, token)
const searchSetting = async (query: string, token: string) =>
  (await graphGet(`configurationSettings?$search=${encodeURIComponent(query)}`, token))?.value?.[0] || null

// Well-known Settings Catalog ID prefixes per ADMX slug
const CATALOG_PREFIXES: Record<string, string[]> = {
  chrome: ['vendor_msft_policy_config_chromeintunev1~policy~googlechrome_'],
  msedge: ['vendor_msft_policy_config_microsoftedge~policy~microsoft~'],
  onedrivengsc: ['vendor_msft_policy_config_onedrive~policy~'],
  visualstudio: ['vendor_msft_policy_config_visualstudiov1~policy~visualstudio~'],
}

async function tryWellKnownPrefixes(slug: string, policyName: string, policyClass: string, token: string) {
  const bases = CATALOG_PREFIXES[slug.toLowerCase()] || []
  const scopes = policyClass === 'Both' ? ['device_', 'user_'] : [policyClass === 'User' ? 'user_' : 'device_']
  for (const scope of scopes) {
    for (const base of bases) {
      const setting = await queryById(scope + base + policyName.toLowerCase(), token)
      if (!setting) continue
      if (policyClass === 'Both') {
        const other = await queryById((scope === 'device_' ? 'user_' : 'device_') + base + policyName.toLowerCase(), token)
        if (other) return { ...setting, scopeAvailability: 'both' }
      }
      return setting
    }
  }
  return null
}

async function main() {
  loadEnvToken()
  const token = process.env.GRAPH_TOKEN
  if (!token) {
    console.log('GRAPH_TOKEN not set — skipping Graph enrichment')
    writeFileSync(join(OUT_DIR, 'graph-enrichment.json'), '{}')
    return
  }
  if (!existsSync(ADMX_DIR)) {
    console.log('admx/ directory not found')
    writeFileSync(join(OUT_DIR, 'graph-enrichment.json'), '{}')
    return
  }

  const ddfPath = join(OUT_DIR, 'ddf-mappings.json')
  const ddfRaw = existsSync(ddfPath) ? JSON.parse(readFileSync(ddfPath, 'utf8')) : {}
  const ddfByPolicy: Record<string, any> = {}
  for (const [key, value] of Object.entries(ddfRaw)) ddfByPolicy[key.toLowerCase()] = value

  const cache = loadCache()
  const results: Record<string, Record<string, any>> = {}
  let hits = 0, misses = 0

  const admxFiles = readdirSync(ADMX_DIR).filter(f => f.endsWith('.admx'))
  console.log(`Enriching ${admxFiles.length} ADMX files...`)

  for (const fileName of admxFiles) {
    const slug = basename(fileName, '.admx')
    const admxPath = join(ADMX_DIR, fileName)
    let admx: any
    try { admx = await parseAdmx(readXmlFile(admxPath)) }
    catch { continue }
    const policies = admx.policies || []
    if (!policies.length) continue

    results[slug] = {}

    for (const pol of policies) {
      const cacheKey = `${slug}/${pol.name}`
      if (cache[cacheKey] !== undefined) {
        if (cache[cacheKey]) { results[slug][pol.name] = cache[cacheKey]; hits++ }
        continue
      }

      // Try DDF-based CSP ID
      let setting = null
      const ddfMatch = ddfByPolicy[`${slug}/${pol.name}`.toLowerCase()]
      if (ddfMatch?.uri)
        setting = await queryById(String(ddfMatch.uri).replace(/\//g, '_'), token)

      // Try well-known catalog prefixes
      if (!setting)
        setting = await tryWellKnownPrefixes(slug, pol.name, pol.class || 'Machine', token)

      // Fallback: search
      if (!setting)
        setting = await searchSetting(pol.name, token)

      if (setting) {
        const enriched = {
          id: setting.id,
          displayName: setting.displayName || '',
          description: setting.description?.slice(0, 200) || '',
          settingType: setting['@odata.type'] || '',
          inCatalog: true,
          ...(setting.scopeAvailability && { scopeAvailability: setting.scopeAvailability })
        }
        results[slug][pol.name] = enriched
        cache[cacheKey] = enriched
        hits++
      } else {
        cache[cacheKey] = null
        misses++
      }

      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }

  saveCache(cache)
  writeFileSync(join(OUT_DIR, 'graph-enrichment.json'), JSON.stringify(results, null, 2))
  console.log(`Graph enrichment: ${hits} found, ${misses} not found`)
}

main().catch(err => { console.error('Graph enrichment failed:', err); process.exit(1) })
