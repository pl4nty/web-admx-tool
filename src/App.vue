<template>
    <div class="d-flex flex-column" style="height: 100vh">
        <TheHeader />

        <div class="d-flex flex-row flex-grow-1 overflow-hidden">
            <!-- Sidebar: tree navigation -->
            <aside id="sidebar" class="p-2">
                <PolicyTree />
            </aside>

            <!-- Main content area -->
            <main id="main-content" class="p-0">
                <!-- Search results overlay -->
                <SearchResults v-if="query" />

                <!-- Policy detail -->
                <PolicyDetail v-else />
            </main>
        </div>

        <!-- Modals -->
        <FileUploadModal />
        <ConfigModal />
    </div>
</template>

<script setup>
import { onMounted } from 'vue'
import TheHeader from './components/TheHeader.vue'
import PolicyTree from './components/PolicyTree.vue'
import PolicyDetail from './components/PolicyDetail.vue'
import SearchResults from './components/SearchResults.vue'
import FileUploadModal from './components/FileUploadModal.vue'
import ConfigModal from './components/ConfigModal.vue'
import { useAdmx } from './composables/useAdmx'
import { useSearch } from './composables/useSearch'

const { loadDefault } = useAdmx()
const { query } = useSearch()

onMounted(() => {
    loadDefault()
})
</script>

