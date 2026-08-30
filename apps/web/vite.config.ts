import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackRouter({
      target: 'react',
      // Route files are code-split in real builds. Under Vitest the transform is
      // off: it rewrites `component: X` into `lazyRouteComponent(...)` and moves
      // X into a virtual module, which puts a route's component out of reach of
      // a unit test (`Route.options.component` is then the lazy wrapper).
      autoCodeSplitting: !process.env.VITEST,
      // Colocated route tests are not routes.
      routeFileIgnorePattern: '[.](test|spec)[.]',
    }),
    viteReact(),
    tailwindcss(),
  ],
  define: {
    '__BUILD_DATE__': JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['@codemirror/state', '@codemirror/view', '@lezer/common'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    pool: 'forks',
    watch: false,
  }
}))
