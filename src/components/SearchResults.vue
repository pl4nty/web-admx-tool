<template>
    <div class="p-3">
        <div class="d-flex align-items-center justify-content-between mb-3">
            <h6 class="mb-0">
                <i class="bi bi-search me-2"></i>
                {{ searchResults.length }} result{{ searchResults.length !== 1 ? 's' : '' }}
                for "<strong>{{ query }}</strong>"
            </h6>
            <button class="btn btn-sm btn-outline-secondary" @click="query = ''">
                <i class="bi bi-x me-1"></i>Clear
            </button>
        </div>

        <div v-if="searchResults.length === 0" class="text-muted text-center py-4">
            <i class="bi bi-emoji-neutral fs-2 d-block mb-2"></i>
            No policies found.
        </div>

        <div
            v-for="policy in searchResults"
            :key="policy.id"
            class="list-group-item list-group-item-action search-result-item rounded mb-1 p-2"
            @click="selectPolicy(policy)"
        >
            <div class="d-flex justify-content-between align-items-start">
                <div class="flex-grow-1 me-2">
                    <div class="fw-semibold small">{{ policy.display }}</div>
                    <div class="text-muted" style="font-size: 0.75rem; line-height: 1.3">
                        <i class="bi bi-folder2 me-1"></i>{{ policy.file }}.admx
                        &nbsp;·&nbsp;
                        <i class="bi bi-hdd me-1"></i>{{ policy.scope }}
                    </div>
                    <div
                        v-if="policy.explain"
                        class="text-muted text-truncate"
                        style="font-size: 0.75rem; max-width: 500px"
                    >
                        {{ policy.explain }}
                    </div>
                </div>
                <span class="badge text-bg-secondary flex-shrink-0">{{ policy.namespace }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useSearch } from '../composables/useSearch'
import { useConfig } from '../composables/useConfig'

const { query, searchResults } = useSearch()
const { curPolicy } = useConfig()

function selectPolicy(policy) {
    curPolicy.value = policy
    query.value = ''
}
</script>
