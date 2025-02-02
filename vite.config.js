import path from 'path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import Inspect from 'vite-plugin-inspect'

const pathSrc = path.resolve(__dirname, 'src')
const base = '/'

export default defineConfig({
    base,
    resolve: {
        alias: {
            '@': pathSrc
        }
    },
    plugins: [
        Vue(),
        AutoImport({
            imports: ['vue'],
            resolvers: [
                ElementPlusResolver(),
                IconsResolver({
                    prefix: 'Icon'
                })
            ],

            dts: path.resolve(pathSrc, 'auto-imports.d.ts')
        }),

        Components({
            resolvers: [
                IconsResolver({
                    enabledCollections: ['ep']
                }),
                ElementPlusResolver()
            ],

            dts: path.resolve(pathSrc, 'components.d.ts')
        }),

        Icons({
            autoInstall: true
        }),

        Inspect()
    ]
})
