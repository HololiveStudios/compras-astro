// astro.config.mjs
import { defineConfig } from 'astro/config';
import solid from '@astrojs/solid-js';
import tailwind from '@astrojs/tailwind';
import pwa from '@vite-pwa/astro';

export default defineConfig({
  integrations: [
    solid(),
    tailwind(),
    pwa({
      registerType: 'autoUpdate',
      includeAssets: ['list.png', 'list-192.png', 'list-512.png'], // Adicione isso!
      manifest: {
        id: "/",
        name: "Lista de Compras",
        short_name: "Compras",
        description: "Lista de compras ultra leve",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        display_override: ["fullscreen", "standalone"], // Força o modo app
        orientation: "portrait",
        theme_color: "#7c3aed",
        background_color: "#ffffff",
        icons: [
          {
            src: "/list-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/list-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico}"]
      },
      experimental: {
        directoryAndTrailingSlashHandler: true
      }
    })
  ]
});