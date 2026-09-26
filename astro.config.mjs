// @ts-check
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  i18n: {
    locales: ['en', 'zh', 'hk'],
    defaultLocale: 'en',
    routing: { prefixDefaultLocale: false },
  },
});
