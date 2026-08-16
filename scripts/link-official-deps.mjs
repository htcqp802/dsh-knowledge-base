/**
 * link-official-deps.mjs — 把官方 deepseek-harness checkout 的 @deepseek-ai 依赖
 * symlink 进套件根 node_modules/@deepseek-ai，使插件源码能从套件内解析官方包。
 *
 * 原理：官方 checkout 的 apps/cli/node_modules/@deepseek-ai/* 是 pnpm 生成的
 * workspace 链接（每个官方包内部还注入了自己的 node_modules，依赖链完整）。
 * Node 从套件内插件向上找 node_modules/@deepseek-ai/* 即可解析；跟随 symlink
 * 到官方包真实目录后，其内部依赖从官方包自带的 node_modules 解析。
 *
 * 用法：node scripts/link-official-deps.mjs
 */

import { existsSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const suiteRoot = resolve(here, '..')
const officialScoped = '/Users/qinpu/Projects/deepseek-harness/apps/cli/node_modules/@deepseek-ai'
const targetDir = join(suiteRoot, 'node_modules', '@deepseek-ai')

if (!existsSync(officialScoped)) {
  console.error(`官方依赖目录不存在: ${officialScoped}`)
  console.error('请确认官方 checkout 路径，或先运行官方 checkout 的 pnpm install。')
  process.exit(1)
}

mkdirSync(targetDir, { recursive: true })

const pkgs = readdirSync(officialScoped).filter((name) => !name.startsWith('.'))
let linked = 0
for (const name of pkgs) {
  const linkPath = join(targetDir, name)
  const realPath = join(officialScoped, name)
  // 已存在的链接若指向同一目标则跳过；否则先删后建。
  if (existsSync(linkPath)) {
    let same = false
    try {
      same = readlinkSync(linkPath) === realPath
    } catch { /* 非链接，删除重建 */ }
    if (same) continue
    rmSync(linkPath, { recursive: true, force: true })
  }
  symlinkSync(realPath, linkPath, 'dir')
  linked++
}

console.log(`已链接 ${linked} 个官方包到 ${targetDir}`)
