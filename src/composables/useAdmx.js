// Shared reactive state (module-level singleton)
const rawData = ref({})
const versions = ref({})
const loading = ref(false)
const error = ref(null)

const scope = ref('machine')
const _lang = ref(null)

// Ensure a value is always an array
const toArr = o => (Array.isArray(o) ? o : o ? [o] : [])

// Derive available languages from loaded data
const langs = computed(() => {
    const set = new Set()
    for (const fileData of Object.values(rawData.value)) {
        for (const key of Object.keys(fileData)) {
            if (key !== 'policy') set.add(key)
        }
    }
    const list = [...set].sort()
    // Prioritise en-us, then zh-cn
    for (const preferred of ['zh-cn', 'en-us']) {
        const idx = list.findIndex(l => l === preferred)
        if (idx > 0) list.unshift(list.splice(idx, 1)[0])
    }
    return list
})

const lang = computed({
    get() {
        if (_lang.value && langs.value.includes(_lang.value)) return _lang.value
        return langs.value[0] ?? null
    },
    set(val) {
        _lang.value = val
    }
})

// Get the resource object (ADML data) for a file in the current language
const getResources = file => {
    const fileData = rawData.value[file]
    if (!fileData) return null
    const l = lang.value
    if (l && fileData[l]) return fileData[l]
    for (const key of Object.keys(fileData)) {
        if (key !== 'policy') return fileData[key]
    }
    return null
}

// Resolve $(string.XXX) references
const resolveString = (file, templateRef) => {
    if (!templateRef) return ''
    if (!templateRef.startsWith('$(string.')) return templateRef
    const id = templateRef.slice(9, -1)
    const resources = getResources(file)
    if (!resources) return templateRef
    const strings = toArr(
        resources.policyDefinitionResources?.resources?.stringTable?.string
    )
    return strings.find(s => s.id === id)?.['#text'] ?? templateRef
}

// Resolve $(presentation.XXX) references – returns the raw presentation object
const resolvePresentation = (file, templateRef) => {
    if (!templateRef?.startsWith('$(presentation.')) return null
    const id = templateRef.slice(15, -1)
    const resources = getResources(file)
    if (!resources) return null
    const presentations = toArr(
        resources.policyDefinitionResources?.resources?.presentationTable
            ?.presentation
    )
    return presentations.find(p => p.id === id) ?? null
}

// ── Categories ────────────────────────────────────────────────────────────────

const categories = computed(() => {
    const result = []
    for (const [file, fileData] of Object.entries(rawData.value)) {
        const defs = fileData.policy?.policyDefinitions
        if (!defs) continue
        const namespace = defs.policyNamespaces?.target?.prefix
        for (const cat of toArr(defs.categories?.category)) {
            let parent = cat.parentCategory?.ref ?? null
            if (parent && !parent.includes(':')) parent = `${namespace}:${parent}`
            result.push({
                isCategory: true,
                file,
                namespace,
                name: cat.name,
                fullName: `${namespace}:${cat.name}`,
                parent,
                display: resolveString(file, cat.displayName),
                explain: cat.explainText
                    ? resolveString(file, cat.explainText)
                    : null,
                children: []
            })
        }
    }
    result.sort((a, b) => (a.display || '').localeCompare(b.display || ''))
    return result
})

// ── Policies ──────────────────────────────────────────────────────────────────

const allPolicies = computed(() => {
    const result = []
    for (const [file, fileData] of Object.entries(rawData.value)) {
        const defs = fileData.policy?.policyDefinitions
        if (!defs) continue
        const namespace = defs.policyNamespaces?.target?.prefix
        for (const policy of toArr(defs.policies?.policy)) {
            let parent = policy.parentCategory?.ref ?? null
            if (parent && !parent.includes(':')) parent = `${namespace}:${parent}`
            const cls = policy.class?.toLowerCase()
            const scopes = cls === 'both' ? ['machine', 'user'] : [cls ?? 'machine']
            for (const s of scopes) {
                result.push({
                    isCategory: false,
                    file,
                    namespace,
                    scope: s,
                    name: policy.name,
                    fullName: `${namespace}:${policy.name}`,
                    id: `${s}:${file}:${policy.name}`,
                    parent,
                    display: resolveString(file, policy.displayName),
                    explain: resolveString(file, policy.explainText),
                    raw: policy,
                    children: []
                })
            }
        }
    }
    result.sort((a, b) => (a.display || '').localeCompare(b.display || ''))
    return result
})

const policies = computed(() =>
    allPolicies.value.filter(p => p.scope === scope.value)
)

// ── Tree ──────────────────────────────────────────────────────────────────────

function buildTree(cats, pols) {
    const nodes = [...cats.map(c => ({ ...c, children: [] })), ...pols.map(p => ({ ...p, children: [] }))]
    const byFullName = {}
    for (const n of nodes) byFullName[n.fullName] = n

    const roots = []
    for (const n of nodes) {
        const parent = n.parent ? byFullName[n.parent] : null
        if (parent) {
            parent.children.push(n)
        } else {
            roots.push(n)
        }
    }

    // Remove categories that have no policy descendants
    function countPolicies(node) {
        if (!node.isCategory) return 1
        let total = 0
        for (const child of node.children) total += countPolicies(child)
        node._policyCount = total
        return total
    }
    for (const r of roots) countPolicies(r)

    function prune(nodes) {
        return nodes.filter(n => {
            if (!n.isCategory) return true
            n.children = prune(n.children)
            return n._policyCount > 0
        })
    }
    return prune(roots)
}

const treeData = computed(() => buildTree(categories.value, policies.value))

// ── Version lookup ────────────────────────────────────────────────────────────

function getVersion(file) {
    if (!versions.value || !file) return null
    // Try exact match, then case-insensitive
    for (const [key, val] of Object.entries(versions.value)) {
        if (key.toLowerCase() === file.toLowerCase()) {
            const v = val?.Version
            if (!v) return null
            if (typeof v === 'string') return v
            const { Major, Minor, Build } = v
            if (Major === undefined && Minor === undefined && Build === undefined) return null
            return [Major, Minor, Build].filter(x => x !== undefined && x >= 0).join('.')
        }
    }
    return null
}

// ── Loading ───────────────────────────────────────────────────────────────────

async function loadDefault() {
    loading.value = true
    error.value = null
    try {
        const [dataRes, versionsRes] = await Promise.all([
            fetch('admx.json'),
            fetch('admxversions.json').catch(() => null)
        ])
        if (dataRes.ok) {
            const data = await dataRes.json()
            rawData.value = data
            defaultData.value = data
        }
        if (versionsRes?.ok) versions.value = await versionsRes.json()
    } catch (e) {
        error.value = e.message
    } finally {
        loading.value = false
    }
}

function mergeData(additionalData) {
    rawData.value = { ...rawData.value, ...additionalData }
}

function replaceUserData(userTemplates) {
    // Rebuild rawData from the default loaded data plus user templates
    // This is called when a user template is removed
    const merged = { ...defaultData.value }
    for (const tpl of userTemplates) Object.assign(merged, tpl.data)
    rawData.value = merged
}

// Snapshot of the default server-loaded data (before any user uploads)
const defaultData = ref({})

// ── Public API ────────────────────────────────────────────────────────────────

export function useAdmx() {
    return {
        rawData,
        versions,
        loading,
        error,
        scope,
        lang,
        langs,
        categories,
        allPolicies,
        policies,
        treeData,
        resolveString,
        resolvePresentation,
        getVersion,
        loadDefault,
        mergeData,
        replaceUserData,
        toArr
    }
}
