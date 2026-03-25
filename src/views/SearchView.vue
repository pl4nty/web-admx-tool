<script setup lang="ts">
const props = defineProps<{ lang?: string }>()
</script>

<template>
  <div class="p-6">
    <SearchResults :lang="props.lang" />
  </div>
</template>

<script lang="ts">
import SearchResults from '../components/SearchResults.vue'
export default { components: { SearchResults } }
</script>
