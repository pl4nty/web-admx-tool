<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, shallowRef } from 'vue'
import MiniSearch from 'minisearch'
import { MINISEARCH_OPTS } from '../searchConfig'
import { policyUrl } from '../policyUrl'

const props = defineProps<{ lang?: string }>()
const currentLang = ref('en-us')
const query = ref('')
const results = ref<any[]>([])
const page = ref(1)
const loading = ref(false)
const index = shallowRef<MiniSearch | null>(null)

async function loadIndex(lang: string) {
  if (loading.value || index.value) return
  loading.value = true
  try {
    const res = await fetch(`/data/search-${lang}.json`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    index.value = MiniSearch.loadJS(await res.json(), MINISEARCH_OPTS)
  } catch (err) {
    console.error('Failed to load search index:', err)
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  results.value = query.value && index.value ? index.value.search(query.value, { limit: 200 }) : []
}

function syncFromUrl() {
  query.value = (new URL(window.location.href).searchParams.get('q') || '').trim()
  search()
}

onMounted(async () => {
  currentLang.value = props.lang || localStorage.getItem('lang') || 'en-us'
  query.value = (new URL(window.location.href).searchParams.get('q') || '').trim()
  await loadIndex(currentLang.value)
  search()
  window.addEventListener('popstate', syncFromUrl)
})

watch(query, search)
onBeforeUnmount(() => window.removeEventListener('popstate', syncFromUrl))

const pagedResults = computed(() => results.value.slice((page.value - 1) * 20, page.value * 20))
const totalPages = computed(() => Math.ceil(results.value.length / 20))

function resultUrl(result: any) {
  return policyUrl(result.namespace || result.fileSlug, result.name, result.availableLangs, currentLang.value)
}

function onResultClick(result: any) {
  const ns = result.namespace || result.fileSlug
  if (ns && result.name) sessionStorage.setItem('admx:expand-target', `${ns}::${result.name}`)
}
</script>

<template>
  <div class="max-w-4xl">
    <h1 class="text-2xl font-bold mb-4 dark:text-white">Search Results</h1>
    <p v-if="query && !loading" class="text-gray-500 dark:text-gray-400 mb-6">
      {{ results.length }} results for "<span class="font-medium text-gray-900 dark:text-white">{{ query }}</span>"
    </p>
    <div v-if="loading" class="text-gray-500">Loading search index...</div>
    <div v-else-if="!results.length && query" class="text-gray-500">No results found.</div>
    <div v-else-if="!query" class="text-gray-500">Type a query in the search box above.</div>
    <div v-else class="space-y-3">
      <a v-for="r in pagedResults" :key="`${r.fileSlug}-${r.name}`" :href="resultUrl(r)" @click="onResultClick(r)"
        class="block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-green-800 dark:hover:border-green-600 transition-colors">
        <div class="font-medium text-gray-900 dark:text-white">{{ r.displayName || r.name }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
          <span :class="r.class === 'Machine' ? 'text-blue-500' : r.class === 'User' ? 'text-green-600' : 'text-purple-500'">{{ r.class || 'Unknown' }}</span>
          <span class="mx-1">&middot;</span>
          <span>{{ r.fileSlug || r.namespace }}</span>
        </div>
      </a>
    </div>
    <div v-if="totalPages > 1" class="flex flex-wrap justify-center gap-2 mt-6">
      <button v-for="p in totalPages" :key="p" @click="page = p"
        :class="['px-3 py-1 rounded text-sm', p === page ? 'bg-green-800 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600']">
        {{ p }}
      </button>
    </div>
  </div>
</template>
