import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icons/rumo-liquid-glass.svg',
          'icons/apple-touch-icon-180.png',
          'icons/rumo-glass-192.png',
          'icons/rumo-glass-512.png',
          'icons/rumo-glass-maskable-512.png',
          'apple-touch-icon.png',
          'favicon-32x32.png',
          'favicon-64x64.png',
          'icon.svg',
          'sw-push.js',
        ],
        manifest: {
          id: '/',
          name: 'Rumo — Controle de Despesas',
          short_name: 'Rumo',
          description:
            'Webapp mobile-first minimalista para controle de despesas pessoais com integração Google Apps Script e alertas push.',
          theme_color: '#E3E8EF',
          background_color: '#E3E8EF',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icons/rumo-glass-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/rumo-glass-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icons/rumo-glass-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/rumo-liquid-glass.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          importScripts: ['/sw-push.js'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url, request }) =>
                request.method === 'GET' && url.pathname.startsWith('/api/transactions'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'rumo-api-transactions-swr-v1',
                expiration: {
                  maxEntries: 36,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [200],
                },
                broadcastUpdate: {
                  channelName: 'rumo-swr-updates',
                  options: {
                    headersToCheck: ['etag', 'content-length', 'x-rumo-digest'],
                  },
                },
              },
            },
            {
              urlPattern: ({ url, request }) =>
                request.method === 'GET' && url.pathname === '/api/status',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'rumo-api-status-swr-v1',
                expiration: {
                  maxEntries: 4,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: {
                  statuses: [200],
                },
              },
            },
            {
              urlPattern: ({ request }) =>
                request.destination === 'script' ||
                request.destination === 'style' ||
                request.destination === 'image',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'rumo-static-swr-v1',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
