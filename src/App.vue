<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import MiniSearch from 'minisearch'
import { MINISEARCH_OPTS } from './searchConfig'
import { policyUrl } from './policyUrl'
import Sidebar from './components/Sidebar.vue'

const router = useRouter()
const route = useRoute()

const currentLang = computed(
  () => (route.params.lang as string)?.toLowerCase() || 'en-us'
)

// Theme
const isDark = ref(false)
function applyTheme(dark: boolean) {
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
  const bg = dark ? 'rgb(17 24 39)' : 'rgb(249 250 251)'
  document.documentElement.style.backgroundColor = bg
  document.body.style.backgroundColor = bg
  localStorage.setItem('theme', dark ? 'dark' : 'light')
}
function toggleTheme() {
  applyTheme(!isDark.value)
}

// Sidebar
const sidebarOpen = ref(false)
function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}
function closeSidebar() {
  sidebarOpen.value = false
}

function onMainClick() {
  if (window.innerWidth < 1024 && sidebarOpen.value) {
    sidebarOpen.value = false
  }
}

// Sidebar resize
const sidebarResizing = ref(false)
function onResizeStart(e: PointerEvent) {
  if (window.innerWidth < 1024) return
  sidebarResizing.value = true
  e.preventDefault()
  const onMove = (ev: PointerEvent) => {
    if (!sidebarResizing.value) return
    const v = `${Math.min(Math.max(ev.clientX, 240), 520)}px`
    document.documentElement.style.setProperty('--sidebar-width', v)
    localStorage.setItem('sidebar-width', v)
  }
  const onUp = () => {
    sidebarResizing.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

// Scope selector
const selectedScope = ref('all')
function onScopeChange() {
  localStorage.setItem('scope', selectedScope.value)
  window.dispatchEvent(
    new CustomEvent('admx:scope-changed', { detail: selectedScope.value })
  )
}

// Language selector
const languages = ref<string[]>([])
function langDisplayName(lang: string): string {
  try {
    const dn = new Intl.DisplayNames([lang], { type: 'language' }).of(lang)
    return dn && dn !== lang
      ? dn.charAt(0).toUpperCase() + dn.slice(1)
      : lang.toUpperCase()
  } catch {
    return lang.toUpperCase()
  }
}
function onLangChange(e: Event) {
  const newLang = (e.target as HTMLSelectElement).value
  localStorage.setItem('lang', newLang)
  const path = route.path
  const langMatch = path.match(/^\/([a-z]{2}-[a-z0-9]{2,4})\//)
  if (langMatch) {
    router.push(path.replace(langMatch[0], `/${newLang}/`) + window.location.search)
  } else {
    router.push(`/${newLang}/`)
  }
}

// Header search
const searchQuery = ref('')
const searchDropdownVisible = ref(false)
const searchHits = ref<any[]>([])
let searchIndex: MiniSearch | null = null

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderSearch() {
  const q = searchQuery.value.trim()
  if (!q || !searchIndex) {
    searchHits.value = []
    searchDropdownVisible.value = false
    return
  }
  searchHits.value = searchIndex.search(q, { limit: 8 })
  searchDropdownVisible.value = searchHits.value.length > 0
}

function onSearchSubmit() {
  searchDropdownVisible.value = false
  router.push(
    `/${currentLang.value}/search${searchQuery.value.trim() ? `?q=${encodeURIComponent(searchQuery.value.trim())}` : ''}`
  )
}

function onSearchResultClick(hit: any) {
  searchDropdownVisible.value = false
  const ns = hit.namespace || hit.fileSlug
  const name = hit.name
  sessionStorage.setItem('admx:expand-target', `${ns}::${name}`)
  const langs: string[] = hit.availableLangs || []
  const url = policyUrl(ns, name, langs, currentLang.value)
  router.push(url)
}

function closeSearchDropdown() {
  searchDropdownVisible.value = false
}

// Flash notice
const flashNotice = ref('')

// Header height tracking
const headerRef = ref<HTMLElement | null>(null)
function updateHeaderHeight() {
  if (headerRef.value) {
    document.documentElement.style.setProperty(
      '--header-height',
      `${headerRef.value.offsetHeight}px`
    )
  }
}

let resizeObserver: ResizeObserver | null = null

async function loadSearchIndex(lang: string) {
  try {
    const res = await fetch(`/data/search-${lang}.json`)
    if (!res.ok) return
    searchIndex = MiniSearch.loadJS(await res.json(), MINISEARCH_OPTS)
  } catch {
    /* ignore */
  }
}

// Handle old-style URLs at root: ?Policy=Namespace::PolicyName
function handleLegacyRedirect() {
  const params = new URLSearchParams(window.location.search)
  const policy = params.get('Policy')
  const lang = (
    params.get('Language') ||
    localStorage.getItem('lang') ||
    'en-us'
  ).toLowerCase()

  if (policy?.includes('::')) {
    const sep = policy.indexOf('::')
    router.replace(
      `/${lang}/policy/${policy.slice(0, sep)}/${policy.slice(sep + 2)}`
    )
    return true
  }
  return false
}

watch(currentLang, async newLang => {
  searchIndex = null
  await loadSearchIndex(newLang)
})

onMounted(async () => {
  // Theme
  const saved = localStorage.getItem('theme')
  isDark.value =
    saved === 'dark' ||
    (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
  applyTheme(isDark.value)

  // Sidebar width
  const storedWidth = localStorage.getItem('sidebar-width')
  if (storedWidth)
    document.documentElement.style.setProperty('--sidebar-width', storedWidth)

  // Scope
  selectedScope.value = localStorage.getItem('scope') || 'all'

  // Languages
  try {
    const res = await fetch('/data/languages.json')
    if (res.ok) languages.value = await res.json()
  } catch {
    /* ignore */
  }

  // Search index
  await loadSearchIndex(currentLang.value)

  // Pre-fill search from URL
  const q = new URL(window.location.href).searchParams.get('q')
  if (q) searchQuery.value = q

  // Flash notice
  const flash = sessionStorage.getItem('admx:notice')
  if (flash) {
    sessionStorage.removeItem('admx:notice')
    flashNotice.value = flash
    setTimeout(() => {
      flashNotice.value = ''
    }, 4200)
  }

  // Header height
  updateHeaderHeight()
  if (headerRef.value) {
    resizeObserver = new ResizeObserver(updateHeaderHeight)
    resizeObserver.observe(headerRef.value)
  }

  // Handle legacy URL redirect
  if (route.path === '/' || route.path === '') {
    if (!handleLegacyRedirect()) {
      const lang =
        localStorage.getItem('lang') ||
        navigator.language?.toLowerCase() ||
        'en-us'
      router.replace(`/${lang}/`)
    }
  }

  // Global click to close search dropdown
  document.addEventListener('click', onDocClick)
})

function onDocClick(e: MouseEvent) {
  const container = document.getElementById('search-container')
  if (container && !container.contains(e.target as Node)) {
    closeSearchDropdown()
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div
    class="admx-shell min-h-screen bg-gray-50 dark:bg-gray-900 overflow-x-hidden transition-colors duration-0"
    :class="{ 'sidebar-resizing': sidebarResizing }"
  >
    <!-- Flash notice -->
    <div
      v-if="flashNotice"
      class="fixed top-16 right-4 z-50 max-w-sm rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
    >
      {{ flashNotice }}
    </div>

    <!-- Header -->
    <header
      ref="headerRef"
      class="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 transition-colors duration-0"
    >
      <div
        class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 md:h-14 md:flex-nowrap md:py-0 md:gap-x-4"
      >
        <button
          class="shrink-0 lg:hidden p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label="Toggle sidebar"
          @click="toggleSidebar"
        >
          <svg
            class="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        <router-link
          :to="`/${currentLang}/`"
          class="shrink-0 flex items-center gap-2 font-bold text-lg text-gray-900 dark:text-white no-underline hover:text-gray-700 dark:hover:text-gray-100 transition-colors"
        >
          <img src="/favicon.ico" alt="ADMX Viewer" class="w-6 h-6" />
          <span class="hidden sm:inline text-gray-900 dark:text-white"
            >ADMX Viewer</span
          >
        </router-link>

        <div
          id="search-container"
          class="order-last w-full md:order-none md:flex-1 md:max-w-xl"
        >
          <form class="relative" @submit.prevent="onSearchSubmit">
            <input
              v-model="searchQuery"
              type="search"
              placeholder="Search policies..."
              class="w-full text-sm bg-gray-50 border border-gray-300 text-gray-900 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
              @input="renderSearch"
              @focus="renderSearch"
            />
            <div
              v-if="searchDropdownVisible"
              class="absolute mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50"
            >
              <button
                v-for="hit in searchHits"
                :key="`${hit.namespace}-${hit.name}`"
                type="button"
                class="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 border-b last:border-b-0 border-gray-100 dark:border-gray-700"
                @click="onSearchResultClick(hit)"
              >
                <div class="text-sm text-gray-900 dark:text-white truncate">
                  {{ hit.displayName || hit.name }}
                </div>
                <div
                  class="text-xs text-gray-500 dark:text-gray-400 truncate"
                >
                  {{ hit.fileSlug || hit.namespace }}
                </div>
              </button>
            </div>
          </form>
        </div>

        <div class="shrink-0 flex items-center gap-2 ml-auto">
          <select
            v-model="selectedScope"
            class="text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 sm:px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
            @change="onScopeChange"
          >
            <option value="all">All</option>
            <option value="Machine">Computer</option>
            <option value="User">User</option>
          </select>

          <select
            :value="currentLang"
            class="text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-2 sm:px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
            @change="onLangChange"
          >
            <option
              v-for="lang in languages"
              :key="lang"
              :value="lang"
              :selected="lang === currentLang"
            >
              {{ langDisplayName(lang) }}
            </option>
          </select>

          <button
            class="shrink-0 p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
            title="Toggle dark mode"
            @click="toggleTheme"
          >
            <svg
              v-if="!isDark"
              class="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"
              />
            </svg>
            <svg
              v-else
              class="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fill-rule="evenodd"
                d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Sidebar -->
    <div
      class="admx-sidebar-overlay lg:hidden"
      :class="{ active: sidebarOpen }"
      @click="closeSidebar"
    />
    <aside
      class="admx-sidebar"
      :class="{ open: sidebarOpen }"
      style="
        top: var(--header-height, 3.5rem);
        height: calc(100vh - var(--header-height, 3.5rem));
      "
    >
      <div
        class="admx-sidebar-handle"
        title="Resize sidebar"
        @pointerdown="onResizeStart"
      />
      <Sidebar :lang="currentLang" />
    </aside>

    <!-- Main content -->
    <main class="admx-main" @click="onMainClick">
      <router-view :lang="currentLang" />
    </main>
  </div>
</template>
