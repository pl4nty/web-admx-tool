/**
 * Builds the navigational category tree from parsed ADMX policy data.
 *
 * Handles cross-namespace parent resolution (e.g. a category in one ADMX
 * referencing a parent defined in another), namespace grouping, and
 * display-name path resolution for breadcrumbs.
 */

interface SlugMeta {
  prefix: string
  namespace: string
}

interface TreeBuildInput {
  allPolicies: Record<string, any>
  slugMeta: Record<string, SlugMeta>
  prefixToNamespace: Record<string, string>
  preferredSlugForNamespace: Record<string, string>
  policyLangsByKey: Record<string, string[]>
  defaultLang: string
}

export function buildCategoryTree(input: TreeBuildInput) {
  const {
    allPolicies, slugMeta, prefixToNamespace,
    preferredSlugForNamespace, policyLangsByKey, defaultLang,
  } = input

  const categoryNodes = new Map<string, any>()
  const categoryPaths = new Map<string, string[]>()
  const categoryNamePaths = new Map<string, string[]>()

  function resolveCategoryRef(ref: string, sourcePrefix: string): string | null {
    if (!ref) return null
    if (!ref.includes(':')) return `${sourcePrefix}:${ref}`
    const [prefix, name] = ref.split(':')
    const directKey = `${prefix}:${name}`
    if (categoryNodes.has(directKey)) return directKey
    const ns = prefixToNamespace[prefix.toLowerCase()]
    if (ns) {
      const targetSlug = preferredSlugForNamespace[ns]
      const targetPrefix = targetSlug ? allPolicies[targetSlug]?.admx?.target?.prefix : null
      if (targetPrefix) {
        const normalizedKey = `${targetPrefix}:${name}`
        if (categoryNodes.has(normalizedKey)) return normalizedKey
      }
    }
    const localKey = `${sourcePrefix}:${name}`
    return categoryNodes.has(localKey) ? localKey : directKey
  }

  function buildPath(
    map: Map<string, string[]>,
    nodeKey: string,
    getter: (n: any) => string,
    visited = new Set<string>()
  ): string[] {
    if (visited.has(nodeKey)) return []
    if (map.has(nodeKey)) return map.get(nodeKey)!
    const node = categoryNodes.get(nodeKey)
    if (!node) return []
    visited.add(nodeKey)
    const parentKey = node.parentRef ? resolveCategoryRef(node.parentRef, node.sourcePrefix) : null
    const path = [...(parentKey ? buildPath(map, parentKey, getter, visited) : []), getter(node)]
    map.set(nodeKey, path)
    return path
  }

  // Register categories from all policy files
  for (const [slug, data] of Object.entries(allPolicies)) {
    const langData = data.languages[defaultLang]
    if (!langData && !data.admx?.categories) continue
    const { prefix, namespace } = slugMeta[slug]
    const rawCategories = data.admx?.categories || langData?.categories || []
    const displayMap = new Map(
      (langData?.categories as any[] || []).map((c: any) => [c.name, c.displayName || c.name])
    )
    for (const cat of rawCategories) {
      const key = `${prefix}:${cat.name}`
      if (!categoryNodes.has(key)) {
        categoryNodes.set(key, {
          id: key, name: cat.name,
          displayName: displayMap.get(cat.name) || cat.displayName,
          parentRef: cat.parentRef,
          sourceFile: slug, sourcePrefix: prefix, namespace,
          children: [], policies: [],
        })
      }
    }
  }

  // Build display-name and raw-name paths for breadcrumbs
  for (const key of categoryNodes.keys()) {
    buildPath(categoryPaths, key, n => n.displayName || n.name)
    buildPath(categoryNamePaths, key, n => n.name)
  }

  // Assign category paths to every policy in every language
  for (const [slug, data] of Object.entries(allPolicies)) {
    const { prefix } = slugMeta[slug]
    for (const [, langData] of Object.entries(data.languages) as any[]) {
      const displayMap = new Map(
        (langData.categories as any[]).map((c: any) => [c.name, c.displayName || c.name])
      )
      for (const pol of langData.policies as any[]) {
        if (!pol.parentCategory) continue
        const ref = resolveCategoryRef(pol.parentCategory, prefix)
        if (ref) {
          pol.categoryPath = (categoryNamePaths.get(ref) || []).map(
            name => displayMap.get(name) || name
          )
        }
      }
    }
  }

  // Assign policies to tree nodes (default language only)
  for (const [slug, data] of Object.entries(allPolicies)) {
    const langData = data.languages[defaultLang]
    if (!langData) continue
    const { prefix, namespace } = slugMeta[slug]
    for (const pol of langData.policies) {
      if (!pol.parentCategory) continue
      const ref = resolveCategoryRef(pol.parentCategory, prefix)
      if (!ref) continue
      const node = categoryNodes.get(ref)
      if (node) {
        const catPath = categoryPaths.get(ref) || []
        const fullPath = catPath.join('/')
        node.policies.push({
          name: pol.name, displayName: pol.displayName, class: pol.class,
          slug: fullPath ? `${fullPath}/${pol.displayName || pol.name}` : (pol.displayName || pol.name),
          namespace, policyName: pol.name,
          availableLangs: policyLangsByKey[`${namespace}::${pol.name}`] || ['en-us'],
        })
      }
    }
  }

  // Wire parent→child hierarchy
  for (const node of categoryNodes.values()) {
    if (!node.parentRef) continue
    const parentKey = resolveCategoryRef(node.parentRef, node.sourcePrefix)
    const parent = parentKey ? categoryNodes.get(parentKey) : null
    if (parent) { parent.children.push(node); node._hasParent = true }
  }

  // Group root nodes by namespace
  const roots = [...categoryNodes.values()].filter(n => !n._hasParent)
  const namespaceGroups = new Map<string, any[]>()
  const GROUP_OVERRIDES: Record<string, string> = { 'AddHard.Policies.AddHard': 'Security ADMX' }

  function namespaceGroup(ns: string): string {
    if (/^Adobe\./i.test(ns)) return 'AdobeDC'
    if (/(\.Office\.|^Office\.|Office\.Microsoft\.Policies\.Windows)/i.test(ns)) return 'Microsoft.Office'
    return ns || 'Other'
  }

  for (const root of roots) {
    const key = namespaceGroup(root.namespace)
    if (!namespaceGroups.has(key)) namespaceGroups.set(key, [])
    namespaceGroups.get(key)!.push(root)
  }

  const finalRoots: any[] = []
  for (const [ns, nodes] of namespaceGroups) {
    if (nodes.length === 1 && ns !== 'Microsoft.Office' && ns !== 'AdobeDC') {
      finalRoots.push(...nodes)
    } else {
      finalRoots.push({
        id: `ns:${ns}`, name: ns,
        displayName: GROUP_OVERRIDES[ns] || (ns === 'AdobeDC' ? 'Adobe Acrobat' : ns.split('.').pop()),
        namespace: ns, sourceFile: nodes[0].sourceFile,
        children: nodes, policies: [],
      })
    }
  }

  // Clean tree for serialization
  const cmp = (a: any, b: any) => (a.displayName || a.name).localeCompare(b.displayName || b.name)
  function cleanTree(node: any): any {
    const children = node.children.map(cleanTree).sort(cmp)
    const policies = [...node.policies].sort(cmp)
    return {
      id: node.id, name: node.name, displayName: node.displayName,
      sourceFile: node.sourceFile, namespace: node.namespace,
      policies, children,
      policyCount: policies.length + children.reduce((s: number, c: any) => s + c.policyCount, 0),
    }
  }

  const tree = finalRoots.map(cleanTree).filter(n => n.policyCount > 0).sort(cmp)

  // Validate — no unresolved string refs should survive
  const treeJson = JSON.stringify(tree)
  const unresolvedRefs = [...treeJson.matchAll(/\$\(string\.(\w+)\)/g)].map(m => m[1])
  if (unresolvedRefs.length > 0) {
    throw new Error(`Found ${unresolvedRefs.length} unresolved string references: ${unresolvedRefs.slice(0, 5).join(', ')}`)
  }

  return tree
}
