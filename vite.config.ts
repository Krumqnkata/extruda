// SPDX-License-Identifier: AGPL-3.0-or-later
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/extruda/',
  optimizeDeps: { exclude: ['manifold-3d'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Everything the tools need (code, WASM, fonts) is cached so Extruda works offline.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ttf,wasm}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
      manifest: {
        name: 'Extruda · 3D print workshop',
        short_name: 'Extruda',
        description: 'Free in-browser 3D print workshop: keychains, signs, QR tags, lithophanes, Gridfinity, boxes and printer tools.',
        lang: 'bg',
        theme_color: '#ff6a1f',
        background_color: '#0e1014',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node', testTimeout: 60000 },
});
