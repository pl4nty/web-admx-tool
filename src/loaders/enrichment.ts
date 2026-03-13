import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface EnrichmentData {
  ddf: Record<string, any>
  graph: Record<string, any>
}

export function loadEnrichment(dataDir: string): EnrichmentData {
  const ddfPath = join(dataDir, 'ddf-mappings.json')
  const graphPath = join(dataDir, 'graph-enrichment.json')

  const ddfRaw = existsSync(ddfPath) ? JSON.parse(readFileSync(ddfPath, 'utf8')) : {}
  const ddf: Record<string, any> = {}
  for (const [k, v] of Object.entries(ddfRaw)) {
    ddf[String(k).toLowerCase()] = v
  }

  const graph = existsSync(graphPath) ? JSON.parse(readFileSync(graphPath, 'utf8')) : {}
  return { ddf, graph }
}

export function enrichPolicy(
  policy: any,
  fileSlug: string,
  enrichment: EnrichmentData
): { csp: any; catalog: any } {
  const { ddf, graph } = enrichment
  const fullKey = policy.key ? `${policy.key}\\${policy.valueName || ''}`.toLowerCase() : null
  const policyKey = `${fileSlug}/${policy.name}`.toLowerCase()
  const csp = (fullKey && ddf[fullKey]) ? ddf[fullKey] : ddf[policyKey] || null
  const catalog = graph[fileSlug]?.[policy.name] || null
  return { csp, catalog }
}
