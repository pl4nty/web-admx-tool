import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [vue()],
  redirects: {
    '/': '/en-us/'
  },
  build: {
    inlineStylesheets: 'auto',
    // Astro 5.x already optimizes chunk splitting
  },
  i18n: {
    defaultLocale: 'en-us',
    locales: [
      'en-us', 'cs-cz', 'da-dk', 'de-de', 'el-gr', 'es-es', 'fi-fi', 'fr-fr',
      'hu-hu', 'id-id', 'it-it', 'ja-jp', 'ko-kr', 'nb-no', 'nl-nl', 'pl-pl',
      'pt-br', 'pt-pt', 'ru-ru', 'sk-sk', 'sl-si', 'sv-se', 'th-th', 'tr-tr',
      'uk-ua', 'vi-vn', 'zh-cn', 'zh-tw'
    ],
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
