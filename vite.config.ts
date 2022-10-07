import { defineConfig, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import dsv from "@rollup/plugin-dsv";
import { resolve } from 'path';

// The Vite Chokidar overrides don't actually work unless you write a plugin.
// This plugin overwrites the `ignored` directories for live-reloading. We do
// this to avoid reloads on changes to `sample-data/`.
//
// https://github.com/vitejs/vite/issues/8341
const ignored = () => {
  return {
    name: "ignored-overrides",
    configureServer: (server: ViteDevServer): void => {
      server.watcher.options = {
        ...server.watcher.options,
        ignored: ["**/.git/**", "**/node_modules/**", "**/sample-data/**"],
      };
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), dsv(), ignored()],
  base: '',
  server: {
    host: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        embedded: resolve(__dirname, "embedded.html")
      }
    }
  }
});
