import react from '@vitejs/plugin-react';
import type { ConfigEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export function resolveBasePath(command: ConfigEnv['command'], isPreview = false): '/' | '/personal-workbench/' {
  return command === 'build' || isPreview ? '/personal-workbench/' : '/';
}

export default defineConfig(({ command, isPreview }) => ({
  base: resolveBasePath(command, isPreview),
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: '个人工作学习工作台',
        short_name: '工作台',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#173b67',
        background_color: '#f5f7fb',
        icons: [
          { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }
        ]
      }
    })
  ],
  test: {
    css: true,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    globals: true,
    setupFiles: ['./src/test/setup.ts']
  }
}));
