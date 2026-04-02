import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    entry: 'src/main/index.ts',
    build: {
      outDir: 'out/main',
      emptyOutDir: false,
      externalizeDeps: true,
      rollupOptions: {
        external: ['node-pty'],
      },
    },
  },
  preload: {
    entry: 'src/preload/index.ts',
    build: {
      outDir: 'out/preload',
      emptyOutDir: false,
      externalizeDeps: true,
    },
  },
  renderer: {
    root: 'src/renderer',
    entry: 'src/renderer/index.html',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      emptyOutDir: false,
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
      },
    },
  },
})
