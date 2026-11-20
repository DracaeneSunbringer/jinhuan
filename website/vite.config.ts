import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import { fileURLToPath } from 'node:url'
// @ts-expect-error 本地构建脚本为 ESM，运行时不进入 Worker。
import { stampLegacyAssets } from './scripts/legacy-assets.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root: `${root}/web`,
  publicDir: `${root}/public`,
  resolve: { alias: { '@shared': `${root}/src/shared` } },
  server: { port: Number(process.env.PORT ?? 8787), strictPort: true },
  plugins: [react(), cloudflare({configPath: `${root}/wrangler.toml`, persistState: {path: `${root}/.wrangler/state`}}), {
    name: 'jinhuan-legacy-assets',
    apply: 'build',
    writeBundle(options) {
      if (this.environment.name !== 'client') return
      if (!options.dir) throw new Error('缺少 client 输出目录')
      stampLegacyAssets(options.dir)
    },
  }],
  build: {
    rollupOptions: { input: `${root}/web/app.html` },
  },
})
