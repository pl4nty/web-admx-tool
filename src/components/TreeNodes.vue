<template>
    <ul class="list-unstyled mb-0">
        <li v-for="node in nodes" :key="node.fullName" class="tree-node">
            <!-- Category -->
            <template v-if="node.isCategory">
                <button class="tree-category-btn" @click="toggle(node.fullName)">
                    <i
                        class="bi me-1 text-muted"
                        :class="expanded[node.fullName] ? 'bi-chevron-down' : 'bi-chevron-right'"
                        style="font-size: 0.7rem"
                    ></i>
                    <i class="bi bi-folder2 me-1 text-warning"></i>
                    <span>{{ node.display }}</span>
                    <span class="badge text-bg-secondary ms-auto" style="font-size: 0.65rem">
                        {{ node._policyCount }}
                    </span>
                </button>
                <div v-show="expanded[node.fullName]" class="tree-children">
                    <TreeNodes :nodes="node.children" />
                </div>
            </template>

            <!-- Policy leaf -->
            <template v-else>
                <button
                    class="tree-policy-btn"
                    :class="{ active: activeId === node.id }"
                    @click="selectPolicy(node)"
                    :title="node.display"
                >
                    <i class="bi bi-file-earmark me-1 text-muted"></i>
                    <span
                        class="d-inline-block text-truncate"
                        style="max-width: 220px; vertical-align: middle"
                    >
                        {{ node.display }}
                    </span>
                    <span
                        v-if="configStatus(node.id) !== null"
                        class="badge ms-1"
                        :class="configStatus(node.id) ? 'text-bg-success' : 'text-bg-danger'"
                        style="font-size: 0.6rem"
                    >
                        {{ configStatus(node.id) ? 'On' : 'Off' }}
                    </span>
                </button>
            </template>
        </li>
    </ul>
</template>

<script setup>
import { useConfig } from '../composables/useConfig'

const props = defineProps({
    nodes: { type: Array, default: () => [] }
})

const { curPolicy, configs } = useConfig()

const expanded = ref({})

function toggle(fullName) {
    expanded.value[fullName] = !expanded.value[fullName]
}

const activeId = computed(() => curPolicy.value?.id ?? null)

function selectPolicy(node) {
    curPolicy.value = node
}

function configStatus(id) {
    const cfg = configs.value.find(c => c.id === id)
    if (!cfg) return null
    return cfg.enabled
}
</script>
