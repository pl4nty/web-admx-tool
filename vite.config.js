import path from 'path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'

const pathSrc = path.resolve(__dirname, 'src')

export default defineConfig({
    resolve: {
        alias: {
            '@': pathSrc
        }
    },
    plugins: [
        Vue(),
        AutoImport({
            imports: ['vue', 'vue-router'],
            dts: path.resolve(pathSrc, 'auto-imports.d.ts')
        })
    ]
})
