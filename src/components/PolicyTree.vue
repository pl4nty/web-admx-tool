<template>
    <div>
        <TreeNodes :nodes="treeData" />
    </div>
</template>

<script setup>
import TreeNodes from './TreeNodes.vue'
import { useAdmx } from '../composables/useAdmx'

const { treeData } = useAdmx()
</script>
