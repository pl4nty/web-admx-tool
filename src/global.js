import { toArray, listToTree, removeEmptyCategories } from './utils/array'

const policyObject = ref({})

const scope = ref('machine')

const _lang = ref(null)
const lang = computed({
    get() {
        if (_lang.value !== null && langs.value.includes(_lang.value)) {
            return _lang.value
        }
        return langs.value[0] ?? null
    },
    set(val) {
        _lang.value = val
    }
})

const curPolicy = ref(null)

const getPolicy = policyIdOrIdx => {
    let policy = policyIdOrIdx

    if (typeof policyIdOrIdx === 'number') {
        policy = allPolicies.value[policyIdOrIdx]
    } else if (typeof policyIdOrIdx === 'string') {
        policy = allPolicies.value.find(p => p.id === policyIdOrIdx)
    }

    if (!policy) {
        return null
    }

    return {
        item: policy.item,
        file: policy.file,
        id: policy.id,
        scope: policy.scope
    }
}

const curConfig = ref({
    enabled: null,
    comment: '',
    config: {}
})

const resetConfig = () => {
    curConfig.value = {
        enabled: null,
        comment: '',
        config: {}
    }
}

const updateConfig = () => {
    const cfg = {
        ...curConfig.value,
        id: curPolicy.value.id
    }
    if (cfg.enabled !== true) {
        cfg.config = {}
    }
    const idx = configs.value.findIndex(i => i.id === cfg.id)
    if (idx >= 0) {
        if (cfg.enabled === null) {
            configs.value.splice(idx, 1)
        } else {
            configs.value.splice(idx, 1, cfg)
        }
    } else if (cfg.enabled !== null) {
        configs.value.push(cfg)
    }
}

const configs = ref([])

const getResourceObject = file => {
    if (!lang.value) {
        return null
    }
    if (policyObject.value[file][lang.value]) {
        return policyObject.value[file][lang.value]
    }
    for (const l of langs.value) {
        if (policyObject.value[file][l]) {
            return policyObject.value[file][l]
        }
    }
}

const langs = computed(() => {
    const s = new Set()
    const l = Object.values(policyObject.value).map(i => Object.keys(i))
    l.forEach(i => i.forEach(j => s.add(j)))

    const languages = [...s].filter(i => i !== 'policy')
    languages.sort((a, b) => a.localeCompare(b))

    let idx = languages.findIndex(i => i === 'zh-cn')
    if (idx >= 0) {
        languages.unshift(languages.splice(idx, 1)[0])
    }

    idx = languages.findIndex(i => i === 'en-us')
    if (idx >= 0) {
        languages.unshift(languages.splice(idx, 1)[0])
    }
    return languages
})

const getStringVal = (file, templateString) => {
    if (!templateString || !lang.value) {
        return null
    }
    let resources =
        getResourceObject(file).policyDefinitionResources.resources.stringTable
            .string
    resources = toArray(resources)

    const id = templateString.substring(
        '$(string.'.length,
        templateString.length - 1
    )
    return resources.find(i => i.id === id)['#text']
}

const getPresentationVal = (file, templateString) => {
    if (!templateString || !lang.value) {
        return null
    }
    let resources =
        getResourceObject(file).policyDefinitionResources.resources
            .presentationTable.presentation
    resources = toArray(resources)

    const id = templateString.substring(
        '$(presentation.'.length,
        templateString.length - 1
    )
    return resources.find(i => i.id === id)
}

const categories = computed(() => {
    try {
        const results = []
        Object.keys(policyObject.value).forEach(file => {
            console.log('Loading', file)
            let categories =
                policyObject.value[file].policy.policyDefinitions.categories
                    ?.category
            const namespace =
                policyObject.value[file].policy.policyDefinitions
                    .policyNamespaces.target.prefix
            categories = toArray(categories)
            categories.forEach(i => {
                let parent = i.parentCategory?.ref ?? null
                if (parent && !parent.includes(':')) {
                    parent = namespace + ':' + parent
                }
                results.push({
                    isCategory: true,
                    file,
                    namespace: namespace,
                    parent,
                    fullName: namespace + ':' + i.name,
                    display: getStringVal(file, i.displayName),
                    explain: getStringVal(file, i.explainText)
                })
            })
        })
        results.sort((a, b) => a.display.localeCompare(b.display))
        return results
    } catch (err) {
        console.error(err)
        return []
    }
})

const allPolicies = computed(() => {
    try {
        const results = []
        Object.keys(policyObject.value).forEach(file => {
            let policies =
                policyObject.value[file].policy.policyDefinitions.policies
                    ?.policy
            const namespace =
                policyObject.value[file].policy.policyDefinitions
                    .policyNamespaces.target.prefix
            policies = toArray(policies)
            policies.forEach(i => {
                let parent = i.parentCategory?.ref ?? null
                if (parent && !parent.includes(':')) {
                    parent = namespace + ':' + parent
                }
                const scopes =
                    i.class?.toLowerCase() === 'both'
                        ? ['user', 'machine']
                        : [i.class?.toLowerCase() ?? 'machine']
                scopes.forEach(scope => {
                    results.push({
                        isCategory: false,
                        file,
                        scope,
                        namespace: namespace,
                        parent,
                        item: i,
                        id: `${scope}:${file}:${i.name}`,
                        fullName: `${namespace}:${i.name}`,
                        display: getStringVal(file, i.displayName),
                        explain: getStringVal(file, i.explainText)
                    })
                })
            })
        })
        results.sort((a, b) => a.display.localeCompare(b.display))
        return results
    } catch (err) {
        console.error(err)
        return []
    }
})

const policies = computed(() => {
    return allPolicies.value.filter(
        i => i.scope?.toLowerCase() === scope.value.toLowerCase()
    )
})

const treeData = computed(() => {
    const d = [...categories.value, ...policies.value]
    const tree = listToTree(
        d,
        e => e.parent,
        e => e.fullName
    )
    return removeEmptyCategories(tree)
})

export const useGlobal = () => {
    return {
        policyObject,
        langs,
        lang,
        scope,
        configs,
        curPolicy,
        curConfig,
        treeData,

        getStringVal,
        getPresentationVal,
        getPolicy,
        resetConfig,
        updateConfig,

        categories,
        allPolicies,
        policies
    }
}
