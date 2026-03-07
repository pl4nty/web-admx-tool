<template>
    <nav class="navbar navbar-expand-lg bg-body-tertiary border-bottom px-3 py-2">
        <a class="navbar-brand d-flex align-items-center gap-2 me-4" href="#">
            <i class="bi bi-file-earmark-text-fill text-primary"></i>
            <span class="fw-semibold">Web ADMX Tool</span>
        </a>

        <!-- Search -->
        <div class="flex-grow-1 me-3" style="max-width: 420px">
            <div class="input-group input-group-sm">
                <span class="input-group-text bg-body border-end-0">
                    <i class="bi bi-search text-muted"></i>
                </span>
                <input
                    v-model="query"
                    type="search"
                    class="form-control border-start-0"
                    placeholder="Search policies…"
                    @keydown.escape="query = ''"
                />
            </div>
        </div>

        <!-- Controls -->
        <div class="d-flex align-items-center gap-2 ms-auto">
            <!-- Scope toggle -->
            <div class="btn-group btn-group-sm" role="group" aria-label="Scope">
                <input
                    type="radio"
                    class="btn-check"
                    id="scope-machine"
                    value="machine"
                    v-model="scope"
                />
                <label class="btn btn-outline-secondary" for="scope-machine">
                    <i class="bi bi-pc-display me-1"></i>Machine
                </label>
                <input
                    type="radio"
                    class="btn-check"
                    id="scope-user"
                    value="user"
                    v-model="scope"
                />
                <label class="btn btn-outline-secondary" for="scope-user">
                    <i class="bi bi-person me-1"></i>User
                </label>
            </div>

            <!-- Language selector -->
            <select
                v-if="langs.length > 1"
                v-model="lang"
                class="form-select form-select-sm"
                style="width: auto"
            >
                <option v-for="l in langs" :key="l" :value="l">
                    {{ formatLang(l) }}
                </option>
            </select>

            <!-- Upload button -->
            <button
                class="btn btn-sm btn-outline-primary"
                data-bs-toggle="modal"
                data-bs-target="#fileUploadModal"
                title="Upload ADMX templates"
            >
                <i class="bi bi-upload me-1"></i>Upload
            </button>

            <!-- Configurations -->
            <button
                class="btn btn-sm btn-outline-secondary position-relative"
                data-bs-toggle="modal"
                data-bs-target="#configModal"
                title="Manage configurations"
            >
                <i class="bi bi-gear me-1"></i>Configs
                <span
                    v-if="configs.length > 0"
                    class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-primary"
                >
                    {{ configs.length }}
                </span>
            </button>

            <!-- Loading spinner -->
            <span v-if="loading" class="spinner-border spinner-border-sm text-secondary" role="status">
                <span class="visually-hidden">Loading…</span>
            </span>
        </div>
    </nav>
</template>

<script setup>
import { useAdmx } from '../composables/useAdmx'
import { useSearch } from '../composables/useSearch'
import { useConfig } from '../composables/useConfig'

const { scope, lang, langs, loading } = useAdmx()
const { query } = useSearch()
const { configs } = useConfig()

const formatLang = l => {
    const parts = l.split('-')
    return parts[0] + (parts[1] ? '-' + parts[1].toUpperCase() : '')
}
</script>
