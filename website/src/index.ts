// 线上入口：路由、定时任务和补丁时代的全部逻辑目前都在 legacy/live-app.js（从线上 b39 提取）。
// 整理计划见 docs/consolidation-plan.md；新代码请写成独立模块，不要再往 live-app.js 里加。
export type { Env } from './env'
export { default } from './legacy/live-app.js'
