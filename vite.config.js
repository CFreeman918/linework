import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Relative base so the build works at any path (GitHub Pages serves it at /linework/).
export default defineConfig({
  base: "./",
  build: { target: "es2020", chunkSizeWarningLimit: 1500 },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "icon-192.png"],
      manifest: {
        name: "Linework",
        short_name: "Linework",
        description: "Touch-first diagram editor for flowcharts, P&IDs and schematics.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#ECEEE9",
        theme_color: "#0E7C8F",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
