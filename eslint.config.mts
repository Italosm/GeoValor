import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig } from 'eslint/config'

export default defineConfig([
    {
        ignores: ['**/*.html'],
    },
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],

        languageOptions: {
            globals: {
                ...globals.node,
            },
        },
    },

    js.configs.recommended,

    ...tseslint.configs.recommended,

    prettier,

    {
        rules: {
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-explicit-any': 'off',
            'no-console': 'off',
        },
    },
])
