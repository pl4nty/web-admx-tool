import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { parseAdmx, parseAdml, resolveAdmxStrings } from '../parser'
import { readXmlFile, discoverLanguages, buildAdmlLookup, findAdmlFile, runWithLimit, walkDir } from '../admxUtils'
import { loadEnrichment, enrichPolicy } from './enrichment'
import { buildCategoryTree } from './treeBuilder'
import { MINISEARCH_OPTS } from '../searchConfig'
import MiniSearch from 'minisearch'
import type { Loader } from 'astro/loaders'

const BUILD_JOBS = Math.max(1, Number(process.env.BUILD_JOBS || 8))

function buildInputSignature(admxDir: string, admlCacheDir: string, outDir: string) {
  const files = [
    ...walkDir(admxDir, name => name.endsWith('.admx') || name.endsWith('.adml')),
    ...walkDir(admlCacheDir, name => name.endsWith('.adml')),
  ]
  for (const f of ['ddf-mappings.json', 'graph-enrichment.json']) {
    const p = join(outDir, f)
    if (existsSync(p)) files.push(p)
  }
  files.sort()
  const hash = createHash('sha1')
  for (const f of files) {
    const stat = statSync(f)
    hash.update(f + stat.size + stat.mtimeMs)
  }
  return { hash: hash.digest('hex'), fileCount: files.length }
}

function outputsExist(outDir: string, cacheDir: string) {
  return ['tree.json', 'translations.json', 'languages.json', 'stats.json']
    .every(f => existsSync(join(outDir, f)))
    && existsSync(join(cacheDir, 'policies.json'))
}

async function populateStore(entries: any[], store: any, parseData: any, generateDigest: any) {
  const nextKeys = new Set(entries.map((e: any) => e.id))
  for (const key of store.keys()) {
    if (!nextKeys.has(key)) store.delete(key)
  }
  for (const entry of entries) {
    const { id, ...data } = entry
    const parsed = await parseData({ id, data })
    store.set({ id, data: parsed, digest: generateDigest(parsed) })
  }
}

export function admxPolicyLoader(): Loader {
  return {
    name: 'admx-policy-loader',
    async load({ store, logger, parseData, generateDigest, config }) {
      const rootPath = fileURLToPath(config.root)
      const admxDir = join(rootPath, 'admx')
      const admlCacheDir = join(rootPath, '.cache/adml')
      const outDir = join(rootPath, 'public/data')
      const cacheDir = join(rootPath, '.cache/build')
      const cacheFile = join(cacheDir, 'build-data.json')
      const isDev = process.env.NODE_ENV !== 'production'

      mkdirSync(outDir, { recursive: true })
      mkdirSync(cacheDir, { recursive: true })

      if (!existsSync(admxDir)) {
        logger.warn('admx/ directory not found — run fetch-admx.ts first')
        return
      }

      // Cache check
      const inputSig = buildInputSignature(admxDir, admlCacheDir, outDir)
      let cachedSig: any = null
      try { cachedSig = JSON.parse(readFileSync(cacheFile, 'utf8')) } catch { }

      if (process.env.FORCE_BUILD_DATA !== '1' && cachedSig?.hash === inputSig.hash && outputsExist(outDir, cacheDir)) {
        const policiesPath = join(cacheDir, 'policies.json')
        const entries = JSON.parse(readFileSync(policiesPath, 'utf8'))
        logger.info(`Loading ${entries.length} policies from cache (${inputSig.fileCount} inputs unchanged)`)
        await populateStore(entries, store, parseData, generateDigest)
        return
      }

      const start = Date.now()
      const admxFiles = readdirSync(admxDir).filter(f => f.endsWith('.admx'))
      const languages = discoverLanguages(admxDir, admlCacheDir)
      const enrichment = loadEnrichment(outDir)
      logger.info(`Parsing ${admxFiles.length} ADMX files, ${languages.length} languages`)
      logger.info(`Locales: ${languages.join(', ')}`)

      const allPolicies: Record<string, any> = {}
      const errors: Array<{ file: string; error: string }> = []

      // First pass: parse all ADMX
      await runWithLimit(admxFiles, BUILD_JOBS, async (file) => {
        const slug = basename(file, '.admx')
        try {
          allPolicies[slug] = { admx: await parseAdmx(readXmlFile(join(admxDir, file))), languages: {} }
        } catch (err) {
          errors.push({ file, error: err instanceof Error ? err.message : String(err) })
        }
      })

      // Build prefix↔namespace maps
      const prefixToNamespace: Record<string, string> = {}
      for (const data of Object.values(allPolicies) as any[]) {
        if (data.admx?.target?.prefix && data.admx?.target?.namespace)
          prefixToNamespace[String(data.admx.target.prefix).toLowerCase()] = data.admx.target.namespace
        for (const u of (data.admx?.using || []))
          if (u.prefix && u.namespace) prefixToNamespace[String(u.prefix).toLowerCase()] = u.namespace
      }

      // Second pass: parse ADML for each language and resolve strings
      for (const lang of languages) {
        const admlLookup = buildAdmlLookup(lang, admxDir, admlCacheDir)
        if (Object.keys(admlLookup).length === 0) continue
        await runWithLimit(Object.keys(allPolicies), BUILD_JOBS, async (slug) => {
          const admlPath = findAdmlFile(slug, admlLookup)
          if (!admlPath) {
            if (lang === 'en-us' && allPolicies[slug].admx?.policies?.length > 0)
              errors.push({ file: `${slug}.admx`, error: `Missing ADML file for ${lang}` })
            return
          }
          try {
            const resolved = resolveAdmxStrings(allPolicies[slug].admx, await parseAdml(readXmlFile(admlPath)))
            if (lang === 'en-us') {
              for (const cat of resolved.categories)
                if (cat.displayName?.includes('$(string.'))
                  errors.push({ file: `${lang}/${slug}.adml`, error: `Unresolved ref in category ${cat.name}: ${cat.displayName}` })
            }
            const namespace = allPolicies[slug].admx?.target?.namespace || slug
            allPolicies[slug].languages[lang.toLowerCase()] = {
              categories: resolved.categories,
              supportedOn: resolved.supportedOn,
              policies: resolved.policies.map((p: any) => {
                const { csp, catalog, downloadUrl } = enrichPolicy(p, slug, enrichment)
                return { ...p, csp, catalog, downloadUrl, namespace, fileSlug: slug, supportedOn: p.supportedOn || null }
              })
            }
          } catch (err) {
            errors.push({ file: `${lang}/${slug}.adml`, error: err instanceof Error ? err.message : String(err) })
          }
        })
      }

      const slugMeta: Record<string, { prefix: string; namespace: string }> = {}
      const preferredSlugForNamespace: Record<string, string> = {}
      const namespaceScores: Record<string, number> = {}
      for (const [slug, data] of Object.entries(allPolicies) as any[]) {
        const prefix = data.admx?.target?.prefix || slug
        const namespace = data.admx?.target?.namespace || slug
        slugMeta[slug] = { prefix, namespace }
        if (!data.admx?.target?.namespace) continue
        const langs = Object.keys(data.languages || {})
        const score = (langs.includes('en-us') ? 1000 : 0) + langs.length - (slug.toLowerCase().startsWith('staging_') ? 500 : 0)
        if (namespaceScores[namespace] === undefined || score > namespaceScores[namespace]) {
          namespaceScores[namespace] = score
          preferredSlugForNamespace[namespace] = slug
        }
      }

      const policyLangsByKey: Record<string, string[]> = {}
      for (const [slug, data] of Object.entries(allPolicies) as any[]) {
        for (const [langKey, langData] of Object.entries(data.languages || {}) as any[]) {
          for (const pol of (langData.policies || [])) {
            const key = `${pol.namespace}::${pol.name}`
              ; (policyLangsByKey[key] ??= []).includes(langKey) || policyLangsByKey[key].push(langKey)
            const ref = pol.supportedOn
            if (ref) {
              const [prefix, name] = ref.includes(':') ? ref.split(':') : [null, ref]
              let targetSlug = slug
              if (prefix) {
                const ns = prefixToNamespace[prefix.toLowerCase()]
                if (ns && preferredSlugForNamespace[ns]) targetSlug = preferredSlugForNamespace[ns]
              }
              const target = allPolicies[targetSlug]
              if (target) pol.supportedOn = (target.languages?.[langKey] || target.languages?.['en-us'])?.supportedOn?.[name!]?.displayName || ref
            }
          }
        }
      }

      const defaultLang = languages[0]?.toLowerCase() || 'en-us'
      const treeData = buildCategoryTree({
        allPolicies, slugMeta, prefixToNamespace,
        preferredSlugForNamespace, policyLangsByKey, defaultLang,
      })

      const translations: Record<string, any> = {}
      const policyEntries: any[] = []
      const searchLangs = isDev ? languages.filter(l => l === 'en-us' || l === 'de-de') : languages
      if (isDev && searchLangs.length < languages.length)
        logger.info(`Dev mode: indexing ${searchLangs.join(', ')} only`)
      const searchDocs: Record<string, any[]> = Object.fromEntries(searchLangs.map(l => [l, []]))
      let searchId = 0

      for (const [slug, data] of Object.entries(allPolicies) as any[]) {
        const { namespace } = slugMeta[slug]
        for (const [langKey, langData] of Object.entries(data.languages || {}) as any[]) {
          if (langKey !== 'en-us') {
            const translationLang = translations[langKey] ??= { categories: {}, policies: {} }
            const catTranslations = translationLang.categories[slug] ??= {}
            for (const cat of (langData.categories || [])) catTranslations[cat.name] = cat.displayName || cat.name
            const polTranslations = translationLang.policies[namespace] ??= {}
            for (const pol of (langData.policies || [])) polTranslations[pol.name] = pol.displayName || pol.name
          }
          for (const pol of (langData.policies || [])) {
            const availableLangs = policyLangsByKey[`${namespace}::${pol.name}`] || [langKey]
            policyEntries.push({
              id: `${langKey}/${namespace}/${pol.name}`, name: pol.name, displayName: pol.displayName || '',
              explainText: pol.explainText || '', class: pol.class || '', key: pol.key || '',
              valueName: pol.valueName || '', supportedOn: pol.supportedOn || '',
              parentCategory: pol.parentCategory || '', categoryPath: pol.categoryPath || [],
              elements: pol.elements || [], presentationElements: pol.presentationElements || [],
              enabledValue: pol.enabledValue || null, disabledValue: pol.disabledValue || null,
              csp: pol.csp || null, catalog: pol.catalog || null, downloadUrl: pol.downloadUrl || null,
              namespace, fileSlug: slug, lang: langKey, availableLangs,
            })
            if (searchDocs[langKey]) searchDocs[langKey].push({
              id: searchId++, fileSlug: slug, namespace, name: pol.name,
              displayName: pol.displayName || '', explainText: (pol.explainText || '').slice(0, 500),
              class: pol.class || '', key: pol.key || '', category: pol.parentCategory || '',
              cspUri: pol.csp?.uri || '', availableLangs,
            })
          }
        }
      }

      for (const langKey of searchLangs) {
        const index = new MiniSearch(MINISEARCH_OPTS)
        index.addAll(searchDocs[langKey])
        writeFileSync(join(outDir, `search-${langKey}.json`), JSON.stringify(index))
        logger.info(`Search [${langKey}]: ${searchDocs[langKey].length} docs`)
      }

      const totalPolicies = Object.values(allPolicies).reduce((sum, file: any) =>
        sum + ((Object.values(file.languages || {})[0] as any)?.policies?.length || 0), 0)
      const writeJson = (name: string, data: any) => writeFileSync(join(outDir, name), JSON.stringify(data))
      writeJson('tree.json', treeData)
      writeJson('translations.json', translations)
      writeJson('languages.json', languages)
      writeJson('stats.json', {
        fileCount: Object.keys(allPolicies).length, policyCount: totalPolicies,
        categoryCount: treeData.length, languageCount: languages.length,
      })
      writeFileSync(join(cacheDir, 'policies.json'), JSON.stringify(policyEntries))
      writeFileSync(cacheFile, JSON.stringify({ hash: inputSig.hash, fileCount: inputSig.fileCount }))

      await populateStore(policyEntries, store, parseData, generateDigest)

      logger.info(`Built ${policyEntries.length} policies from ${admxFiles.length} files in ${Date.now() - start}ms`)
      if (errors.length) {
        logger.warn(`${errors.length} warnings:`)
        for (const e of errors.slice(0, 5)) logger.warn(`  ${e.file}: ${e.error}`)
      }
    },
  }
}
