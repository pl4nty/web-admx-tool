<template>
    <span v-if="version" class="badge text-bg-info border" :title="`Version ${version}`">
        <i class="bi bi-tag me-1"></i>v{{ version }}
    </span>
</template>

<script setup>
import { useAdmx } from '../composables/useAdmx'

const props = defineProps({
    file: { type: String, required: true }
})

const { getVersion } = useAdmx()

const version = computed(() => getVersion(props.file))
</script>
