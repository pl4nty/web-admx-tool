import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://gpedit.tplant.com.au',
  integrations: [
    vue({
      appEntrypoint: '/src/app-setup'
    })
  ],
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': '/src'
      }
    },
    css: {
      transformer: 'postcss'
    }
  }
});

