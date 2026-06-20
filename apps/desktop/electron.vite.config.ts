import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { visualizer } from 'rollup-plugin-visualizer'

const isAnalyze = process.env.ANALYZE === '1'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        external: ['better-sqlite3', 'node-pty']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    server: {
      port: 5273
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    optimizeDeps: {
      exclude: ['monaco-editor'],
      include: ['stream-monaco', 'mermaid', 'katex']
    },
    worker: {
      format: 'es'
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/monaco-editor')) return 'monaco-editor'
            if (id.includes('node_modules/mermaid')) return 'mermaid'
            if (id.includes('node_modules/katex')) return 'katex'
            if (id.includes('node_modules/element-plus')) return 'element-plus'
            if (id.includes('node_modules/markstream-vue')) return 'markstream-vue'
            return undefined
          }
        }
      }
    },
    plugins: [
      vue(),
      AutoImport({
        resolvers: [ElementPlusResolver()]
      }),
      Components({
        resolvers: [ElementPlusResolver()]
      }),
      isAnalyze &&
        visualizer({
          open: true,
          gzipSize: true,
          filename: 'stats.html'
        })
    ].filter(Boolean)
  }
})
