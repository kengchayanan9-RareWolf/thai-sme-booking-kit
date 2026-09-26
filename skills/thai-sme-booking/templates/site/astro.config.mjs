import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), '');

export default defineConfig({
  site: env.SITE_URL || undefined,
  trailingSlash: 'ignore'
});
