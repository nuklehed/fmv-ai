# Issue #10 — Add frontend tooling (linting, formatting, env config)

## Problem
The frontend project has **zero** tooling configuration:
- No ESLint config
- No Prettier config
- No `.env` file (only `.env.example`)
- `vite.config.ts` has hardcoded proxy port `3001` but backend defaults to `3000`
- No `postcss.config.js` (needed for Tailwind)
- No `.gitignore` for frontend build artifacts

## Files
- `apps/frontend/` — root of frontend project
- `apps/frontend/vite.config.ts` — hardcoded `target: 'http://localhost:3001'`
- `apps/frontend/package.json` — has `"lint"` script but no ESLint installed/configured

## Proposed Solution
1. **Add ESLint** with Vue 3 + TypeScript presets:
   ```bash
   npm i -D eslint @vue/eslint-config-typescript eslint-plugin-vue
   ```
2. **Add Prettier** with Tailwind plugin:
   ```bash
   npm i -D prettier prettier-plugin-tailwindcss
   ```
3. **Create `.env` and `.env.example`** with Vite-prefixed variables:
   ```
   VITE_API_BASE_URL=/api
   ```
4. **Fix vite proxy** to use env variable:
   ```typescript
   server: {
     proxy: {
       '/api': {
         target: import.meta.env.VITE_API_TARGET || 'http://localhost:3001',
         changeOrigin: true
       }
     }
   }
   ```
5. **Add `postcss.config.js`** for Tailwind:
   ```js
   export default {
     plugins: { tailwindcss: {}, autoprefixer: {} }
   }
   ```

## Acceptance Criteria
- `npm run lint` runs without errors
- `npm run lint -- --fix` auto-fixes issues
- `npm run dev` works with configurable backend target
- PostCSS processes Tailwind directives
