import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://prompt-hub-lab.github.io',
  base: '/prompt-hub',
  integrations: [
    tailwind(),
    sitemap({
      filter: (page) => !page.includes('/404'),
    }),
  ],
});
