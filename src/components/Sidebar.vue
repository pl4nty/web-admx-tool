<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import TreeNode from './TreeNode.vue'

const props = defineProps<{ lang?: string }>()

const treeFilter = ref('')
const tree = ref<any[]>([])
const loading = ref(true)
const selectedScope = ref('all')
const activePolicyTarget = ref('')
const currentLang = computed(() => props.lang || 'en-us')

function applyTranslations(nodes: any[], translations: any, lang: string): any[] {
  if (!translations?.[lang]) return nodes
  const langTranslations = translations[lang]
  return nodes.map((node) => ({
    ...node,
    displayName: langTranslations.categories?.[node.sourceFile]?.[node.name] || node.displayName,
    policies: (node.policies || []).map((pol: any) => ({
      ...pol,
      displayName: langTranslations.policies?.[pol.namespace]?.[pol.policyName] || pol.displayName,
    })),
    children: node.children?.length ? applyTranslations(node.children, translations, lang) : node.children,
  }))
}

function filterTree(nodes: any[], scope: string, query: string): any[] {
  return nodes.reduce((acc: any[], node) => {
    const policies = (node.policies || []).filter((p: any) =>
      (scope === 'all' || p.class === scope || p.class === 'Both') &&
      (!query || p.displayName?.toLowerCase().includes(query))
    )
    const children = filterTree(node.children || [], scope, query)
    const policyCount = policies.length + children.reduce((s, c) => s + (c.policyCount || 0), 0)
    if (policyCount === 0 && !(query && node.displayName?.toLowerCase().includes(query))) return acc
    acc.push({ ...node, policies, children, policyCount })
    return acc
  }, [])
}

const filteredTree = computed(() => filterTree(tree.value, selectedScope.value, treeFilter.value.toLowerCase()))

function handleScopeChanged(event: Event) {
  selectedScope.value = (event as CustomEvent<string>).detail || 'all'
}

onMounted(async () => {
  selectedScope.value = localStorage.getItem('scope') || 'all'
  activePolicyTarget.value = sessionStorage.getItem('admx:expand-target') || ''
  window.addEventListener('admx:scope-changed', handleScopeChanged as EventListener)

  try {
    const [treeRes, translationsRes] = await Promise.all([
      fetch('/data/tree.json'),
      currentLang.value !== 'en-us' ? fetch('/data/translations.json') : Promise.resolve(null)
    ])
    if (!treeRes.ok) throw new Error(`Failed to load tree: ${treeRes.status}`)
    let treeData = await treeRes.json()
    if (currentLang.value !== 'en-us' && translationsRes?.ok)
      treeData = applyTranslations(treeData, await translationsRes.json(), currentLang.value)
    tree.value = treeData
  } catch (err) {
    console.error('Sidebar: Failed to load tree:', err)
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('admx:scope-changed', handleScopeChanged as EventListener)
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="p-3 border-b border-gray-200 dark:border-gray-700">
      <input v-model="treeFilter" type="text" placeholder="Filter tree..."
        class="w-full text-sm bg-gray-50 border border-gray-300 text-gray-900 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400 focus:ring-green-800 focus:border-green-800" />
    </div>
    <nav class="flex-1 overflow-y-auto px-2 pb-4">
      <div v-if="loading" class="text-center py-8 text-gray-500 dark:text-gray-400">Loading policies...</div>
      <ul v-else-if="filteredTree.length" class="space-y-1">
        <TreeNode v-for="node in filteredTree" :key="node.id" :node="node" :lang="currentLang" :activeTarget="activePolicyTarget" />
      </ul>
      <div v-else class="text-center py-8 text-gray-400 text-sm">No policies found</div>
    </nav>
  </div>
</template>

