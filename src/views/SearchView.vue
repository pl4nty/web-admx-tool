<script setup lang="ts">
import SearchResults from '../components/SearchResults.vue'

defineProps<{ lang?: string }>()
</script>

<template>
  <div class="p-6">
    <SearchResults :lang="lang" />
  </div>
</template>
