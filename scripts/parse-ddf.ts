import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { resolve, join, basename } from 'path'
import { unzipSync } from 'fflate'
import { parseXml } from '../src/parser'

const OUT_DIR = resolve(process.cwd(), 'public/data')
const CACHE_DIR = resolve(process.cwd(), '.cache/ddf')
const DDF_DOCS_URL = 'https://learn.microsoft.com/en-us/windows/client-management/mdm/configuration-service-provider-ddf'

const windowsProducts = new Map(
  Object.entries(JSON.parse(readFileSync(resolve(import.meta.dirname, 'windows-products.json'), 'utf8')) as Record<string, string>)
    .map(([k, v]) => [k.toLowerCase(), v])
)

const resolveEditions = (hex: string) =>
  hex.split(';').map(code => code.trim().toLowerCase()).filter(Boolean).map(code => windowsProducts.get(code) || code)

async function extractDdfDownloadUrl(): Promise<string> {
  const resp = await fetch(DDF_DOCS_URL)
  if (!resp.ok) throw new Error(`Failed to fetch docs page: HTTP ${resp.status}`)
  const html = await resp.text()
  const match = html.match(/https:\/\/download\.microsoft\.com\/download\/[^"'>\s]+\.zip/i)
  if (!match) throw new Error('Could not find DDF download URL in docs page')
  return match[0]
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })

const getVal = (obj: any, ...keys: string[]) => {
  for (const key of keys) {
    const value = obj?.[key]
    if (value == null) continue
    return typeof value === 'object' && value._text ? value._text : String(value)
  }
  return undefined
}

function walkDdfNodes(node: any, path = '', results: any[] = []) {
  if (!node) return results
  const nodes = [node.Node].flat().filter(Boolean)
  for (const child of nodes) {
    const name = child.NodeName?._text || child.NodeName || ''
    const cur = path ? `${path}/${name}` : name
    const dfp = child.DFProperties || {}
    const backing = child['MSFT:ADMXBacked'] || dfp['MSFT:ADMXBacked']
    const allowed = child['MSFT:AllowedValues'] || dfp['MSFT:AllowedValues']
    const admxBacked = backing || allowed?.['MSFT:AdmxBacked'] || allowed?.['MSFT:ADMXBacked']
    const gpMapping = child['MSFT:GpMapping'] || dfp['MSFT:GpMapping']

    if (admxBacked || gpMapping) {
      const app = dfp['MSFT:Applicability'] || {}
      const at = dfp.AccessType
      const entry: any = {
        uri: cur,
        description: (dfp.Description?._text || '').slice(0, 200),
        scope: dfp.Scope?._text || child.Scope?._text || 'Device',
      }
      if (admxBacked) {
        entry.admxFile = String(admxBacked.File || admxBacked.ADMXID || admxBacked.admxId || '').replace(/\.admx$/i, '')
        entry.admxArea = admxBacked.Area || admxBacked.area || ''
        entry.admxPolicy = admxBacked.PolicyName || admxBacked.policyName || admxBacked.Name || admxBacked.name || ''
      }
      if (gpMapping) {
        entry.gpName = gpMapping.GpEnglishName || ''
        entry.gpItemId = gpMapping.GpItemId || ''
        entry.gpAreaPath = gpMapping.GpAreaPath || ''
      }
      entry.osBuildVersion = getVal(app, 'MSFT:OsBuildVersion', 'MSFT:OSBuildVersion', 'OsBuildVersion')
      entry.cspVersion = getVal(app, 'MSFT:CspVersion', 'MSFT:CSPVersion', 'CspVersion')
      const editions = getVal(app, 'MSFT:EditionAllowList', 'EditionAllowList')
      if (editions) entry.editionAllowList = resolveEditions(editions)
      const cr = dfp['MSFT:ConflictResolution']
      if (cr) entry.conflictResolution = cr._text || cr
      if (at) {
        const types = ['Add', 'Delete', 'Get', 'Replace', 'Exec'].filter(t => at[t])
        if (types.length) entry.accessTypes = types.join(', ')
      }
      results.push(entry)
    }
    walkDdfNodes(child, cur, results)
  }
  return results
}

async function parseDdfFile(filePath: string) {
  const doc: any = await parseXml(readFileSync(filePath, 'utf8'))
  return walkDdfNodes(doc.MgmtTree || doc['oma-dm:MgmtTree'] || doc)
}

async function ensureDdfFiles() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
  const existing = readdirSync(CACHE_DIR).filter(f => f.endsWith('.xml') || f.endsWith('.ddf'))
  if (existing.length) return existing.map(f => join(CACHE_DIR, f))

  const ddfUrl = await extractDdfDownloadUrl()
  const resp = await fetch(ddfUrl, { redirect: 'follow' })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const files = unzipSync(new Uint8Array(await resp.arrayBuffer()), {
    filter: (file) => !file.name.endsWith('/') && /\.(xml|ddf)$/i.test(file.name)
  })
  const paths: string[] = []
  for (const [name, data] of Object.entries(files)) {
    const dest = join(CACHE_DIR, basename(name))
    writeFileSync(dest, data)
    paths.push(dest)
  }
  console.log(`Extracted ${paths.length} DDF files`)
  return paths
}

async function main() {
  const ddfFiles = await ensureDdfFiles()
  if (!ddfFiles.length) {
    writeFileSync(join(OUT_DIR, 'ddf-mappings.json'), '{}')
    return
  }

  const allMappings: Record<string, any> = {}
  let total = 0
  for (const file of ddfFiles) {
    try {
      for (const entry of await parseDdfFile(file)) {
        const key = entry.admxFile ? `${entry.admxFile}/${entry.admxPolicy}` : entry.uri
        allMappings[key] = entry
        total++
      }
    } catch (err) {
      console.error(`Error parsing ${file}:`, err instanceof Error ? err.message : err)
    }
  }

  writeFileSync(join(OUT_DIR, 'ddf-mappings.json'), JSON.stringify(allMappings, null, 2))
  console.log(`DDF mappings: ${total} entries from ${ddfFiles.length} files`)
}

main().catch(err => { console.error('DDF parsing failed:', err); process.exit(1) })
