<template>
    <el-drawer
        size="50%"
        title="Manage group policy templates"
        v-model="drawer">
        <el-row>
            <el-text>Generate templates by uploading&nbsp;</el-text>
            <el-link type="primary" @click="run(selectFolder)">
                a folder
            </el-link>
            <el-text>,&nbsp;</el-text>
            <el-link type="primary" @click="run(selectJsonTemplate)">
                a JSON file
            </el-link>
            <el-text>, or loading them from&nbsp;</el-text>
            <el-link type="primary" @click="run(loadServer)">a server</el-link>
            <el-text>.</el-text>
        </el-row>
        <el-table :data="templates" style="width: 100%; margin-top: 20px">
            <el-table-column label="Type" width="60px;">
                <template #default="scope">
                    <template v-if="scope.row.type === 'folder'">
                        <i-ep-folder />
                    </template>
                    <template v-if="scope.row.type === 'json'">
                        <i-ep-document />
                    </template>
                    <template v-if="scope.row.type === 'server'">
                        <i-ep-connection />
                    </template>
                </template>
            </el-table-column>
            <el-table-column prop="name" label="Name" />
            <el-table-column label="File number">
                <template #default="scope">
                    {{ Object.keys(scope.row.data).length }}
                </template>
            </el-table-column>
            <el-table-column label="Policy number">
                <template #default="scope">
                    {{ policyNumber(scope.row.data) }}
                </template>
            </el-table-column>
            <el-table-column label="Action">
                <template #default="scope">
                    <i-ep-download
                        style="cursor: pointer"
                        @click="
                            download(scope.row.name + '.json', scope.row.data)
                        " />
                    &nbsp;
                    <i-ep-delete
                        style="cursor: pointer"
                        @click="del(scope.$index)"></i-ep-delete>
                </template>
            </el-table-column>
        </el-table>
        <el-icon class="is-loading" style="margin-top: 20px" v-if="loading">
            <i-ep-loading />
        </el-icon>
        <el-row style="margin-top: 20px" v-if="templates.length >= 2">
            <el-text>Download entire&nbsp;</el-text>
            <el-link
                type="primary"
                @click="download('templates.json', mergeObjects())">
                JSON file
            </el-link>
            <el-text>.</el-text>
        </el-row>
    </el-drawer>
</template>

<script setup>
import { convert } from '../utils/admx'
import { download, selectJson } from '../utils/dom'

const props = defineProps({
    modelValue: Boolean
})
const emit = defineEmits(['update:modelValue', 'update'])
const drawer = computed({
    get() {
        return props.modelValue
    },
    set(val) {
        emit('update:modelValue', val)
    }
})

const msgs = ref([])
const loading = ref(false)

const run = async action => {
    try {
        loading.value = true
        return await action()
    } finally {
        loading.value = false
    }
}

const processFolder = async (cwd, folder, res) => {
    const iter = await folder.entries()
    for await (const entry of iter) {
        const f = entry[1]
        const name = entry[0]
        if (f.kind === 'directory') {
            await processFolder(name, f, res)
        } else if (
            name.toLowerCase().endsWith('.admx') ||
            name.toLowerCase().endsWith('.adml')
        ) {
            const file = await f.getFile()
            const text = await file.text()
            res.push({
                name: cwd === '' ? name : `${cwd}/${name}`,
                content: text
            })
        }
    }
}

const templates = ref([])

const policyNumber = data => {
    try {
        if (data) {
            return Object.values(data)
                .map(
                    i =>
                        i.policy.policyDefinitions?.policies?.policy?.length ??
                        0
                )
                .reduce((a, b) => a + b)
        }
    } catch (err) {
        console.error(err)
        return 0
    }
}

const del = i => {
    templates.value.splice(i, 1)
    emit('update', mergeObjects())
}

const mergeObjects = () => {
    const allData = templates.value.map(t => t.data)
    return Object.assign({}, ...allData)
}

const selectFolder = async e => {
    let folder
    try {
        folder = await showDirectoryPicker()
    } catch {
        ElMessage.warning('The user has canceled the folder selection.')
        return
    }
    const res = []
    await processFolder('', folder, res)
    const p = convert(res)

    templates.value.push({
        type: 'folder',
        name: folder.name,
        data: p
    })

    emit('update', mergeObjects())
    drawer.value = false
}

const selectJsonTemplate = async e => {
    const select = await selectJson()
    if (!select) {
        return
    }
    const { name, data } = select
    templates.value.push({
        type: 'json',
        name,
        data
    })

    emit('update', mergeObjects())
    drawer.value = false
}

const loadServer = async e => {
    let name
    try {
        const prompt = await ElMessageBox.prompt(
            'Please input server URL (use test.json for testing!)',
            'Tip',
            {
                inputValue: 'test.json',
                confirmButtonText: 'OK',
                cancelButtonText: 'Cancel'
            }
        )
        name = prompt.value
    } catch {
        ElMessage.warning(
            'The user has canceled the loading process from the server.'
        )
        return
    }
    let data
    try {
        data = await (await fetch(name)).json()
    } catch (error) {
        console.error(error)
        ElMessage.error(error.message)
        return
    }

    templates.value.push({
        type: 'server',
        name,
        data
    })

    emit('update', mergeObjects())
    drawer.value = false
}

{
    await Promise.all(['admx.json'].map(async name => {
        let data
        try {
            data = await (await fetch(name)).json()
        } catch (error) {
            console.error(error)
            ElMessage.error(error.message)
            return
        }

        templates.value.push({
            type: 'server',
            name,
            data
        })
    }))

    emit('update', mergeObjects())
}
</script>
