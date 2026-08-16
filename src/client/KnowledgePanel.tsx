/**
 * 知识库管理面板 — 会话视图「知识库」tab。
 *
 * v0.3：目录浏览器（类操作系统文件管理器）。
 *   - 面包屑导航：根 → 分类 → 文件，可点击任意层级，可返回上一级
 *   - 根视图：分类文件夹（点开进入）
 *   - 分类视图：文件列表（打开 / 重命名 / 移动到其他目录）
 *   - 文件视图：切块条目列表
 *   - 重命名与移动均支持，改动即时持久化
 * 数据交互走同插件的 /api/kb/* 端点。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

interface KbEntry {
  id: number
  category: string
  name: string
  summary: string
  source: string | null
  updatedAt: string
  tags: string[]
}

interface ImportResult {
  imported: number
  source: string
  ids: number[]
  category: string
  suggestedCategory: string | null
  categories: string[]
}

/** 文件清单行（/api/kb/files）。 */
interface FileRow {
  source: string
  category: string
  count: number
  updatedAt: string
  summary: string
}

/** AI 分类建议（/api/kb/classify）。 */
interface ClassifySuggestion {
  source: string
  category?: string
  name?: string
  tags?: string[]
  error?: string
}

interface FolderInfo {
  category: string
  files: FileInfo[]
  count: number
}

interface FileInfo {
  source: string
  updatedAt: string
  chunks: number
}

/** 当前浏览位置（两级：根 → 分类；分类内直接展示文件分组与条目）。 */
type View =
  | { kind: 'root' }
  | { kind: 'category'; category: string }

/** 正在重命名的对象。 */
type Editing = { kind: 'category' | 'file'; value: string } | null

/** 正在执行"移动到"操作的文件。 */
type Moving = { source: string } | null

/** 文件分组折叠状态（默认展开，记录被折叠的文件）。 */
type Collapsed = Set<string> | null

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px',
  background: '#fff', boxShadow: '0 1px 3px rgba(16,24,40,.06)',
}

const heading: React.CSSProperties = { margin: '0 0 4px', fontSize: 16, fontWeight: 600 }

const sub: React.CSSProperties = { margin: '0 0 12px', fontSize: 12.5, color: '#6b7280' }

const dropZone: React.CSSProperties = {
  border: '2px dashed #cbd5e1', borderRadius: 8, padding: '18px',
  textAlign: 'center', fontSize: 13, color: '#6b7280', cursor: 'pointer',
  background: '#f9fafb', transition: 'border-color .15s',
}

const breadcrumb: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5,
  padding: '2px 0 10px', color: '#6b7280', flexWrap: 'wrap',
}

const crumb: React.CSSProperties = { cursor: 'pointer', color: '#2563eb', fontWeight: 500 }

const crumbCurrent: React.CSSProperties = { color: '#1f2937', fontWeight: 600 }

const backBtn: React.CSSProperties = {
  border: '1px solid #d1d5db', background: '#fff', borderRadius: 6,
  padding: '2px 10px', fontSize: 12, cursor: 'pointer', color: '#374151',
}

const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
  borderRadius: 6, fontSize: 13, cursor: 'pointer',
}

const rowActions: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }

const smallBtn: React.CSSProperties = {
  border: '1px solid #d1d5db', background: '#fff', borderRadius: 6,
  padding: '2px 8px', fontSize: 11.5, cursor: 'pointer', color: '#374151',
}

const primaryBtn: React.CSSProperties = {
  border: '1px solid #2563eb', background: '#2563eb', color: '#fff',
  borderRadius: 6, padding: '2px 8px', fontSize: 11.5, cursor: 'pointer',
}

const catSelect: React.CSSProperties = {
  border: '1px solid #d1d5db', borderRadius: 6, padding: '3px 6px',
  fontSize: 12, color: '#2563eb', background: '#fff', cursor: 'pointer', flexShrink: 0,
}

const renameInput: React.CSSProperties = {
  border: '1px solid #2563eb', borderRadius: 6, padding: '3px 8px',
  fontSize: 13, outline: 'none', width: 260,
}

const iconSize: React.CSSProperties = { fontSize: 18, flexShrink: 0 }

const meta: React.CSSProperties = { fontSize: 11.5, color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

const inputStyle: React.CSSProperties = {
  border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px',
  fontSize: 13, outline: 'none', flex: 1,
}

const button: React.CSSProperties = {
  border: '1px solid #d1d5db', background: '#fff', borderRadius: 8,
  padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#2563eb',
}

const primaryButton: React.CSSProperties = { ...button, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result ?? '')
      const idx = raw.indexOf(',')
      resolve(idx === -1 ? raw : raw.slice(idx + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** 从扁平条目派生"分类 → 文件"结构。 */
function buildFolders(entries: KbEntry[]): FolderInfo[] {
  const byCategory = new Map<string, Map<string, number>>()
  const metaOf = new Map<string, { updatedAt: string }>()
  for (const entry of entries) {
    const source = entry.source ?? '(无来源)'
    let files = byCategory.get(entry.category)
    if (files === undefined) {
      files = new Map()
      byCategory.set(entry.category, files)
    }
    files.set(source, (files.get(source) ?? 0) + 1)
    const prev = metaOf.get(`${entry.category}\u0000${source}`)
    if (prev === undefined || entry.updatedAt > prev.updatedAt) {
      metaOf.set(`${entry.category}\u0000${source}`, { updatedAt: entry.updatedAt })
    }
  }
  const folders: FolderInfo[] = []
  for (const [category, files] of byCategory) {
    const fileInfos: FileInfo[] = []
    for (const [source, chunks] of files) {
      fileInfos.push({ source, chunks, updatedAt: metaOf.get(`${category}\u0000${source}`)?.updatedAt ?? '' })
    }
    fileInfos.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    folders.push({
      category,
      files: fileInfos,
      count: fileInfos.reduce((n, f) => n + f.chunks, 0),
    })
  }
  folders.sort((a, b) => (a.category < b.category ? -1 : 1))
  return folders
}

export function KnowledgePanel(_props: ConvViewProps): ReactNode {
  const [entries, setEntries] = useState<KbEntry[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [importingLabel, setImportingLabel] = useState('导入中…')
  const [lastImport, setLastImport] = useState<ImportResult | null>(null)
  const [view, setView] = useState<View>({ kind: 'root' })
  const [editing, setEditing] = useState<Editing>(null)
  const [moving, setMoving] = useState<Moving>(null)
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
  const [collapsedFiles, setCollapsedFiles] = useState<Collapsed>(new Set())
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<KbEntry[] | null>(null)
  // 视图模式：dir=目录浏览；files=全部文件清单
  const [viewMode, setViewMode] = useState<'dir' | 'files'>('dir')
  // 全部文件清单
  const [files, setFiles] = useState<FileRow[]>([])
  const [fileFilter, setFileFilter] = useState('')
  const [fileCategory, setFileCategory] = useState('')
  // AI 整理
  const [classifying, setClassifying] = useState(false)
  const [suggestions, setSuggestions] = useState<ClassifySuggestion[] | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())
  const fileInput = useRef<HTMLInputElement>(null)
  const editInput = useRef<HTMLInputElement>(null)
  const createInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await getJson<{ rows: KbEntry[]; categories: string[] }>('/api/kb/list')
      setEntries(data.rows)
      setCategories(data.categories)
    } catch (error) {
      console.error('knowledge-base: list failed', error)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // 编辑框自动聚焦。
  useEffect(() => {
    if (editing !== null) editInput.current?.focus()
  }, [editing])

  // 新建目录输入框自动聚焦。
  useEffect(() => {
    if (creatingCategory) createInput.current?.focus()
  }, [creatingCategory])

  /** 新建目录。 */
  const createCategory = useCallback(async (name: string) => {
    setCreatingCategory(false)
    const trimmed = name.trim()
    if (trimmed === '') return
    try {
      await postJson('/api/kb/create-category', { name: trimmed })
      await refresh()
    } catch (error) {
      window.alert(`新建目录失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [refresh])

  /** 删除空目录。 */
  const deleteCategory = useCallback(async (name: string) => {
    if (!window.confirm(`删除目录「${name}」？仅空目录可删除。`)) return
    try {
      await postJson('/api/kb/delete-category', { name })
      await refresh()
    } catch (error) {
      window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [refresh])

  const importFile = useCallback(async (file: File): Promise<ImportResult> => {
    const contentBase64 = await fileToBase64(file)
    const result = await postJson<ImportResult>('/api/kb/import', { name: file.name, contentBase64 })
    return result
  }, [])

  /** 批量导入：逐个上传（顺序执行，避免并发打爆端点），显示进度。 */
  const importFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    setImporting(true)
    const total = files.length
    let done = 0
    let failed = 0
    let lastOk: ImportResult | null = null
    for (const file of files) {
      try {
        lastOk = await importFile(file)
      } catch (error) {
        failed++
        console.error(`knowledge-base: import failed: ${file.name}`, error)
      }
      done++
      setImportingLabel(`导入中（${done}/${total}）`)
    }
    setImporting(false)
    if (lastOk !== null) {
      setLastImport(lastOk)
      setView({ kind: 'root' })
    }
    await refresh()
    if (failed > 0) {
      window.alert(`导入完成：成功 ${total - failed}/${total}，失败 ${failed} 个文件`)
    }
  }, [importFile, refresh])

  /** 加载全部文件清单。 */
  const loadFiles = useCallback(async () => {
    try {
      const data = await getJson<{ files: FileRow[]; categories: string[] }>('/api/kb/files')
      setFiles(data.files)
      if (data.categories.length > 0) setCategories(data.categories)
    } catch (error) {
      console.error('knowledge-base: files failed', error)
    }
  }, [])

  /** 触发 AI 整理：对未分类文件生成建议。 */
  const runClassify = useCallback(async () => {
    setClassifying(true)
    setSuggestions(null)
    setAccepted(new Set())
    try {
      const data = await postJson<{ suggestions: ClassifySuggestion[] }>('/api/kb/classify', {})
      setSuggestions(data.suggestions)
      // 默认全选无错误的建议
      setAccepted(new Set(
        data.suggestions.map((_, i) => i).filter((i) => data.suggestions[i]?.error === undefined),
      ))
    } catch (error) {
      window.alert(`AI 分析失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setClassifying(false)
    }
  }, [])

  /** 采纳建议：对选中的文件应用分类/改名。 */
  const applySuggestions = useCallback(async () => {
    if (suggestions === null) return
    let ok = 0
    let failed = 0
    for (const i of accepted) {
      const s = suggestions[i]
      if (s === undefined || s.error !== undefined) continue
      try {
        const current = files.find((f) => f.source === s.source)
        // 分类变化 → 移动
        if (current !== undefined && s.category !== undefined && s.category !== '' && s.category !== current.category) {
          await postJson('/api/kb/move-file', { source: s.source, category: s.category })
        }
        // 文件名变化 → 重命名（改名后 source 变了，后续引用用新名）
        if (s.name !== undefined && s.name !== '' && !s.source.includes(s.name)) {
          const newName = `${s.name}${s.source.slice(s.source.lastIndexOf('.'))}`
          await postJson('/api/kb/rename-file', { source: s.source, newSource: newName })
        }
        ok++
      } catch (error) {
        failed++
        console.error(`apply suggestion failed: ${s.source}`, error)
      }
    }
    setSuggestions(null)
    await Promise.all([refresh(), loadFiles()])
    if (failed > 0) window.alert(`整理完成：成功 ${ok} 个，失败 ${failed} 个`)
  }, [accepted, suggestions, files, refresh, loadFiles])

  /** 提交重命名（分类或文件）。分类改名后回根视图；文件改名留在当前分类视图。 */
  const submitRename = useCallback(async (value: string) => {
    const target = editing
    setEditing(null)
    if (target === null) return
    const name = value.trim()
    if (name === '' || name === target.value) return
    try {
      if (target.kind === 'category') {
        await postJson('/api/kb/rename-category', { oldCategory: target.value, newCategory: name })
        setView({ kind: 'root' })
      } else {
        await postJson('/api/kb/rename-file', { source: target.value, newSource: name })
      }
      await refresh()
    } catch (error) {
      window.alert(`重命名失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [editing, refresh])

  /** 移动文件到目标分类；留在当前分类视图（文件从列表消失）。 */
  const moveTo = useCallback(async (source: string, category: string) => {
    setMoving(null)
    try {
      await postJson('/api/kb/move-file', { source, category })
      await refresh()
    } catch (error) {
      window.alert(`移动失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [refresh])

  /** 折叠/展开文件分组。 */
  const toggleFile = useCallback((source: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev ?? [])
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }, [])

  /** 删除整个文件（该文件所有条目）。 */
  const deleteFile = useCallback(async (source: string) => {
    if (!window.confirm(`删除文件「${source}」？其所有条目将一并删除。`)) return
    try {
      await postJson('/api/kb/delete-file', { source })
      await refresh()
    } catch (error) {
      window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [refresh])

  /** 删除单个条目。 */
  const deleteEntry = useCallback(async (id: number) => {
    if (!window.confirm('删除这条内容？')) return
    try {
      await postJson('/api/kb/delete-entry', { id })
      await refresh()
    } catch (error) {
      window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }, [refresh])

  const runSearch = useCallback(async () => {
    if (query.trim() === '') { setSearchResults(null); return }
    try {
      const data = await getJson<{ rows: KbEntry[] }>(`/api/kb/search?q=${encodeURIComponent(query.trim())}`)
      setSearchResults(data.rows)
    } catch (error) {
      console.error('knowledge-base: search failed', error)
    }
  }, [query])

  const folders = buildFolders(entries)
  // 文件清单：按搜索词/分类过滤
  const filteredFiles = files.filter((f) => {
    const q = fileFilter.trim().toLowerCase()
    if (q !== '' && !f.source.toLowerCase().includes(q) && !f.summary.toLowerCase().includes(q)) return false
    if (fileCategory !== '' && f.category !== fileCategory) return false
    return true
  })
  // 补齐配置中存在但尚无条目的空分类，并按配置顺序排列；不在配置中的分类（如重命名产生）追加在后。
  const fullFolders: FolderInfo[] = []
  for (const category of categories) {
    const existing = folders.find((f) => f.category === category)
    fullFolders.push(existing ?? { category, files: [], count: 0 })
  }
  for (const f of folders) {
    if (!categories.includes(f.category)) fullFolders.push(f)
  }
  // 面包屑不含根级：根视图（知识库首页）不显示面包屑，从分类级开始。
  const breadcrumbs: Array<{ label: string; onClick: () => void; current: boolean }> = []
  if (view.kind === 'category') {
    breadcrumbs.push({
      label: view.category,
      onClick: () => setView({ kind: 'category', category: view.category }),
      current: true,
    })
  }

  // 当前视图数据
  const currentFiles = view.kind === 'category'
    ? fullFolders.find((f) => f.category === view.category)?.files ?? []
    : []
  // 当前分类下全部条目（按文件分组展示）
  const categoryEntries = view.kind === 'category'
    ? entries.filter((e) => e.category === view.category)
    : []
  const isRoot = view.kind === 'root'

  // 与聊天输入框同宽：复用 DSH 的 --dsh-chat-content-width 变量，居中。
  return (
    <div style={{ maxWidth: 'var(--dsh-chat-content-width)', width: '100%', margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ ...card, marginBottom: 14 }}>
        <h3 style={heading}>知识库</h3>
        <p style={sub}>支持 md / txt / json / yml / docx / pdf，无大小限制；文件按章节切块，同名重导 = 覆盖更新。</p>

        <div
          style={dropZone}
          onClick={() => fileInput.current?.click()}
        >
          {importing ? importingLabel : '点击选择文件（可多选）'}
        </div>
        <input
          ref={fileInput} type="file" multiple style={{ display: 'none' }}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) void importFiles(files)
            e.target.value = ''
          }}
        />

        {lastImport !== null && lastImport.imported > 0 && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: '#16a34a', background: '#ecfdf3', borderRadius: 8, padding: '8px 12px' }}>
            ✓ 已导入《{lastImport.source}》：{lastImport.imported} 个条目，分类「{lastImport.category}」（可在目录中重命名 / 移动）
          </div>
        )}

        {/* 视图切换 */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
          <button
            style={viewMode === 'dir' ? primaryBtn : smallBtn}
            onClick={() => setViewMode('dir')}
          >
            📂 目录
          </button>
          <button
            style={viewMode === 'files' ? primaryBtn : smallBtn}
            onClick={() => { setViewMode('files'); void loadFiles() }}
          >
            📋 全部文件{files.length > 0 ? `（${files.length}）` : ''}
          </button>
        </div>
      </div>

      {viewMode === 'files' ? (
        /* ═══ 全部文件视图 ═══ */
        <div style={card}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              style={{ ...inputStyle, flex: '1 1 200px' }}
              placeholder="按文件名/内容摘要过滤…"
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
            />
            <select
              style={catSelect}
              value={fileCategory}
              onChange={(e) => setFileCategory(e.target.value)}
            >
              <option value="">全部分类</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button style={primaryButton} onClick={() => void runClassify()} disabled={classifying}>
              {classifying ? 'AI 分析中…' : '🤖 AI 整理'}
            </button>
          </div>

          {/* AI 建议面板 */}
          {suggestions !== null && (
            <div style={{ border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, marginBottom: 12, background: '#eff6ff' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                🤖 AI 建议（只建议，不改动；勾选后点"应用"）
              </div>
              {suggestions.map((s, i) => (
                <div key={s.source} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #dbeafe', fontSize: 12.5 }}>
                  <input
                    type="checkbox"
                    checked={accepted.has(i)}
                    disabled={s.error !== undefined}
                    onChange={() => {
                      setAccepted((prev) => {
                        const next = new Set(prev)
                        if (next.has(i)) next.delete(i)
                        else next.add(i)
                        return next
                      })
                    }}
                  />
                  <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.source}</span>
                  {s.error !== undefined ? (
                    <span style={{ color: '#dc2626', flex: 1 }}>⚠️ {s.error}</span>
                  ) : (
                    <>
                      <span style={{ color: '#9ca3af' }}>→</span>
                      <span style={{ color: '#2563eb', fontWeight: 500 }}>{s.category}</span>
                      <span style={{ color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.name}
                        {Array.isArray(s.tags) && s.tags.length > 0 ? ` · #${s.tags.join(' #')}` : ''}
                      </span>
                    </>
                  )}
                </div>
              ))}
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <button style={primaryBtn} onClick={() => void applySuggestions()}>应用选中（{accepted.size}）</button>
                <button style={smallBtn} onClick={() => setSuggestions(null)}>取消</button>
              </div>
            </div>
          )}

          {/* 文件表格 */}
          <div style={{ fontSize: 12.5 }}>
            {filteredFiles.length === 0 && <p style={{ ...sub, padding: '8px 0' }}>没有符合条件的文件。</p>}
            {filteredFiles.map((f) => (
              <div key={f.source} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderTop: '1px solid #f3f4f6' }}>
                <div style={{ flex: '1 1 30%', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {f.source}</div>
                  <div style={{ color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.summary || '(无文本，可能为扫描版)'}
                  </div>
                </div>
                <span style={{ fontSize: 11.5, color: '#9ca3af', flexShrink: 0 }}>{f.count} 块</span>
                <select
                  style={catSelect}
                  value={f.category}
                  onChange={(e) => {
                    const target = e.target.value
                    if (target === f.category) return
                    void postJson('/api/kb/move-file', { source: f.source, category: target })
                      .then(() => Promise.all([refresh(), loadFiles()]))
                      .catch((err) => window.alert(`移动失败：${err instanceof Error ? err.message : String(err)}`))
                  }}
                >
                  {categories.includes(f.category) ? null : <option value={f.category}>{f.category}</option>}
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{f.updatedAt.slice(0, 16)}</span>
                <button style={smallBtn} onClick={() => setEditing({ kind: 'file', value: f.source })}>✏️</button>
                <button style={{ ...smallBtn, color: '#dc2626', borderColor: '#fecaca' }} onClick={() => void deleteFile(f.source)}>🗑</button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
      {/* 检索 */}
      <div style={{ ...card, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={inputStyle} placeholder="检索知识库…（如：ISO9001、参数、安装）"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchResults(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') void runSearch() }}
          />
          <button style={primaryButton} onClick={() => void runSearch()}>检索</button>
          {searchResults !== null && (
            <button style={button} onClick={() => { setQuery(''); setSearchResults(null) }}>返回目录</button>
          )}
        </div>
      </div>

      {/* 目录浏览器 */}
      <div style={card}>
        {searchResults === null ? (
          <>
            {/* 面包屑 + 返回（根视图无面包屑） */}
            <div style={breadcrumb}>
              {!isRoot && <button style={backBtn} onClick={() => setView({ kind: 'root' })}>← 上一级</button>}
              {breadcrumbs.length > 0 && <span style={{ color: '#9ca3af' }}>/</span>}
              {breadcrumbs.map((c, i) => (
                <span key={i} style={c.current ? crumbCurrent : crumb} onClick={c.onClick}>{c.label}</span>
              ))}
              {view.kind === 'category' && (
                <button
                  style={{ ...smallBtn, marginLeft: 'auto' }}
                  onClick={() => setEditing({ kind: 'category', value: view.category })}
                >
                  重命名分类
                </button>
              )}
            </div>

            {/* 编辑框（面包屑下显示） */}
            {editing !== null && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 0 10px' }}>
                <input
                  ref={editInput} style={renameInput}
                  defaultValue={editing.value}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitRename((e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  onBlur={(e) => void submitRename(e.target.value)}
                />
                <button style={primaryBtn} onClick={(e) => void submitRename((e.target as HTMLButtonElement).previousElementSibling as HTMLInputElement ? ((e.target as HTMLButtonElement).previousElementSibling as HTMLInputElement).value : '')}>确定</button>
                <button style={smallBtn} onClick={() => setEditing(null)}>取消</button>
              </div>
            )}

            {/* 根视图：分类目录（列表样式：图标 + 目录名，含空目录） */}
            {isRoot && (
              <>
                {/* 新建目录：按钮 + 内联输入框 */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 0 10px' }}>
                  {creatingCategory ? (
                    <>
                      <input
                        ref={createInput}
                        style={renameInput}
                        placeholder="输入新目录名称，回车创建"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void createCategory((e.target as HTMLInputElement).value)
                          if (e.key === 'Escape') setCreatingCategory(false)
                        }}
                        onBlur={(e) => void createCategory(e.target.value)}
                      />
                      <button style={primaryBtn} onClick={(e) => void createCategory((e.target as HTMLButtonElement).previousElementSibling as HTMLInputElement ? ((e.target as HTMLButtonElement).previousElementSibling as HTMLInputElement).value : '')}>创建</button>
                      <button style={smallBtn} onClick={() => setCreatingCategory(false)}>取消</button>
                    </>
                  ) : (
                    <button style={smallBtn} onClick={() => setCreatingCategory(true)}>＋ 新建目录</button>
                  )}
                </div>
                {fullFolders.length === 0
                  ? <p style={{ ...sub, padding: '8px 0' }}>知识库为空，先导入一个文件，或新建一个目录。</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {fullFolders.map((folder) => (
                        <div
                          key={folder.category}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
                            borderRadius: 8,
                            border: editing !== null && editing.kind === 'category' && editing.value === folder.category
                              ? '2px solid #2563eb'
                              : hoveredFolder === folder.category ? '1px solid #2563eb' : '1px solid transparent',
                            cursor: 'pointer', background: hoveredFolder === folder.category ? '#f9fafb' : 'transparent',
                            transition: 'border-color .15s, background .15s', position: 'relative',
                          }}
                          onClick={() => setView({ kind: 'category', category: folder.category })}
                          onMouseEnter={() => setHoveredFolder(folder.category)}
                          onMouseLeave={() => setHoveredFolder(null)}
                        >
                          {/* 图标 + 目录名：名称紧跟图标 */}
                          <span style={{ fontSize: 18, flexShrink: 0 }}>📁</span>
                          <span style={{ fontWeight: 600, fontSize: 14, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {folder.category}
                          </span>
                          <span style={{ fontSize: 11.5, color: '#9ca3af', marginLeft: 4, flexShrink: 0 }}>
                            {folder.files.length > 0 ? `${folder.files.length} 个文件 · ${folder.count} 个条目` : '空目录'}
                          </span>
                          {hoveredFolder === folder.category && (
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                              <button
                                style={{ ...smallBtn, border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '1px 8px', fontSize: 12, cursor: 'pointer', color: '#374151' }}
                                onClick={() => setEditing({ kind: 'category', value: folder.category })}
                                title="重命名目录"
                              >
                                ✏️ 重命名
                              </button>
                              {folder.files.length === 0 && (
                                <button
                                  style={{ ...smallBtn, border: '1px solid #fecaca', background: '#fff', borderRadius: 6, padding: '1px 8px', fontSize: 12, cursor: 'pointer', color: '#dc2626' }}
                                  onClick={() => void deleteCategory(folder.category)}
                                  title="删除空目录"
                                >
                                  🗑 删除
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>}
              </>
            )}

            {/* 分类视图：文件分组 + 直接展示条目（两级结构，不再进第三层） */}
            {view.kind === 'category' && (
              currentFiles.length === 0
                ? <p style={{ ...sub, padding: '8px 0' }}>该分类为空。</p>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                    {currentFiles.map((file) => {
                      const fileChunks = categoryEntries.filter((e) => (e.source ?? '(无来源)') === file.source)
                      const collapsed = collapsedFiles?.has(file.source) ?? false
                      return (
                        <div key={file.source} style={{ border: '1px solid #f0f1f4', borderRadius: 10 }}>
                          {/* 文件分组头：可折叠 + 重命名 + 移动到 */}
                          <div
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderRadius: 10 }}
                            onClick={() => toggleFile(file.source)}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                          >
                            <span style={{ fontSize: 11, color: '#9ca3af', width: 12, flexShrink: 0 }}>{collapsed ? '▸' : '▾'}</span>
                            <span style={iconSize}>📄</span>
                            <span style={{ fontWeight: 600, fontSize: 13.5, color: '#1f2937' }}>{file.source}</span>
                            <span style={meta}>{fileChunks.length} 块 · {file.updatedAt}</span>
                            <div style={rowActions} onClick={(e) => e.stopPropagation()}>
                              {moving?.source === file.source && (
                                <select
                                  autoFocus
                                  style={{ border: '1px solid #2563eb', borderRadius: 6, padding: '2px 6px', fontSize: 11.5 }}
                                  value=""
                                  onChange={(e) => { if (e.target.value !== '') void moveTo(file.source, e.target.value) }}
                                  onBlur={() => setMoving(null)}
                                >
                                  <option value="" disabled>移动到…</option>
                                  {categories.filter((c) => c !== view.category).map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                              )}
                              <button style={smallBtn} onClick={() => setMoving({ source: file.source })}>移动到…</button>
                              <button style={smallBtn} onClick={() => setEditing({ kind: 'file', value: file.source })}>✏️ 重命名</button>
                              <button style={{ ...smallBtn, color: '#dc2626', borderColor: '#fecaca' }} onClick={() => void deleteFile(file.source)}>🗑 删除</button>
                            </div>
                          </div>
                          {/* 文件内容：切块条目直接展示 */}
                          {!collapsed && fileChunks.map((entry) => (
                            <div key={entry.id} style={{ ...row, cursor: 'default', paddingLeft: 34, borderTop: '1px solid #f5f6f8', borderRadius: 0 }}>
                              <span style={{ fontSize: 12, color: '#cbd5e1' }}>·</span>
                              {/* 文本容器：flex 布局保证超长内容省略号截断 */}
                              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                <span style={{ fontWeight: 500, color: '#374151', flex: '0 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {entry.name}
                                </span>
                                <span style={{ fontSize: 11.5, color: '#9ca3af', flex: '1 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {entry.summary}
                                </span>
                                {entry.tags.map((tag) => (
                                  <span key={tag} style={{ display: 'inline-block', fontSize: 11, color: '#374151', background: '#f3f4f6', borderRadius: 999, padding: '1px 8px', flexShrink: 0 }}>{tag}</span>
                                ))}
                              </div>
                              <button
                                style={{ ...smallBtn, color: '#9ca3af', borderColor: 'transparent', fontSize: 13, padding: '1px 6px', flexShrink: 0 }}
                                title="删除这条内容"
                                onClick={(e) => { e.stopPropagation(); void deleteEntry(entry.id) }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
            )}
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h3 style={{ ...heading, fontSize: 14 }}>检索结果（{searchResults.length}）</h3>
              <button style={button} onClick={() => { setQuery(''); setSearchResults(null) }}>返回目录</button>
            </div>
            {searchResults.map((entry) => (
              <div key={entry.id} style={{ ...row, cursor: 'default' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ color: '#374151', flex: '0 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</span>
                  <span style={{ color: '#9ca3af', fontSize: 11.5, flexShrink: 0 }}>
                    {entry.category} / {entry.source ?? ''}
                  </span>
                </div>
                <div style={{ color: '#6b7280', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.summary}</div>
              </div>
            ))}
          </>
        )}
      </div>
        </>
      )}
    </div>
  )
}
