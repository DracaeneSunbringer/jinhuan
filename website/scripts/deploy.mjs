// 标准发布：从源码构建并部署到 Cloudflare。取代 2026-11 之前在发布包上叠补丁的流程。
//   node scripts/deploy.mjs          只构建和检查，不部署（默认）
//   node scripts/deploy.mjs --yes    检查通过后执行 wrangler deploy
// 需要本机已 `wrangler login`；走代理时先设置 HTTPS_PROXY。
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const yes = process.argv.includes('--yes')
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
const out = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32' }).trim()
const step = (s) => console.log('\n▶ ' + s)

// 1. 源码状态：只从已提交的代码发布，方便回溯
step('检查工作区')
const dirty = out('git', ['status', '--porcelain', '--', 'src', 'web', 'public', 'wrangler.toml', 'package.json', 'vite.config.ts'])
assert.equal(dirty, '', '有未提交的改动，先提交再发布：\n' + dirty)
const commit = out('git', ['rev-parse', '--short', 'HEAD']), branch = out('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
console.log(`分支 ${branch} · 提交 ${commit}`)
if (branch !== 'main') console.log('⚠ 不在 main 分支上')

// 2. 大素材必须在本地：静态资源部署是整体替换，缺了的文件会从线上消失
step('检查本地大素材')
const count = (dir) => { if (!existsSync(dir)) return 0; let n = 0; for (const e of readdirSync(dir)) { const p = join(dir, e); n += statSync(p).isDirectory() ? count(p) : 1 } return n }
const assets = { 'public/pets': 1000, 'public/stickers': 1000, 'public/novel-data': 5000, 'public/mini-cdn': 50 }
for (const [dir, min] of Object.entries(assets)) {
  const n = count(dir)
  console.log(`${dir}: ${n} 个文件`)
  assert.ok(n >= min, `${dir} 只有 ${n} 个文件（至少应有 ${min}），素材不全时部署会把线上的文件删掉`)
}

// 3. 类型检查 + 构建 + 产物检查
step('类型检查'); run('npx', ['tsc', '--noEmit']); run('npx', ['tsc', '--noEmit', '-p', 'tsconfig.web.json'])
step('构建'); run('npx', ['vite', 'build'])
step('产物检查'); run('node', ['scripts/check-bundle.mjs'])
const config = JSON.parse(readFileSync('web/dist/meme_hall/wrangler.json', 'utf8'))
assert.ok(config.vars?.B12_CLOCK_START, '缺少 B12_CLOCK_START：鱼鱼谷岛钟会被重置')
assert.deepEqual(config.d1_databases.map((d) => d.binding).sort(), ['DB', 'MINIAPP_DB', 'MINIAPP_SANDBOX_DB'])
const total = count('web/dist/client')
console.log(`前端文件 ${total} 个`)
assert.ok(total > 14000, '前端文件数量异常')

if (!yes) { console.log('\n✓ 检查全部通过。确认要发布时加 --yes 重新运行。'); process.exit(0) }

// 4. 部署：用构建生成的配置（含静态资源目录）
step('部署')
run('npx', ['wrangler', 'deploy', '--config', 'web/dist/meme_hall/wrangler.json'])
console.log(`\n✓ 已发布 ${commit}。回滚：npx wrangler rollback`)
