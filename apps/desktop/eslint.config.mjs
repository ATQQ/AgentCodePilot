import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

export default defineConfig(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      '**/out',
      // Cursor Agent sources kept but excluded from build/typecheck (see CURSOR_AGENT_DISABLED.md)
      '**/src/main/runtime/cursor-*.ts',
      '**/scripts/verify-cursor-sdk.mjs',
      '**/scripts/lib/cursor-token-usage.mjs'
    ]
  },
  tseslint.configs.recommended,
  eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      // Vue 模板内联多语句 v-on 在无分号时会编译失败（与 Prettier semi:false 叠加更易踩坑）。
      // 优先使用方法引用；需要传参时用箭头函数。存量内联写法逐步迁移，先 warn。
      'vue/v-on-handler-style': ['warn', ['method', 'inline-function']],
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: 'ts'
          }
        }
      ]
    }
  },
  eslintConfigPrettier
)
