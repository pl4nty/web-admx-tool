<template>
    <div>
        <el-row>
            <Title></Title>
            <el-button :icon="isDark ? Moon : Sunny" circle @click="toggleDark()" style="position: absolute; top: 15px; right: 15px;" />
        </el-row>
        <el-divider />
        <el-row>
            <Main></Main>
        </el-row>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    justify-content: center;
}

.padding {
    padding-left: 20px;
    padding-right: 20px;
}
</style>

<script setup>
import { useDark, useToggle } from '@vueuse/core'
import { Moon, Sunny } from '@element-plus/icons-vue'

const isDark = useDark()
const toggleDark = useToggle(isDark)

const alive = ref(true)
const reload = () => {
    alive.value = false
    nextTick(() => {
        alive.value = true
    })
}

provide('reload', reload)

</script>
