<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

const props = defineProps<{ lang?: string }>()
const route = useRoute()

const currentLang = computed(() => props.lang || 'en-us')
const namespace = computed(() => route.params.namespace as string)
const policyName = computed(() => route.params.policyName as string)

const policy = ref<any>(null)
const loading = ref(true)
const error = ref('')

function fmtVal(val: any): string {
  if (!val) return 'Not set'
  if (val.type === 'decimal') return String(val.value)
  if (val.type === 'string') return String(val.value || '')
  if (val.type === 'delete') return 'Delete value'
  return String(val)
}

function linkify(text: string): string {
  return String(text || '').replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#0ea5e9;text-decoration:underline;text-underline-offset:2px;" target="_blank" rel="noopener noreferrer">$1</a>'
  )
}

const presentationByRef = computed(() => {
  const map = new Map<string, any>()
  for (const el of policy.value?.presentationElements || []) {
    if (el?.refId) map.set(el.refId, el)
  }
  return map
})

const presentationNotes = computed(() =>
  (policy.value?.presentationElements || []).filter(
    (el: any) => el?.type === 'text' && el?.label && !el?.refId
  )
)

const hasElements = computed(
  () => (policy.value?.elements?.length || 0) > 0
)

const hasExplicitValues = computed(
  () => Boolean(policy.value?.enabledValue || policy.value?.disabledValue)
)

const showStateFallback = computed(
  () =>
    !hasElements.value &&
    !hasExplicitValues.value &&
    (policy.value?.key || policy.value?.valueName)
)

function elemLabel(elem: any): string {
  return (
    presentationByRef.value.get(elem?.id)?.label ||
    elem?.label ||
    elem?.id ||
    'Value'
  )
}

function elemDefault(elem: any): string | null {
  const pres = presentationByRef.value.get(elem?.id)
  return pres?.defaultValue != null ? String(pres.defaultValue) : null
}

const catalogScope = computed(() => {
  if (!policy.value?.catalog?.id) return null
  const scopeAvailability = policy.value.catalog.scopeAvailability
  const policyClass = policy.value.class
  const scope =
    scopeAvailability === 'both'
      ? 'Device & User'
      : policyClass === 'Machine'
        ? 'Device only'
        : 'User only'
  const colorClasses =
    scopeAvailability === 'both'
      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      : policyClass === 'Machine'
        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
        : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  return { scope, colorClasses }
})

const title = computed(
  () =>
    `${policy.value?.displayName || policy.value?.name || 'Policy'} - ADMX Viewer`
)

async function loadPolicy() {
  loading.value = true
  error.value = ''
  policy.value = null
  try {
    const res = await fetch(
      `/data/policies-${currentLang.value}.json`
    )
    if (!res.ok) {
      // fallback to en-us
      if (currentLang.value !== 'en-us') {
        const fallback = await fetch('/data/policies-en-us.json')
        if (fallback.ok) {
          const data = await fallback.json()
          policy.value =
            data[`${namespace.value}/${policyName.value}`] || null
        }
      }
      if (!policy.value)
        error.value = 'Failed to load policy data.'
      return
    }
    const data = await res.json()
    const key = `${namespace.value}/${policyName.value}`
    policy.value = data[key] || null
    if (!policy.value) {
      // try en-us fallback
      if (currentLang.value !== 'en-us') {
        const fallback = await fetch('/data/policies-en-us.json')
        if (fallback.ok) {
          const fbData = await fallback.json()
          policy.value = fbData[key] || null
        }
      }
      if (!policy.value)
        error.value = `Policy "${policyName.value}" not found in namespace "${namespace.value}".`
    }
  } catch (err) {
    error.value = 'Failed to load policy data.'
    console.error(err)
  } finally {
    loading.value = false
    if (policy.value) {
      document.title = title.value
      sessionStorage.setItem(
        'admx:expand-target',
        `${namespace.value}::${policyName.value}`
      )
    }
  }
}

onMounted(loadPolicy)
watch([namespace, policyName, currentLang], loadPolicy)
</script>

<template>
  <div class="max-w-5xl w-full p-6">
    <div v-if="loading" class="text-gray-500 dark:text-gray-400 py-8">
      Loading policy...
    </div>
    <div v-else-if="error" class="text-red-500 py-8">{{ error }}</div>
    <template v-else-if="policy">
      <!-- Language badge -->
      <div
        v-if="currentLang !== 'en-us'"
        class="mb-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2"
      >
        <span
          class="inline-flex items-center px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
          >{{ currentLang.toUpperCase() }}</span
        >
        <router-link
          :to="`/en-us/policy/${namespace}/${policyName}`"
          class="text-blue-600 dark:text-blue-400 hover:underline"
          >View in English</router-link
        >
      </div>

      <!-- Policy header -->
      <div class="mb-6">
        <div
          class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2"
        >
          <span>{{ namespace }}</span><span>&bull;</span>
          <span
            :class="
              policy.class === 'Machine'
                ? 'text-blue-600'
                : policy.class === 'User'
                  ? 'text-green-600'
                  : 'text-purple-600'
            "
            >{{ policy.class }}</span
          >
        </div>
        <div class="flex items-start justify-between gap-4 mb-3">
          <h1 class="text-3xl font-bold dark:text-white break-words">
            {{ policy.displayName || policy.name }}
          </h1>
          <a
            v-if="policy.downloadUrl"
            :href="policy.downloadUrl"
            rel="noopener noreferrer"
            class="shrink-0 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download ADMX
          </a>
        </div>
        <div
          v-if="policy.explainText"
          class="prose dark:prose-invert max-w-none mb-6 text-gray-700 dark:text-gray-300"
        >
          <p class="whitespace-pre-wrap" v-html="linkify(policy.explainText)" />
        </div>
      </div>

      <!-- Policy Details -->
      <div
        class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6 transition-colors duration-0"
      >
        <h2 class="text-lg font-semibold mb-4 dark:text-white">
          Policy Details
        </h2>
        <dl class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt class="font-medium text-gray-500 dark:text-gray-400">
              Policy Name
            </dt>
            <dd class="text-gray-900 dark:text-white font-mono">
              {{ policy.name }}
            </dd>
          </div>
          <div v-if="policy.key" class="md:col-span-2">
            <dt class="font-medium text-gray-500 dark:text-gray-400">
              Registry Key
            </dt>
            <dd class="text-gray-900 dark:text-white font-mono break-all">
              {{ policy.key }}
            </dd>
          </div>
          <div v-if="policy.valueName">
            <dt class="font-medium text-gray-500 dark:text-gray-400">
              Value Name
            </dt>
            <dd class="text-gray-900 dark:text-white font-mono">
              {{ policy.valueName }}
            </dd>
          </div>
          <div v-if="policy.supportedOn">
            <dt class="font-medium text-gray-500 dark:text-gray-400">
              Supported On
            </dt>
            <dd class="text-gray-900 dark:text-white">
              {{ policy.supportedOn }}
            </dd>
          </div>

          <!-- CSP -->
          <div v-if="policy.csp?.uri" class="md:col-span-2">
            <dt class="font-medium text-gray-500 dark:text-gray-400">
              OMA-URI (CSP)
            </dt>
            <dd class="text-gray-900 dark:text-white">
              <div class="font-mono break-all text-sm">
                {{ policy.csp.uri }}
              </div>
              <div
                v-if="policy.csp.description"
                class="mt-1 text-sm text-gray-600 dark:text-gray-300"
                v-html="linkify(policy.csp.description)"
              />
              <div class="mt-3 space-y-1">
                <div
                  v-for="[label, value] in [
                    ['Access Types', policy.csp.accessTypes],
                    ['OS Build Version', policy.csp.osBuildVersion],
                    ['CSP Version', policy.csp.cspVersion],
                    [
                      'Conflict Resolution',
                      policy.csp.conflictResolution
                    ]
                  ].filter(([, v]) => v)"
                  :key="String(label)"
                  class="text-sm"
                >
                  <span
                    class="font-medium text-gray-600 dark:text-gray-400"
                    >{{ label }}:</span
                  >
                  <span class="text-gray-700 dark:text-gray-300 ml-1">{{
                    value
                  }}</span>
                </div>
                <div
                  v-if="policy.csp.editionAllowList?.length > 0"
                  class="text-sm"
                >
                  <span
                    class="font-medium text-gray-600 dark:text-gray-400"
                    >Allowed Editions:</span
                  >
                  <div class="flex flex-wrap gap-1 mt-1">
                    <span
                      v-for="ed in policy.csp.editionAllowList"
                      :key="ed"
                      class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                      >{{ ed }}</span
                    >
                  </div>
                </div>
              </div>
            </dd>
          </div>

          <!-- Settings Catalog -->
          <div v-if="catalogScope">
            <dt class="font-medium text-gray-500 dark:text-gray-400">
              Settings Catalog
            </dt>
            <dd class="flex items-center gap-2 flex-wrap">
              <span
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                >Available</span
              >
              <span
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                :class="catalogScope.colorClasses"
                >{{ catalogScope.scope }}</span
              >
            </dd>
          </div>

          <!-- Policy State Values -->
          <div
            v-if="policy.enabledValue || policy.disabledValue"
            class="md:col-span-2"
          >
            <dt class="font-medium text-gray-500 dark:text-gray-400">
              Policy State Values
            </dt>
            <dd class="text-sm text-gray-700 dark:text-gray-300">
              <div v-if="policy.enabledValue">
                Enabled:
                <span class="font-mono">{{
                  fmtVal(policy.enabledValue)
                }}</span>
              </div>
              <div v-if="policy.disabledValue">
                Disabled:
                <span class="font-mono">{{
                  fmtVal(policy.disabledValue)
                }}</span>
              </div>
            </dd>
          </div>

          <!-- Available Languages -->
          <div>
            <dt class="font-medium text-gray-500 dark:text-gray-400">
              Available Languages
            </dt>
            <dd class="flex flex-wrap gap-1 mt-1">
              <router-link
                v-for="availLang in policy.availableLangs"
                :key="availLang"
                :to="`/${availLang}/policy/${namespace}/${policyName}`"
                :class="[
                  'inline-block px-1.5 py-0.5 text-xs rounded',
                  availLang === currentLang
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900'
                ]"
              >
                {{ availLang }}
              </router-link>
            </dd>
          </div>
        </dl>
      </div>

      <!-- State fallback -->
      <div
        v-if="showStateFallback"
        class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 mb-6"
      >
        <h2 class="text-lg font-semibold mb-2 dark:text-white">
          Supported Values
        </h2>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          Simple Enabled/Disabled toggle controlling whether the value exists
          under the configured registry key.
        </p>
      </div>

      <!-- Configuration Elements -->
      <div
        v-if="hasElements"
        class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
      >
        <h2 class="text-lg font-semibold mb-4 dark:text-white">
          Configuration Elements
        </h2>
        <div
          v-if="presentationNotes.length > 0"
          class="mb-4 text-sm text-gray-600 dark:text-gray-300"
        >
          <p v-for="(n, i) in presentationNotes" :key="i" class="mb-2">
            {{ n.label }}
          </p>
        </div>
        <div class="space-y-4">
          <div
            v-for="(elem, i) in policy.elements"
            :key="i"
            class="border-t border-gray-200 dark:border-gray-700 pt-4 first:border-t-0 first:pt-0"
          >
            <h3
              class="font-medium text-gray-900 dark:text-white mb-1 break-words"
            >
              {{ elemLabel(elem) }}
            </h3>
            <p
              v-if="elem.type"
              class="text-sm text-gray-500 dark:text-gray-400"
            >
              Type: <span class="font-mono">{{ elem.type }}</span>
            </p>
            <p
              v-if="elemDefault(elem)"
              class="text-sm text-gray-500 dark:text-gray-400"
            >
              Default:
              <span class="font-mono">{{ elemDefault(elem) }}</span>
            </p>

            <!-- Enum -->
            <div
              v-if="elem.type === 'enum' && elem.items?.length > 0"
              class="mt-2 text-sm text-gray-600 dark:text-gray-300"
            >
              <div class="font-medium text-gray-700 dark:text-gray-200">
                Allowed Values
              </div>
              <ul class="mt-1 space-y-1">
                <li
                  v-for="(item, j) in elem.items"
                  :key="j"
                  class="flex flex-wrap gap-2"
                >
                  <span
                    class="font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700"
                    >{{ fmtVal(item.value) }}</span
                  >
                  <span class="text-sm">{{
                    item.displayName || 'Option'
                  }}</span>
                </li>
              </ul>
            </div>

            <!-- Boolean -->
            <div
              v-if="elem.type === 'boolean'"
              class="mt-2 text-sm text-gray-600 dark:text-gray-300"
            >
              <div class="flex flex-wrap gap-2">
                <span class="font-medium">True:</span>
                <span class="font-mono">{{ fmtVal(elem.trueValue) }}</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <span class="font-medium">False:</span>
                <span class="font-mono">{{ fmtVal(elem.falseValue) }}</span>
              </div>
            </div>

            <!-- Decimal / LongDecimal -->
            <div
              v-if="
                elem.type === 'decimal' || elem.type === 'longDecimal'
              "
              class="mt-2 text-sm text-gray-600 dark:text-gray-300"
            >
              <div v-if="elem.minValue !== undefined">
                Min: <span class="font-mono">{{ elem.minValue }}</span>
              </div>
              <div v-if="elem.maxValue !== undefined">
                Max: <span class="font-mono">{{ elem.maxValue }}</span>
              </div>
            </div>

            <!-- Text / MultiText -->
            <div
              v-if="elem.type === 'text' || elem.type === 'multiText'"
              class="mt-2 text-sm text-gray-600 dark:text-gray-300"
            >
              <div v-if="elem.maxLength !== undefined">
                Max length:
                <span class="font-mono">{{ elem.maxLength }}</span>
              </div>
              <div v-if="elem.expandable !== undefined">
                Expandable:
                <span class="font-mono">{{ String(elem.expandable) }}</span>
              </div>
            </div>

            <!-- List -->
            <div
              v-if="elem.type === 'list'"
              class="mt-2 text-sm text-gray-600 dark:text-gray-300"
            >
              <div v-if="elem.explicitValue !== undefined">
                Explicit values:
                <span class="font-mono">{{
                  String(elem.explicitValue)
                }}</span>
              </div>
              <div v-if="elem.additive !== undefined">
                Additive:
                <span class="font-mono">{{ String(elem.additive) }}</span>
              </div>
              <div v-if="elem.valuePrefix">
                Value prefix:
                <span class="font-mono">{{ elem.valuePrefix }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
