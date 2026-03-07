<template>
    <!-- Config Management Modal -->
    <div
        class="modal fade"
        id="configModal"
        tabindex="-1"
        aria-labelledby="configModalLabel"
        aria-hidden="true"
    >
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="configModalLabel">
                        <i class="bi bi-gear me-2"></i>Configurations
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>

                <div class="modal-body">
                    <!-- Actions -->
                    <div class="d-flex gap-2 mb-3">
                        <button class="btn btn-sm btn-outline-primary" @click="exportConfigs">
                            <i class="bi bi-download me-1"></i>Export JSON
                        </button>
                        <button class="btn btn-sm btn-outline-secondary" @click="importConfigs">
                            <i class="bi bi-upload me-1"></i>Import JSON
                        </button>
                    </div>

                    <ul class="nav nav-tabs mb-3" id="configTabs">
                        <li class="nav-item">
                            <button class="nav-link" :class="{ active: tab === 'configs' }" @click="tab = 'configs'">
                                <i class="bi bi-list-check me-1"></i>Configurations
                                <span class="badge text-bg-secondary ms-1">{{ configs.length }}</span>
                            </button>
                        </li>
                        <li class="nav-item">
                            <button class="nav-link" :class="{ active: tab === 'registry' }" @click="tab = 'registry'">
                                <i class="bi bi-table me-1"></i>Registry entries
                            </button>
                        </li>
                    </ul>

                    <!-- Configurations tab -->
                    <div v-if="tab === 'configs'">
                        <div v-if="configs.length === 0" class="text-center text-muted py-4">
                            <i class="bi bi-inbox fs-2 d-block mb-2"></i>
                            No configurations saved yet.
                        </div>

                        <div
                            v-for="cfg in configs"
                            :key="cfg.id"
                            class="card mb-2"
                        >
                            <div class="card-body py-2">
                                <div class="d-flex justify-content-between align-items-start">
                                    <div>
                                        <div class="fw-semibold">{{ titleForConfig(cfg.id) }}</div>
                                        <div class="text-muted small">
                                            {{ cfg.id.split(':')[1] }}.admx &nbsp;·&nbsp;
                                            {{ cfg.id.split(':')[0] }}
                                        </div>
                                    </div>
                                    <div class="d-flex gap-1 align-items-center">
                                        <span class="badge" :class="cfg.enabled ? 'text-bg-success' : cfg.enabled === false ? 'text-bg-danger' : 'text-bg-secondary'">
                                            {{ cfg.enabled ? 'Enabled' : cfg.enabled === false ? 'Disabled' : 'Not configured' }}
                                        </span>
                                        <button class="btn btn-sm btn-outline-danger" @click="removeConfig(cfg.id)">
                                            <i class="bi bi-trash"></i>
                                        </button>
                                    </div>
                                </div>

                                <div v-if="cfg.comment" class="text-muted small mt-1">
                                    <i class="bi bi-chat me-1"></i>{{ cfg.comment }}
                                </div>

                                <!-- Config values -->
                                <div v-if="Object.keys(cfg.config).length > 0" class="mt-2">
                                    <table class="table table-sm table-borderless mb-0" style="font-size: 0.8rem">
                                        <tbody>
                                            <tr v-for="(val, key) in cfg.config" :key="key">
                                                <td class="text-muted py-0" style="width: 40%">{{ labelForProp(cfg.id, key) }}</td>
                                                <td class="py-0">{{ displayVal(cfg.id, key, val) }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Registry tab -->
                    <div v-if="tab === 'registry'">
                        <div v-if="parsedRegs.length === 0" class="text-center text-muted py-4">
                            <i class="bi bi-inbox fs-2 d-block mb-2"></i>
                            No registry entries yet.
                        </div>
                        <template v-for="entry in parsedRegs" :key="entry?.id">
                            <template v-if="entry">
                                <h6 class="mt-3 mb-1">{{ entry.title }}</h6>
                                <div class="table-responsive">
                                    <table class="table table-sm table-bordered" style="font-size: 0.8rem">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Action</th>
                                                <th>Scope</th>
                                                <th>Key</th>
                                                <th>Value name</th>
                                                <th>Type</th>
                                                <th>Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="(reg, i) in flatRegs(entry.regs)" :key="i">
                                                <td><span class="badge" :class="reg.action === 'del' ? 'text-bg-danger' : 'text-bg-success'">{{ reg.action }}</span></td>
                                                <td>{{ reg.scope }}</td>
                                                <td class="text-truncate" style="max-width: 200px" :title="reg.key">{{ reg.key }}</td>
                                                <td>{{ reg.valueName }}</td>
                                                <td><code>{{ reg.type }}</code></td>
                                                <td>{{ Array.isArray(reg.val) ? reg.val.join('; ') : reg.val }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </template>
                        </template>

                        <button
                            v-if="parsedRegs.some(r => r)"
                            class="btn btn-sm btn-outline-primary mt-2"
                            @click="exportRegistry"
                        >
                            <i class="bi bi-download me-1"></i>Export registry JSON
                        </button>
                    </div>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useConfig } from '../composables/useConfig'
import { useAdmx } from '../composables/useAdmx'

const { configs, getParsedPolicy, getParsedRegs } = useConfig()
const { allPolicies } = useAdmx()

const tab = ref('configs')

const parsedRegs = computed(() => getParsedRegs())

function getParsed(id) {
    const policy = allPolicies.value.find(p => p.id === id)
    return getParsedPolicy(policy)
}

function titleForConfig(id) {
    return getParsed(id)?.title ?? id.split(':')[2]
}

function labelForProp(id, prop) {
    const parsed = getParsed(id)
    return parsed?.components.find(c => c.prop === prop)?.label ?? prop
}

function displayVal(id, prop, val) {
    const parsed = getParsed(id)
    const comp = parsed?.components.find(c => c.prop === prop)
    if (comp?.display) return comp.display(val)
    if (Array.isArray(val)) return val.map(v => v.value ?? v).join('; ')
    return String(val)
}

function removeConfig(id) {
    const idx = configs.value.findIndex(c => c.id === id)
    if (idx >= 0) configs.value.splice(idx, 1)
}

function flatRegs(regsObj) {
    return Object.values(regsObj).flat()
}

function downloadJson(filename, data) {
    const a = document.createElement('a')
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2))
    a.download = filename
    a.click()
}

function exportConfigs() {
    downloadJson('configurations.json', configs.value)
}

function exportRegistry() {
    downloadJson('registry.json', parsedRegs.value.filter(Boolean))
}

async function importConfigs() {
    let fileHandle
    try {
        ;[fileHandle] = await window.showOpenFilePicker({
            excludeAcceptAllOption: true,
            types: [{ accept: { 'application/json': ['.json'] } }]
        })
    } catch {
        return
    }
    try {
        const text = await (await fileHandle.getFile()).text()
        configs.value = JSON.parse(text)
    } catch (e) {
        alert(`Import failed: ${e.message}`)
    }
}
</script>
