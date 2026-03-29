import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

import sitemap from '@astrojs/sitemap';
import { locales } from './src/locales.ts';

export default defineConfig({
  site: 'https://gpedit.tplant.com.au',
  integrations: [vue(), sitemap({
    entryLimit: 20000, // Max is 50k or 50mb, we exceeded the latter
    i18n: {
      defaultLocale: 'en-us',
      locales,
    },
  })],

  build: {
    inlineStylesheets: 'auto',
    // Astro 5.x already optimizes chunk splitting
  },
  i18n: {
    defaultLocale: 'en-us',
    locales: Object.keys(locales),
    routing: {
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false
    }
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
