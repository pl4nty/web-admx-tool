<template>
    <div>
        <!-- Empty state -->
        <template v-if="!curPolicy">
            <div class="text-center text-muted py-5">
                <i class="bi bi-arrow-left-circle fs-1 d-block mb-3"></i>
                <p class="mb-1 fw-semibold">Select a policy from the tree</p>
                <p class="small">
                    Browse categories on the left or
                    <span class="text-primary">search</span> for a policy.
                </p>
            </div>
        </template>

        <template v-else>
            <!-- Policy header -->
            <div class="border-bottom p-3">
                <div class="d-flex align-items-start justify-content-between gap-2 flex-wrap">
                    <div>
                        <h5 class="mb-1">{{ parsedPolicy?.title || curPolicy.display }}</h5>
                        <div class="d-flex flex-wrap gap-1 align-items-center">
                            <span class="badge text-bg-secondary">
                                <i class="bi bi-hdd me-1"></i>{{ curPolicy.scope }}
                            </span>
                            <span class="badge text-bg-light border">
                                {{ curPolicy.file }}.admx
                            </span>
                            <VersionBadge :file="curPolicy.file" />
                            <a
                                :href="admxHelpUrl"
                                target="_blank"
                                rel="noopener noreferrer"
                                class="badge text-bg-light border text-decoration-none"
                                title="View on admx.help"
                            >
                                <i class="bi bi-box-arrow-up-right me-1"></i>admx.help
                            </a>
                        </div>
                    </div>

                    <!-- Status badge -->
                    <span
                        v-if="configForPolicy"
                        class="badge fs-6"
                        :class="configForPolicy.enabled ? 'text-bg-success' : 'text-bg-danger'"
                    >
                        {{ configForPolicy.enabled ? 'Enabled' : 'Disabled' }}
                    </span>
                </div>
            </div>

            <!-- Explain text -->
            <div v-if="curPolicy.explain" class="p-3 border-bottom">
                <pre class="explain-text mb-0">{{ curPolicy.explain }}</pre>
            </div>

            <!-- Configuration form -->
            <div class="p-3">
                <PolicyForm />
            </div>
        </template>
    </div>
</template>

<script setup>
import { useAdmx } from '../composables/useAdmx'
import { useConfig } from '../composables/useConfig'
import PolicyForm from './PolicyForm.vue'
import VersionBadge from './VersionBadge.vue'

const { resolveString } = useAdmx()
const { curPolicy, configs, parsedPolicy } = useConfig()

const configForPolicy = computed(() =>
    configs.value.find(c => c.id === curPolicy.value?.id) ?? null
)

const admxHelpUrl = computed(() => {
    if (!curPolicy.value) return '#'
    const { namespace, name } = curPolicy.value
    return `https://admx.help/?Category=${namespace}&Policy=${namespace}~${name}`
})
</script>
