import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

export { readXmlFile } from './parser'

export function canonicalLang(lang: string): string | null {
  const normalized = lang.toLowerCase().replace('_', '-')
  if (normalized === 'adm') return null
  const aliases: Record<string, string> = {
    en: 'en-us', de: 'de-de', es: 'es-es', fr: 'fr-fr', hu: 'hu-hu',
    it: 'it-it', ja: 'ja-jp', ko: 'ko-kr', nl: 'nl-nl', pl: 'pl-pl',
    ru: 'ru-ru', sv: 'sv-se', tr: 'tr-tr',
  }
  const mapped = aliases[normalized] || normalized
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})+$/i.test(mapped) ? mapped : null
}

export function discoverLanguages(...dirs: string[]): string[] {
  const langs: string[] = []
  for (const baseDir of dirs) {
    if (!existsSync(baseDir)) continue
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(baseDir, entry.name)
      const hasAdml = readdirSync(dir).some((f) => f.endsWith('.adml'))
      if (!hasAdml) continue
      const canonical = canonicalLang(entry.name)
      if (canonical) langs.push(canonical)
    }
  }
  return [...new Set(langs)].sort((a, b) =>
    a === 'en-us' ? -1 : b === 'en-us' ? 1 : a.localeCompare(b)
  )
}

export function buildAdmlLookup(lang: string, ...dirs: string[]): Record<string, string> {
  const lookup: Record<string, string> = {}
  for (const baseDir of dirs) {
    if (!existsSync(baseDir)) continue
    const candidates = readdirSync(baseDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && canonicalLang(e.name) === lang)
      .sort((a, b) => (a.name.toLowerCase() === lang ? 0 : 1) - (b.name.toLowerCase() === lang ? 0 : 1) || a.name.localeCompare(b.name))
    for (const dirEntry of candidates) {
      const langPath = join(baseDir, dirEntry.name)
      for (const f of readdirSync(langPath)) {
        if (!f.endsWith('.adml')) continue
        const key = f.replace('.adml', '').toLowerCase()
        if (!lookup[key]) lookup[key] = join(langPath, f)
      }
    }
  }
  return lookup
}

export function findAdmlFile(slug: string, admlLookup: Record<string, string>): string | null {
  const key = slug.toLowerCase()
  return admlLookup[key]
    || admlLookup[key.replace(/[-_]/g, char => char === '-' ? '_' : '-')]
    || null
}

export async function runWithLimit<T, R = void>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}


export function walkDir(dir: string, filter: (name: string) => boolean, results: string[] = []): string[] {
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(full, filter, results)
    } else if (filter(entry.name)) {
      results.push(full)
    }
  }
  return results
}
