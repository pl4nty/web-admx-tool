<template>
    <!-- File Upload Modal -->
    <div
        class="modal fade"
        id="fileUploadModal"
        tabindex="-1"
        aria-labelledby="fileUploadModalLabel"
        aria-hidden="true"
    >
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="fileUploadModalLabel">
                        <i class="bi bi-folder-plus me-2"></i>Upload ADMX Templates
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>

                <div class="modal-body">
                    <!-- Source selection -->
                    <p class="text-muted small mb-3">
                        Load additional Group Policy templates by selecting a folder containing
                        <code>.admx</code> / <code>.adml</code> files, uploading a JSON template
                        file, or loading from a server URL.
                    </p>

                    <div class="d-flex gap-2 flex-wrap mb-4">
                        <button class="btn btn-outline-primary" @click="pickFolder" :disabled="loading">
                            <i class="bi bi-folder2-open me-1"></i>Browse folder
                        </button>
                        <button class="btn btn-outline-secondary" @click="pickJson" :disabled="loading">
                            <i class="bi bi-file-earmark-code me-1"></i>Upload JSON
                        </button>
                        <button class="btn btn-outline-secondary" @click="showUrlInput = !showUrlInput" :disabled="loading">
                            <i class="bi bi-link-45deg me-1"></i>Server URL
                        </button>
                    </div>

                    <div v-if="showUrlInput" class="mb-3">
                        <label for="server-url" class="form-label">Server URL</label>
                        <div class="input-group">
                            <input
                                id="server-url"
                                v-model="serverUrl"
                                type="url"
                                class="form-control"
                                placeholder="https://example.com/admx.json"
                                @keydown.enter="loadUrl"
                            />
                            <button class="btn btn-primary" @click="loadUrl" :disabled="!serverUrl || loading">
                                Load
                            </button>
                        </div>
                    </div>

                    <!-- Spinner -->
                    <div v-if="loading" class="d-flex align-items-center gap-2 mb-3">
                        <span class="spinner-border spinner-border-sm" role="status"></span>
                        <span class="text-muted small">Processing templates…</span>
                    </div>

                    <!-- Error -->
                    <div v-if="errorMsg" class="alert alert-danger py-2 small">
                        <i class="bi bi-exclamation-triangle me-1"></i>{{ errorMsg }}
                    </div>

                    <!-- Loaded templates -->
                    <template v-if="templates.length > 0">
                        <h6 class="mb-2">Loaded templates</h6>
                        <ul class="list-group list-group-flush">
                            <li
                                v-for="(tpl, idx) in templates"
                                :key="idx"
                                class="list-group-item d-flex justify-content-between align-items-center px-0"
                            >
                                <div>
                                    <i class="bi me-2 text-muted"
                                        :class="tpl.type === 'folder' ? 'bi-folder2' : tpl.type === 'json' ? 'bi-file-earmark-code' : 'bi-link-45deg'">
                                    </i>
                                    <span class="fw-semibold">{{ tpl.name }}</span>
                                    <span class="badge text-bg-secondary ms-2">
                                        {{ Object.keys(tpl.data).length }} files
                                    </span>
                                </div>
                                <button class="btn btn-sm btn-outline-danger" @click="removeTemplate(idx)">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </li>
                        </ul>
                    </template>
                </div>

                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useAdmx } from '../composables/useAdmx'
import { parseFiles } from '../utils/parseFiles'

const { mergeData, replaceUserData } = useAdmx()

const templates = ref([])
const loading = ref(false)
const errorMsg = ref('')
const serverUrl = ref('')
const showUrlInput = ref(false)

// ── File System Access API helpers ────────────────────────────────────────────

async function readFolder(cwd, dirHandle, results) {
    for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === 'directory') {
            await readFolder(cwd ? `${cwd}/${name}` : name, handle, results)
        } else if (name.toLowerCase().endsWith('.admx') || name.toLowerCase().endsWith('.adml')) {
            const file = await handle.getFile()
            results.push({ name: cwd ? `${cwd}/${name}` : name, content: await file.text() })
        }
    }
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function pickFolder() {
    let dirHandle
    try {
        dirHandle = await window.showDirectoryPicker()
    } catch {
        return // User cancelled
    }
    loading.value = true
    errorMsg.value = ''
    try {
        const files = []
        await readFolder('', dirHandle, files)
        const data = await parseFiles(files)
        addTemplate({ type: 'folder', name: dirHandle.name, data })
    } catch (e) {
        errorMsg.value = e.message
    } finally {
        loading.value = false
    }
}

async function pickJson() {
    let fileHandle
    try {
        ;[fileHandle] = await window.showOpenFilePicker({
            excludeAcceptAllOption: true,
            types: [{ accept: { 'application/json': ['.json'] } }]
        })
    } catch {
        return // User cancelled
    }
    loading.value = true
    errorMsg.value = ''
    try {
        const text = await (await fileHandle.getFile()).text()
        const data = JSON.parse(text)
        addTemplate({ type: 'json', name: fileHandle.name, data })
    } catch (e) {
        errorMsg.value = e.message
    } finally {
        loading.value = false
    }
}

async function loadUrl() {
    if (!serverUrl.value) return
    loading.value = true
    errorMsg.value = ''
    try {
        const res = await fetch(serverUrl.value)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        addTemplate({ type: 'server', name: serverUrl.value, data })
        showUrlInput.value = false
        serverUrl.value = ''
    } catch (e) {
        errorMsg.value = e.message
    } finally {
        loading.value = false
    }
}

function addTemplate(tpl) {
    templates.value.push(tpl)
    mergeData(tpl.data)
}

function removeTemplate(idx) {
    templates.value.splice(idx, 1)
    // Rebuild data from the remaining templates only (avoids stale data from removed templates)
    replaceUserData(templates.value)
}
</script>
