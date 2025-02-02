<template>
    <div style="width: 100%; padding: 10px">
        <div style="margin-bottom: 10px">
            <el-row>
                <el-text>Click to&nbsp;</el-text>
                <el-link type="primary" @click="showTemplateMgmt = true">
                    manage
                </el-link>
                <el-text>&nbsp;the templates.&nbsp;</el-text>
                <el-text>Click to&nbsp;</el-text>
                <el-link type="primary" @click="showConfigMgmt = true">
                    manage
                </el-link>
                <el-text>&nbsp;the configurations.</el-text>
            </el-row>
            <el-form
                label-width="250px"
                label-position="left"
                style="margin-top: 20px">
                <el-form-item label="Group policy scope">
                    <el-radio-group v-model="scope" size="small">
                        <el-radio-button label="machine">
                            Machine
                        </el-radio-button>
                        <el-radio-button label="user">User</el-radio-button>
                    </el-radio-group>
                </el-form-item>
                <el-form-item label="Language">
                    <el-select v-model="lang" size="small" style="width: 200px">
                        <el-option
                            v-for="l in langs"
                            :label="displayLanguage(l)"
                            :value="l.toLowerCase()"></el-option>
                    </el-select>
                </el-form-item>
            </el-form>
        </div>

        <tree :data="treeData" :configs="configs" @click="click"></tree>

        <suspense>
            <template-mgmt
                v-model="showTemplateMgmt"
                @update="po => console.log((policyObject = po))"></template-mgmt>
        </suspense>

        <template-config v-model="showTemplateConfig"></template-config>

        <config-mgmt v-model="showConfigMgmt"></config-mgmt>
    </div>
</template>

<script setup>
import { useGlobal } from '../global'
import { useParser } from '../parser'

const { scope, lang, langs, configs, treeData, policyObject, curPolicy } =
    useGlobal()

const { parsedPolicy } = useParser()

const displayLanguage = l => {
    const parts = l.split('-')
    return parts[0] + '-' + parts?.[1]?.toUpperCase()
}

const showTemplateMgmt = ref(false)
const showTemplateConfig = ref(false)
const showConfigMgmt = ref(false)

const click = () => {
    showTemplateConfig.value = true
    console.log(curPolicy.value)
    console.log(parsedPolicy.value)
}
</script>
