import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface EnrichmentData {
  ddf: Record<string, any>
  graph: Record<string, any>
  downloadSources: Record<string, string>
}

export function loadEnrichment(dataDir: string): EnrichmentData {
  const ddfPath = join(dataDir, 'ddf-mappings.json')
  const graphPath = join(dataDir, 'graph-enrichment.json')
  const downloadSourcesPath = join(dataDir, 'download-sources.json')

  const ddfRaw = existsSync(ddfPath) ? JSON.parse(readFileSync(ddfPath, 'utf8')) : {}
  const ddf: Record<string, any> = {}
  for (const [k, v] of Object.entries(ddfRaw)) {
    ddf[String(k).toLowerCase()] = v
  }

  const graph = existsSync(graphPath) ? JSON.parse(readFileSync(graphPath, 'utf8')) : {}
  const downloadSources = existsSync(downloadSourcesPath) ? JSON.parse(readFileSync(downloadSourcesPath, 'utf8')) : {}
  return { ddf, graph, downloadSources }
}

export function enrichPolicy(
  policy: any,
  fileSlug: string,
  enrichment: EnrichmentData
): { csp: any; catalog: any; downloadUrl: string | null } {
  const { ddf, graph, downloadSources } = enrichment
  const fullKey = policy.key ? `${policy.key}\\${policy.valueName || ''}`.toLowerCase() : null
  const policyKey = `${fileSlug}/${policy.name}`.toLowerCase()
  const csp = (fullKey && ddf[fullKey]) ? ddf[fullKey] : ddf[policyKey] || null
  const catalog = graph[fileSlug]?.[policy.name] || null
  const downloadUrl = downloadSources[fileSlug] || null
  return { csp, catalog, downloadUrl }
}
