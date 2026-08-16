/**
 * dsh-knowledge-base — web 端点插件行（仅 web 组合挂载）。
 *
 * 为知识库管理 UI 提供 HTTP 接口：
 *   POST /api/kb/import          上传文件（base64 JSON）→ 解析切块入库 → 返回条目与建议分类
 *   POST /api/kb/update          修改条目分类/标签
 *   GET  /api/kb/list            列出条目与分类（?category=）
 *   GET  /api/kb/search          检索（?q=&category=）
 *   POST /api/kb/rename-category 分类重命名
 *   POST /api/kb/move-file       文件移动（改分类）
 *   POST /api/kb/rename-file     文件重命名
 *   POST /api/kb/create-category 新建目录（持久化自定义分类）
 *   POST /api/kb/delete-category 删除空目录
 *
 * 注意：端点走本地回环即可（本机 GUI 使用）；如需跨机器访问请由部署方加反代鉴权。
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
// Type-only：拉入 webServer 服务对 Context 的合并（ctx.webServer）。
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  kbRoot, openKb, upsertEntry, updateEntry, listEntries, searchKb,
  renameCategory, renameCustomCategory, moveFile, renameFile,
  addCategory, removeCategory, getCustomCategories, deleteFile, deleteEntry,
} from './kb.ts'
import { parseDocument, suggestCategory } from './parse.ts'

export const name = 'dsh-knowledge-base/web'

export interface Config {
  categories: string[]
}

export const Config: Schema<Config> = Schema.object({
  categories: Schema.array(String).default([]),
})

export const inject = ['tools', 'webServer', 'llm', 'agentDefaultModel']

export function apply(ctx: Context, config: Config): (() => void) | void {
  const db = openKb()
  const { webServer } = ctx

  // ── 上传导入 ────────────────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/import',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const name = String(body.name ?? '')
        const contentBase64 = String(body.contentBase64 ?? '')
        if (name === '' || contentBase64 === '') {
          return sendJson(res, 400, { error: 'name 与 contentBase64 必填' })
        }
        // 写临时文件 → 统一走 parseDocument（支持 docx/pdf 若系统工具可用）
        const inbox = join(kbRoot(), 'inbox')
        mkdirSync(inbox, { recursive: true })
        const tmpPath = join(inbox, sanitize(name))
        writeFileSync(tmpPath, Buffer.from(contentBase64, 'base64'))
        try {
          const parsed = await parseDocument(tmpPath)
          const suggested = suggestCategory(name, parsed.chunks[0]?.payload ?? '', config.categories)
          const category = typeof body.category === 'string' && body.category !== ''
            ? body.category
            : (suggested ?? defaultCategory(config.categories))
          const ids: number[] = []
          for (const chunk of parsed.chunks) {
            ids.push(upsertEntry(db, {
              category,
              name: chunk.name,
              summary: chunk.summary,
              payload: chunk.payload,
              tags: [],
              source: parsed.source,
            }))
          }
          return sendJson(res, 200, {
            imported: parsed.chunks.length,
            source: parsed.source,
            ids,
            category,
            suggestedCategory: suggested ?? null,
            categories: allCategories(db, config.categories),
            chunks: parsed.chunks.map((c) => ({ name: c.name, summary: c.summary })),
          })
        } finally {
          rmSync(tmpPath, { force: true })
        }
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // ── 修改分类/标签 ───────────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/update',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const id = Number(body.id)
        const category = String(body.category ?? '')
        const tags = Array.isArray(body.tags) ? body.tags.map(String) : []
        if (!Number.isFinite(id) || category === '') return sendJson(res, 400, { error: 'id 与 category 必填' })
        updateEntry(db, id, category, tags)
        return sendJson(res, 200, { updated: id, category, tags })
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // ── 列表 ────────────────────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/list',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const category = url.searchParams.get('category') ?? undefined
      const rows = listEntries(db, category)
      sendJson(res, 200, {
        matched: rows.length,
        categories: allCategories(db, config.categories),
        category: category ?? 'all',
        rows: rows.map((r) => ({
          id: r.id, category: r.category, name: r.name, summary: r.summary,
          source: r.source, updatedAt: r.updatedAt, tags: r.tags,
        })),
      })
    },
  })

  // ── 检索 ────────────────────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/search',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const q = url.searchParams.get('q') ?? ''
      const categoryParam = url.searchParams.get('category')
      if (q === '') return sendJson(res, 400, { error: 'q 必填' })
      const rows = categoryParam === null
        ? searchKb(db, { query: q })
        : searchKb(db, { query: q, category: categoryParam })
      sendJson(res, 200, {
        matched: rows.length,
        rows: rows.map((r) => ({
          id: r.id, category: r.category, name: r.name, summary: r.summary,
          source: r.source, updatedAt: r.updatedAt, tags: r.tags,
          detail: safeJson(r.payload),
        })),
      })
    },
  })

  // ── 分类重命名 ──────────────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/rename-category',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const oldCategory = String(body.oldCategory ?? '')
        const newCategory = String(body.newCategory ?? '').trim()
        if (oldCategory === '' || newCategory === '') return sendJson(res, 400, { error: 'oldCategory 与 newCategory 必填' })
        if (oldCategory === newCategory) return sendJson(res, 200, { renamed: 0 })
        const changed = renameCategory(db, oldCategory, newCategory)
        renameCustomCategory(db, oldCategory, newCategory)
        return sendJson(res, 200, { renamed: changed, from: oldCategory, to: newCategory })
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // ── 新建目录 ────────────────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/create-category',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const name = String(body.name ?? '').trim()
        if (name === '') return sendJson(res, 400, { error: 'name 必填' })
        const added = addCategory(db, name)
        return sendJson(res, 200, { created: added, name, categories: allCategories(db, config.categories) })
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // ── 删除空目录 ──────────────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/delete-category',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const name = String(body.name ?? '')
        if (name === '') return sendJson(res, 400, { error: 'name 必填' })
        const removed = removeCategory(db, name)
        if (!removed) return sendJson(res, 400, { error: '目录下有条目，无法删除（请先移动或清空）' })
        return sendJson(res, 200, { deleted: name, categories: allCategories(db, config.categories) })
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // ── 文件移动（改分类）───────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/move-file',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const source = String(body.source ?? '')
        const category = String(body.category ?? '')
        if (source === '' || category === '') return sendJson(res, 400, { error: 'source 与 category 必填' })
        const changed = moveFile(db, source, category)
        return sendJson(res, 200, { moved: changed, source, category })
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // ── 文件重命名 ──────────────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/rename-file',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const source = String(body.source ?? '')
        const newSource = String(body.newSource ?? '').trim()
        if (source === '' || newSource === '') return sendJson(res, 400, { error: 'source 与 newSource 必填' })
        if (source === newSource) return sendJson(res, 200, { renamed: 0 })
        const changed = renameFile(db, source, newSource)
        return sendJson(res, 200, { renamed: changed, from: source, to: newSource })
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // ── 删除文件（该文件所有条目）─────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/delete-file',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const source = String(body.source ?? '')
        if (source === '') return sendJson(res, 400, { error: 'source 必填' })
        const deleted = deleteFile(db, source)
        return sendJson(res, 200, { deleted, source })
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // ── 删除单个条目 ────────────────────────────────────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/delete-entry',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const id = Number(body.id)
        if (!Number.isFinite(id)) return sendJson(res, 400, { error: 'id 必填' })
        deleteEntry(db, id)
        return sendJson(res, 200, { deleted: id })
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

    // ── 文件清单（全部文件聚合，供「全部文件」视图）────────────────────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/files',
    handler: async (_req: IncomingMessage, res: ServerResponse) => {
      const rows = db.prepare(
        'SELECT source, category, COUNT(*) AS n, MAX(updated_at) AS t FROM kb GROUP BY source ORDER BY t DESC',
      ).all() as Array<{ source: string; category: string; n: number; t: string }>
      const files = rows.map((r) => {
        const first = db.prepare('SELECT summary FROM kb WHERE source = ? ORDER BY id LIMIT 1').get(r.source) as { summary: string } | undefined
        return { source: r.source, category: r.category, count: r.n, updatedAt: r.t, summary: first?.summary ?? '' }
      })
      sendJson(res, 200, { files, categories: allCategories(db, config.categories) })
    },
  })

  // ── AI 分类建议（LLM 读内容 → 建议分类/改名/标签；只建议不改动）────────
  webServer.register({
    kind: 'exact',
    path: '/api/kb/classify',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        const body = await readJsonBody(req)
        const sources = Array.isArray(body.sources) ? body.sources.map(String) : undefined
        const targets: Array<{ source: string }> = sources !== undefined
          ? sources.map((source) => ({ source }))
          : db.prepare(
              "SELECT source FROM kb GROUP BY source HAVING category = '未分类' ORDER BY MAX(updated_at) DESC LIMIT 20",
            ).all() as Array<{ source: string }>
        const llm = ctx.get('llm') as unknown as LlmLike | undefined
        // agentDefaultModel 是 Service 实例，需调用 currentSelection() 取 provider/model。
        const defaultModelSvc = ctx.get('agentDefaultModel') as unknown as { currentSelection?: () => DefaultModelLike } | undefined
        const defaultModel = defaultModelSvc?.currentSelection?.()
        const categories = allCategories(db, config.categories)
        const suggestions: Array<Record<string, unknown>> = []
        for (const target of targets) {
          const content = collectFileContent(db, target.source)
          if (content.length < 20) {
            suggestions.push({ source: target.source, error: '文件无有效文本（可能为扫描版），需 OCR 后才能分析' })
            continue
          }
          try {
            const suggestion = await classifyWithLlm(llm, defaultModel, target.source, content, categories)
            suggestions.push(suggestion)
          } catch (error) {
            suggestions.push({ source: target.source, error: `AI 分析失败：${error instanceof Error ? error.message : String(error)}` })
          }
        }
        return sendJson(res, 200, { suggestions })
      } catch (error) {
        return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
      }
    },
  })

  // cordis dispose 钩子：插件卸载时关闭数据库句柄。
  return (): void => {
    db.close()
  }
}

/** 读取并解析 JSON 请求体（不设大小上限；大文件以 base64 上传时注意内存占用）。 */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(JSON.parse(raw) as Record<string, unknown>)
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(body)
}

/** 文件名安全化。 */
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '-').trim()
}

/** payload 可能是 JSON 或 Markdown。 */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/** 未命中启发式时的兜底分类：归入中性的"未分类"，由用户后续手动归类。 */
function defaultCategory(_categories: readonly string[]): string {
  return '未分类'
}

/** 合并后的全量分类：配置默认值 ∪ 手动新建的空目录 ∪ 条目实际出现的分类。 */
function allCategories(db: import('node:sqlite').DatabaseSync, configCategories: readonly string[]): string[] {
  const set = new Set(configCategories)
  for (const c of getCustomCategories(db)) set.add(c)
  const rows = db.prepare('SELECT DISTINCT category FROM kb').all() as Array<{ category: string }>
  for (const row of rows) set.add(row.category)
  return [...set]
}

/** 收集某文件的可读内容（前若干条切块的 payload，截断）。 */
function collectFileContent(db: import('node:sqlite').DatabaseSync, source: string): string {
  const rows = db.prepare('SELECT payload FROM kb WHERE source = ? ORDER BY id LIMIT 5').all(source) as Array<{ payload: string }>
  return rows.map((r) => r.payload).join('\n').slice(0, 3000)
}

/** LLM 最小调用面（避免引入完整类型依赖）。 */
interface LlmLike {
  prepareCall(config: { provider: string; model: string; maxTokens?: number }): Promise<{
    /** 解析后的完整 call config（含 adapter 默认值）；stream 必须与它完全一致。 */
    config: Record<string, unknown>
    stream(options: {
      provider?: string
      model?: string
      temperature?: number
      maxTokens?: number
      stop?: string[]
      reasoningEffort?: unknown
      system?: string
      messages: Array<{ role: string; content: Array<{ type: string; text: string }> }>
    }): AsyncIterable<{ type: string; text?: string }>
  }>
}

interface DefaultModelLike {
  provider: string
  model: string
}

/** 调用 LLM 对单个文件生成分类/改名/标签建议（JSON）。 */
async function classifyWithLlm(
  llm: LlmLike | undefined,
  defaultModel: DefaultModelLike | undefined,
  source: string,
  content: string,
  categories: readonly string[],
): Promise<{ source: string; category: string; name: string; tags: string[] }> {
  if (llm === undefined || defaultModel === undefined) throw new Error('LLM 服务不可用')
  const { provider, model } = defaultModel
  const prepared = await llm.prepareCall({ provider, model, maxTokens: 500 })
  const system = '你是文档分类助手。分析文档内容，只输出一个 JSON 对象（不要其他文字）：{"category": 分类名, "name": 规范的文件名(不带扩展名,中文), "tags": [1-3个简短标签]}。分类优先从可用分类中选；都不合适可以提一个新分类名。'
  const prompt = `文档标题：${source}\n可用分类：${categories.join(' / ')}\n文档内容（节选）：\n${content}`
  let text = ''
  // stream 的 config 必须与 prepared.config（含 adapter 默认值）完全一致，否则 INVALID_PREPARED_CALL。
  for await (const chunk of prepared.stream({
    ...prepared.config,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
  })) {
    if (chunk.type === 'text-delta' && chunk.text !== undefined) text += chunk.text
  }
  const jsonText = /\{[\s\S]*\}/.exec(text)?.[0] ?? text
  const parsed = JSON.parse(jsonText) as { category?: unknown; name?: unknown; tags?: unknown }
  return {
    source,
    category: typeof parsed.category === 'string' ? parsed.category : '',
    name: typeof parsed.name === 'string' ? parsed.name : '',
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
  }
}
