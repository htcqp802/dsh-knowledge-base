/**
 * dsh-knowledge-base — SQLite 知识库核心（通用）。
 *
 * 数据文件：$DSH_HOME/knowledge-base/kb.sqlite（默认 ~/.dsh/knowledge-base/kb.sqlite）。
 *
 * 表结构：
 *   kb(id, category, name, summary, payload, tags, source, updated_at)
 *   - category  单值归档维度（类别由插件配置，可增删）
 *   - tags      多值细粒度标签（JSON 数组）
 *   - source    来源文件（同名重新导入 = 覆盖更新，upsert 语义）
 *   - updated_at 更新时间戳
 *
 * 本模块无任何行业绑定数据；示例/行业数据由上层导入。
 */

import { DatabaseSync } from 'node:sqlite'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface KbSearchArgs {
  query: string
  category?: string
}

export interface KbRow {
  id: number
  category: string
  name: string
  summary: string
  payload: string
  tags: string[]
  source: string | null
  updatedAt: string
}

export interface KbEntryInput {
  category: string
  name: string
  summary: string
  payload: string
  tags?: string[]
  source?: string
}

/** 知识库根目录。 */
export function kbRoot(): string {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'knowledge-base')
}

/** 知识库数据文件绝对路径。 */
export function kbPath(): string {
  return join(kbRoot(), 'kb.sqlite')
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kb (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  category   TEXT    NOT NULL DEFAULT '未分类',
  name       TEXT    NOT NULL,
  summary    TEXT    NOT NULL DEFAULT '',
  payload    TEXT    NOT NULL,
  tags       TEXT    NOT NULL DEFAULT '[]',
  source     TEXT,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_source_name ON kb(source, name);
CREATE INDEX IF NOT EXISTS idx_kb_category ON kb(category);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- FTS5 全文检索（trigram tokenizer：中文按 3 字滑窗子串匹配，无需分词器）。
-- 外部内容表 + 程序手动同步（见 ftsInsert / ftsDelete / syncFts）。
CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
  name, summary, payload, tags,
  content='kb', content_rowid='id', tokenize='trigram'
);
`

/** 打开（必要时创建）知识库，并保证 FTS 索引与数据一致。 */
export function openKb(): DatabaseSync {
  const path = kbPath()
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(SCHEMA)
  syncFts(db)
  return db
}

// ── FTS5 同步 ──────────────────────────────────────────────────────────────

/** 写一行 FTS 索引（外部内容表：按 rowid 对应 kb.id）。 */
function ftsInsert(db: DatabaseSync, id: number, name: string, summary: string, payload: string, tags: string): void {
  db.prepare('INSERT INTO kb_fts(rowid, name, summary, payload, tags) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, summary, payload, tags)
}

/** 删除一行 FTS 索引。对不存在的 rowid 必须先跳过——外部内容表对不存在行执行 'delete' 会损坏整个索引（SQLite FTS5 已知坑）。 */
function ftsDelete(db: DatabaseSync, id: number): void {
  const row = db.prepare('SELECT rowid FROM kb_fts WHERE rowid = ?').get(id) as { rowid: number } | undefined
  if (row === undefined) return
  db.prepare("INSERT INTO kb_fts(kb_fts, rowid, name, summary, payload, tags) VALUES ('delete', ?, '', '', '', '')")
    .run(id)
}

/** 索引与数据行数不一致时全量重建（首次升级/异常恢复）。 */
function syncFts(db: DatabaseSync): void {
  const dataCount = (db.prepare('SELECT COUNT(*) AS n FROM kb').get() as { n: number }).n
  const ftsCount = (db.prepare('SELECT COUNT(*) AS n FROM kb_fts').get() as { n: number }).n
  if (dataCount === ftsCount) return
  db.exec("INSERT INTO kb_fts(kb_fts) VALUES ('delete-all')")
  const rows = db.prepare('SELECT id, name, summary, payload, tags FROM kb').all() as Array<{
    id: number; name: string; summary: string; payload: string; tags: string
  }>
  const insert = db.prepare('INSERT INTO kb_fts(rowid, name, summary, payload, tags) VALUES (?, ?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(row.id, row.name, row.summary, row.payload, row.tags)
  }
}

function rowToKbRow(row: Record<string, unknown>): KbRow {
  return {
    id: row.id as number,
    category: row.category as string,
    name: row.name as string,
    summary: row.summary as string,
    payload: row.payload as string,
    tags: JSON.parse((row.tags as string) || '[]') as string[],
    source: (row.source as string | null) ?? null,
    updatedAt: row.updated_at as string,
  }
}

/**
 * 写入一条知识条目（同名同来源 = 覆盖更新）。
 * @returns 条目 id。
 */
export function upsertEntry(db: DatabaseSync, input: KbEntryInput): number {
  const tags = JSON.stringify(input.tags ?? [])
  const payload = typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload)
  if (input.source !== undefined) {
    // 显式分支（不能用 ON CONFLICT + 无脑 delete/insert）：
    // 全新库第一次插入时 FTS 索引为空，对不存在的 rowid 执行 'delete' 会把外部内容表损坏为 malformed。
    const existing = db.prepare('SELECT id FROM kb WHERE source = ? AND name = ?').get(input.source, input.name) as { id: number } | undefined
    if (existing !== undefined) {
      db.prepare(`
        UPDATE kb SET category = ?, summary = ?, payload = ?, tags = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(input.category, input.summary, payload, tags, existing.id)
      ftsDelete(db, existing.id)
      ftsInsert(db, existing.id, input.name, input.summary, payload, tags)
      return existing.id
    }
    const result = db.prepare(`
      INSERT INTO kb (category, name, summary, payload, tags, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(input.category, input.name, input.summary, payload, tags, input.source)
    const id = Number(result.lastInsertRowid)
    ftsInsert(db, id, input.name, input.summary, payload, tags)
    return id
  }
  const result = db.prepare(`
    INSERT INTO kb (category, name, summary, payload, tags, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(input.category, input.name, input.summary, payload, tags)
  const id = Number(result.lastInsertRowid)
  ftsInsert(db, id, input.name, input.summary, payload, tags)
  return id
}

/** 更新条目的分类与标签（同步 FTS：tags 变化）。 */
export function updateEntry(db: DatabaseSync, id: number, category: string, tags?: string[]): void {
  db.prepare('UPDATE kb SET category = ?, tags = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(category, JSON.stringify(tags ?? []), id)
  const row = db.prepare('SELECT name, summary, payload FROM kb WHERE id = ?').get(id) as { name: string; summary: string; payload: string } | undefined
  if (row !== undefined) {
    ftsDelete(db, id)
    ftsInsert(db, id, row.name, row.summary, row.payload, JSON.stringify(tags ?? []))
  }
}

/** 列出条目（可按 category 过滤，按更新时间倒序）。 */
export function listEntries(db: DatabaseSync, category?: string): KbRow[] {
  const where = category !== undefined && category !== '' ? 'WHERE category = ?' : ''
  const params: Array<string | number> = []
  if (category !== undefined && category !== '') params.push(category)
  const rows = db.prepare(`
    SELECT id, category, name, summary, payload, tags, source, updated_at
    FROM kb ${where}
    ORDER BY updated_at DESC, id DESC
    LIMIT 1000
  `).all(...params) as Record<string, unknown>[]
  return rows.map(rowToKbRow)
}

/**
 * 关键词检索：优先 FTS5（trigram，中文 3 字滑窗子串匹配 + BM25 相关度排序）；
 * 查询词不足 3 字符或 FTS 异常/无结果时回退 LIKE 子串匹配。可按 category 过滤。
 */
export function searchKb(db: DatabaseSync, args: KbSearchArgs): KbRow[] {
  const q = args.query.trim()
  if (q === '') return []
  const category = args.category !== undefined && args.category !== '' ? args.category : undefined

  // FTS5 路径（trigram 需要至少 3 个字符）。
  if (q.length >= 3) {
    try {
      const match = `"${q.replaceAll('"', '""')}"`
      const sql = category !== undefined
        ? `
          SELECT kb.id, kb.category, kb.name, kb.summary, kb.payload, kb.tags, kb.source, kb.updated_at
          FROM kb JOIN kb_fts ON kb_fts.rowid = kb.id
          WHERE kb.category = ? AND kb_fts MATCH ?
          ORDER BY bm25(kb_fts)
          LIMIT 50`
        : `
          SELECT kb.id, kb.category, kb.name, kb.summary, kb.payload, kb.tags, kb.source, kb.updated_at
          FROM kb JOIN kb_fts ON kb_fts.rowid = kb.id
          WHERE kb_fts MATCH ?
          ORDER BY bm25(kb_fts)
          LIMIT 50`
      const params: Array<string | number> = category !== undefined ? [category, match] : [match]
      const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
      if (rows.length > 0) return rows.map(rowToKbRow)
    } catch {
      // FTS 异常（如 trigram 不支持）→ 回退 LIKE。
    }
  }

  // LIKE 回退。
  const like = `%${q}%`
  const where = category !== undefined
    ? 'category = ? AND (name LIKE ? OR summary LIKE ? OR payload LIKE ? OR tags LIKE ?)'
    : '(name LIKE ? OR summary LIKE ? OR payload LIKE ? OR tags LIKE ?)'
  const params: Array<string | number> = []
  if (category !== undefined) params.push(category)
  params.push(like, like, like, like)
  const rows = db.prepare(`
    SELECT id, category, name, summary, payload, tags, source, updated_at
    FROM kb
    WHERE ${where}
    ORDER BY updated_at DESC, id DESC
    LIMIT 50
  `).all(...params) as Record<string, unknown>[]
  return rows.map(rowToKbRow)
}

/** 删除条目（同步 FTS）。 */
export function deleteEntry(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM kb WHERE id = ?').run(id)
  ftsDelete(db, id)
}

/**
 * 分类重命名：把该分类下所有条目的 category 字段更新为新名称。
 * @returns 受影响条目数。
 */
export function renameCategory(db: DatabaseSync, oldName: string, newName: string): number {
  const result = db.prepare(
    "UPDATE kb SET category = ?, updated_at = datetime('now') WHERE category = ?",
  ).run(newName, oldName)
  return Number(result.changes)
}

/**
 * 文件移动：把某 source 下所有条目的 category 更新为目标分类。
 * @returns 受影响条目数。
 */
export function moveFile(db: DatabaseSync, source: string, category: string): number {
  const result = db.prepare(
    "UPDATE kb SET category = ?, updated_at = datetime('now') WHERE source = ?",
  ).run(category, source)
  return Number(result.changes)
}

/**
 * 文件重命名：更新某 source 下所有条目的 source 字段，
 * 并把条目名中的旧文件名前缀替换为新文件名。
 * @returns 受影响条目数。
 */
export function renameFile(db: DatabaseSync, source: string, newSource: string): number {
  const rows = db.prepare('SELECT id, name FROM kb WHERE source = ?').all(source) as Array<{ id: number; name: string }>
  const prefix = `${source} · `
  const update = db.prepare("UPDATE kb SET source = ?, name = ?, updated_at = datetime('now') WHERE id = ?")
  for (const row of rows) {
    const newName = row.name.startsWith(prefix) ? `${newSource} · ${row.name.slice(prefix.length)}` : row.name
    update.run(newSource, newName, row.id)
  }
  return rows.length
}

/**
 * ── 自定义分类（动态目录） ────────────────────────────────────────────────
 * 分类体系 = 配置默认值 ∪ 条目实际出现的分类 ∪ 用户手动新建的空目录（存 meta 表）。
 * 这样"新建目录 / 删除空目录"不依赖静态配置，持久化在知识库内。
 */

const META_CUSTOM_CATEGORIES = 'custom_categories'

/** 读取用户手动新建的分类列表（含空目录）。 */
export function getCustomCategories(db: DatabaseSync): string[] {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(META_CUSTOM_CATEGORIES) as { value: string } | undefined
  if (row === undefined) return []
  try {
    const parsed = JSON.parse(row.value) as unknown
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

function setCustomCategories(db: DatabaseSync, list: string[]): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(META_CUSTOM_CATEGORIES, JSON.stringify(list))
}

/** 新建分类（空目录）。返回是否实际新增（重名返回 false）。 */
export function addCategory(db: DatabaseSync, name: string): boolean {
  const trimmed = name.trim()
  if (trimmed === '') return false
  const list = getCustomCategories(db)
  if (list.includes(trimmed)) return false
  list.push(trimmed)
  setCustomCategories(db, list)
  return true
}

/** 删除空目录。若目录下有条目返回 false（拒绝删除）。 */
export function removeCategory(db: DatabaseSync, name: string): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM kb WHERE category = ?').get(name) as { n: number }
  if (row.n > 0) return false
  const list = getCustomCategories(db).filter((n) => n !== name)
  setCustomCategories(db, list)
  return true
}

/** 分类重命名时，同步更新自定义分类列表中的名字。 */
export function renameCustomCategory(db: DatabaseSync, oldName: string, newName: string): void {
  const list = getCustomCategories(db)
  const idx = list.indexOf(oldName)
  if (idx !== -1) {
    list[idx] = newName
    setCustomCategories(db, list)
  }
}

/** 删除整个文件（该 source 下所有条目）。@returns 删除条目数。 */
export function deleteFile(db: DatabaseSync, source: string): number {
  const ids = db.prepare('SELECT id FROM kb WHERE source = ?').all(source) as Array<{ id: number }>
  const deleted = Number(db.prepare('DELETE FROM kb WHERE source = ?').run(source).changes)
  for (const { id } of ids) ftsDelete(db, id)
  return deleted
}
