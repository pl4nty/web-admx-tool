<script setup lang="ts">
import { ref, onMounted } from 'vue'

defineProps<{ lang?: string }>()

const stats = ref<{
  fileCount: number
  policyCount: number
  categoryCount: number
  languageCount: number
} | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    const res = await fetch('/data/stats.json')
    if (res.ok) stats.value = await res.json()
  } catch {
    /* ignore */
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="max-w-4xl p-6">
    <h1 class="text-3xl font-bold mb-2 dark:text-white">ADMX Viewer</h1>
    <p class="text-gray-600 dark:text-gray-400 mb-6">
      Browse, search, and inspect Group Policy settings from ADMX/ADML files.
      An open-source replacement for admx.help - just replace admx.help with
      gpedit.tplant.com.au in your existing links.
    </p>

    <div v-if="loading" class="text-gray-500 dark:text-gray-400">
      Loading statistics...
    </div>
    <div v-else-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div
        v-for="item in [
          { value: stats.fileCount, label: 'ADMX Files' },
          { value: stats.policyCount, label: 'Policies' },
          { value: stats.categoryCount, label: 'Categories' },
          { value: stats.languageCount, label: 'Languages' }
        ]"
        :key="item.label"
        class="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700"
      >
        <div class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ item.value }}
        </div>
        <div class="text-sm text-gray-500 dark:text-gray-400">
          {{ item.label }}
        </div>
      </div>
    </div>

    <p class="text-sm text-gray-500 dark:text-gray-400">
      Found a bug or have a suggestion?
      <a
        href="https://github.com/pl4nty/web-admx-tool/issues"
        class="text-blue-600 dark:text-blue-400 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
        >Open an issue on GitHub</a
      >. Created by
      <a
        href="https://github.com/pl4nty"
        class="text-blue-600 dark:text-blue-400 hover:underline"
        target="_blank"
        rel="noopener noreferrer"
        >Tom Plant</a
      >.
    </p>
  </div>
</template>
