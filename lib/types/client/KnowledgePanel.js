import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
import { useCallback, useEffect, useRef, useState } from 'react';
const card = {
    border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px',
    background: '#fff', boxShadow: '0 1px 3px rgba(16,24,40,.06)',
};
const heading = { margin: '0 0 4px', fontSize: 16, fontWeight: 600 };
const sub = { margin: '0 0 12px', fontSize: 12.5, color: '#6b7280' };
const dropZone = {
    border: '2px dashed #cbd5e1', borderRadius: 8, padding: '18px',
    textAlign: 'center', fontSize: 13, color: '#6b7280', cursor: 'pointer',
    background: '#f9fafb', transition: 'border-color .15s',
};
const breadcrumb = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5,
    padding: '2px 0 10px', color: '#6b7280', flexWrap: 'wrap',
};
const crumb = { cursor: 'pointer', color: '#2563eb', fontWeight: 500 };
const crumbCurrent = { color: '#1f2937', fontWeight: 600 };
const backBtn = {
    border: '1px solid #d1d5db', background: '#fff', borderRadius: 6,
    padding: '2px 10px', fontSize: 12, cursor: 'pointer', color: '#374151',
};
const row = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
    borderRadius: 6, fontSize: 13, cursor: 'pointer',
};
const rowActions = { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 };
const smallBtn = {
    border: '1px solid #d1d5db', background: '#fff', borderRadius: 6,
    padding: '2px 8px', fontSize: 11.5, cursor: 'pointer', color: '#374151',
};
const primaryBtn = {
    border: '1px solid #2563eb', background: '#2563eb', color: '#fff',
    borderRadius: 6, padding: '2px 8px', fontSize: 11.5, cursor: 'pointer',
};
const catSelect = {
    border: '1px solid #d1d5db', borderRadius: 6, padding: '3px 6px',
    fontSize: 12, color: '#2563eb', background: '#fff', cursor: 'pointer', flexShrink: 0,
};
const renameInput = {
    border: '1px solid #2563eb', borderRadius: 6, padding: '3px 8px',
    fontSize: 13, outline: 'none', width: 260,
};
const iconSize = { fontSize: 18, flexShrink: 0 };
const meta = { fontSize: 11.5, color: '#9ca3af', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const inputStyle = {
    border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px',
    fontSize: 13, outline: 'none', flex: 1,
};
const button = {
    border: '1px solid #d1d5db', background: '#fff', borderRadius: 8,
    padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#2563eb',
};
const primaryButton = { ...button, background: '#2563eb', color: '#fff', borderColor: '#2563eb' };
async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok)
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return (await res.json());
}
async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`HTTP ${res.status}`);
    return (await res.json());
}
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const raw = String(reader.result ?? '');
            const idx = raw.indexOf(',');
            resolve(idx === -1 ? raw : raw.slice(idx + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}
/** 从扁平条目派生"分类 → 文件"结构。 */
function buildFolders(entries) {
    const byCategory = new Map();
    const metaOf = new Map();
    for (const entry of entries) {
        const source = entry.source ?? '(无来源)';
        let files = byCategory.get(entry.category);
        if (files === undefined) {
            files = new Map();
            byCategory.set(entry.category, files);
        }
        files.set(source, (files.get(source) ?? 0) + 1);
        const prev = metaOf.get(`${entry.category}\u0000${source}`);
        if (prev === undefined || entry.updatedAt > prev.updatedAt) {
            metaOf.set(`${entry.category}\u0000${source}`, { updatedAt: entry.updatedAt });
        }
    }
    const folders = [];
    for (const [category, files] of byCategory) {
        const fileInfos = [];
        for (const [source, chunks] of files) {
            fileInfos.push({ source, chunks, updatedAt: metaOf.get(`${category}\u0000${source}`)?.updatedAt ?? '' });
        }
        fileInfos.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
        folders.push({
            category,
            files: fileInfos,
            count: fileInfos.reduce((n, f) => n + f.chunks, 0),
        });
    }
    folders.sort((a, b) => (a.category < b.category ? -1 : 1));
    return folders;
}
export function KnowledgePanel(_props) {
    const [entries, setEntries] = useState([]);
    const [categories, setCategories] = useState([]);
    const [importing, setImporting] = useState(false);
    const [importingLabel, setImportingLabel] = useState('导入中…');
    const [lastImport, setLastImport] = useState(null);
    const [view, setView] = useState({ kind: 'root' });
    const [editing, setEditing] = useState(null);
    const [moving, setMoving] = useState(null);
    const [hoveredFolder, setHoveredFolder] = useState(null);
    const [collapsedFiles, setCollapsedFiles] = useState(new Set());
    const [creatingCategory, setCreatingCategory] = useState(false);
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    // 视图模式：dir=目录浏览；files=全部文件清单
    const [viewMode, setViewMode] = useState('dir');
    // 全部文件清单
    const [files, setFiles] = useState([]);
    const [fileFilter, setFileFilter] = useState('');
    const [fileCategory, setFileCategory] = useState('');
    // AI 整理
    const [classifying, setClassifying] = useState(false);
    const [suggestions, setSuggestions] = useState(null);
    const [accepted, setAccepted] = useState(new Set());
    const fileInput = useRef(null);
    const editInput = useRef(null);
    const createInput = useRef(null);
    const refresh = useCallback(async () => {
        try {
            const data = await getJson('/api/kb/list');
            setEntries(data.rows);
            setCategories(data.categories);
        }
        catch (error) {
            console.error('knowledge-base: list failed', error);
        }
    }, []);
    useEffect(() => { void refresh(); }, [refresh]);
    // 编辑框自动聚焦。
    useEffect(() => {
        if (editing !== null)
            editInput.current?.focus();
    }, [editing]);
    // 新建目录输入框自动聚焦。
    useEffect(() => {
        if (creatingCategory)
            createInput.current?.focus();
    }, [creatingCategory]);
    /** 新建目录。 */
    const createCategory = useCallback(async (name) => {
        setCreatingCategory(false);
        const trimmed = name.trim();
        if (trimmed === '')
            return;
        try {
            await postJson('/api/kb/create-category', { name: trimmed });
            await refresh();
        }
        catch (error) {
            window.alert(`新建目录失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }, [refresh]);
    /** 删除空目录。 */
    const deleteCategory = useCallback(async (name) => {
        if (!window.confirm(`删除目录「${name}」？仅空目录可删除。`))
            return;
        try {
            await postJson('/api/kb/delete-category', { name });
            await refresh();
        }
        catch (error) {
            window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }, [refresh]);
    const importFile = useCallback(async (file) => {
        const contentBase64 = await fileToBase64(file);
        const result = await postJson('/api/kb/import', { name: file.name, contentBase64 });
        return result;
    }, []);
    /** 批量导入：逐个上传（顺序执行，避免并发打爆端点），显示进度。 */
    const importFiles = useCallback(async (files) => {
        if (files.length === 0)
            return;
        setImporting(true);
        const total = files.length;
        let done = 0;
        let failed = 0;
        let lastOk = null;
        for (const file of files) {
            try {
                lastOk = await importFile(file);
            }
            catch (error) {
                failed++;
                console.error(`knowledge-base: import failed: ${file.name}`, error);
            }
            done++;
            setImportingLabel(`导入中（${done}/${total}）`);
        }
        setImporting(false);
        if (lastOk !== null) {
            setLastImport(lastOk);
            setView({ kind: 'root' });
        }
        await refresh();
        if (failed > 0) {
            window.alert(`导入完成：成功 ${total - failed}/${total}，失败 ${failed} 个文件`);
        }
    }, [importFile, refresh]);
    /** 加载全部文件清单。 */
    const loadFiles = useCallback(async () => {
        try {
            const data = await getJson('/api/kb/files');
            setFiles(data.files);
            if (data.categories.length > 0)
                setCategories(data.categories);
        }
        catch (error) {
            console.error('knowledge-base: files failed', error);
        }
    }, []);
    /** 触发 AI 整理：对未分类文件生成建议。 */
    const runClassify = useCallback(async () => {
        setClassifying(true);
        setSuggestions(null);
        setAccepted(new Set());
        try {
            const data = await postJson('/api/kb/classify', {});
            setSuggestions(data.suggestions);
            // 默认全选无错误的建议
            setAccepted(new Set(data.suggestions.map((_, i) => i).filter((i) => data.suggestions[i]?.error === undefined)));
        }
        catch (error) {
            window.alert(`AI 分析失败：${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            setClassifying(false);
        }
    }, []);
    /** 采纳建议：对选中的文件应用分类/改名。 */
    const applySuggestions = useCallback(async () => {
        if (suggestions === null)
            return;
        let ok = 0;
        let failed = 0;
        for (const i of accepted) {
            const s = suggestions[i];
            if (s === undefined || s.error !== undefined)
                continue;
            try {
                const current = files.find((f) => f.source === s.source);
                // 分类变化 → 移动
                if (current !== undefined && s.category !== undefined && s.category !== '' && s.category !== current.category) {
                    await postJson('/api/kb/move-file', { source: s.source, category: s.category });
                }
                // 文件名变化 → 重命名（改名后 source 变了，后续引用用新名）
                if (s.name !== undefined && s.name !== '' && !s.source.includes(s.name)) {
                    const newName = `${s.name}${s.source.slice(s.source.lastIndexOf('.'))}`;
                    await postJson('/api/kb/rename-file', { source: s.source, newSource: newName });
                }
                ok++;
            }
            catch (error) {
                failed++;
                console.error(`apply suggestion failed: ${s.source}`, error);
            }
        }
        setSuggestions(null);
        await Promise.all([refresh(), loadFiles()]);
        if (failed > 0)
            window.alert(`整理完成：成功 ${ok} 个，失败 ${failed} 个`);
    }, [accepted, suggestions, files, refresh, loadFiles]);
    /** 提交重命名（分类或文件）。分类改名后回根视图；文件改名留在当前分类视图。 */
    const submitRename = useCallback(async (value) => {
        const target = editing;
        setEditing(null);
        if (target === null)
            return;
        const name = value.trim();
        if (name === '' || name === target.value)
            return;
        try {
            if (target.kind === 'category') {
                await postJson('/api/kb/rename-category', { oldCategory: target.value, newCategory: name });
                setView({ kind: 'root' });
            }
            else {
                await postJson('/api/kb/rename-file', { source: target.value, newSource: name });
            }
            await refresh();
        }
        catch (error) {
            window.alert(`重命名失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }, [editing, refresh]);
    /** 移动文件到目标分类；留在当前分类视图（文件从列表消失）。 */
    const moveTo = useCallback(async (source, category) => {
        setMoving(null);
        try {
            await postJson('/api/kb/move-file', { source, category });
            await refresh();
        }
        catch (error) {
            window.alert(`移动失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }, [refresh]);
    /** 折叠/展开文件分组。 */
    const toggleFile = useCallback((source) => {
        setCollapsedFiles((prev) => {
            const next = new Set(prev ?? []);
            if (next.has(source))
                next.delete(source);
            else
                next.add(source);
            return next;
        });
    }, []);
    /** 删除整个文件（该文件所有条目）。 */
    const deleteFile = useCallback(async (source) => {
        if (!window.confirm(`删除文件「${source}」？其所有条目将一并删除。`))
            return;
        try {
            await postJson('/api/kb/delete-file', { source });
            await refresh();
        }
        catch (error) {
            window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }, [refresh]);
    /** 删除单个条目。 */
    const deleteEntry = useCallback(async (id) => {
        if (!window.confirm('删除这条内容？'))
            return;
        try {
            await postJson('/api/kb/delete-entry', { id });
            await refresh();
        }
        catch (error) {
            window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`);
        }
    }, [refresh]);
    const runSearch = useCallback(async () => {
        if (query.trim() === '') {
            setSearchResults(null);
            return;
        }
        try {
            const data = await getJson(`/api/kb/search?q=${encodeURIComponent(query.trim())}`);
            setSearchResults(data.rows);
        }
        catch (error) {
            console.error('knowledge-base: search failed', error);
        }
    }, [query]);
    const folders = buildFolders(entries);
    // 文件清单：按搜索词/分类过滤
    const filteredFiles = files.filter((f) => {
        const q = fileFilter.trim().toLowerCase();
        if (q !== '' && !f.source.toLowerCase().includes(q) && !f.summary.toLowerCase().includes(q))
            return false;
        if (fileCategory !== '' && f.category !== fileCategory)
            return false;
        return true;
    });
    // 补齐配置中存在但尚无条目的空分类，并按配置顺序排列；不在配置中的分类（如重命名产生）追加在后。
    const fullFolders = [];
    for (const category of categories) {
        const existing = folders.find((f) => f.category === category);
        fullFolders.push(existing ?? { category, files: [], count: 0 });
    }
    for (const f of folders) {
        if (!categories.includes(f.category))
            fullFolders.push(f);
    }
    // 面包屑不含根级：根视图（知识库首页）不显示面包屑，从分类级开始。
    const breadcrumbs = [];
    if (view.kind === 'category') {
        breadcrumbs.push({
            label: view.category,
            onClick: () => setView({ kind: 'category', category: view.category }),
            current: true,
        });
    }
    // 当前视图数据
    const currentFiles = view.kind === 'category'
        ? fullFolders.find((f) => f.category === view.category)?.files ?? []
        : [];
    // 当前分类下全部条目（按文件分组展示）
    const categoryEntries = view.kind === 'category'
        ? entries.filter((e) => e.category === view.category)
        : [];
    const isRoot = view.kind === 'root';
    // 与聊天输入框同宽：复用 DSH 的 --dsh-chat-content-width 变量，居中。
    return (_jsxs("div", { style: { maxWidth: 'var(--dsh-chat-content-width)', width: '100%', margin: '0 auto', padding: '20px 24px' }, children: [_jsxs("div", { style: { ...card, marginBottom: 14 }, children: [_jsx("h3", { style: heading, children: "\u77E5\u8BC6\u5E93" }), _jsx("p", { style: sub, children: "\u652F\u6301 md / txt / json / yml / docx / pdf\uFF0C\u65E0\u5927\u5C0F\u9650\u5236\uFF1B\u6587\u4EF6\u6309\u7AE0\u8282\u5207\u5757\uFF0C\u540C\u540D\u91CD\u5BFC = \u8986\u76D6\u66F4\u65B0\u3002" }), _jsx("div", { style: dropZone, onClick: () => fileInput.current?.click(), children: importing ? importingLabel : '点击选择文件（可多选）' }), _jsx("input", { ref: fileInput, type: "file", multiple: true, style: { display: 'none' }, onChange: (e) => {
                            const files = Array.from(e.target.files ?? []);
                            if (files.length > 0)
                                void importFiles(files);
                            e.target.value = '';
                        } }), lastImport !== null && lastImport.imported > 0 && (_jsxs("div", { style: { marginTop: 10, fontSize: 12.5, color: '#16a34a', background: '#ecfdf3', borderRadius: 8, padding: '8px 12px' }, children: ["\u2713 \u5DF2\u5BFC\u5165\u300A", lastImport.source, "\u300B\uFF1A", lastImport.imported, " \u4E2A\u6761\u76EE\uFF0C\u5206\u7C7B\u300C", lastImport.category, "\u300D\uFF08\u53EF\u5728\u76EE\u5F55\u4E2D\u91CD\u547D\u540D / \u79FB\u52A8\uFF09"] })), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 12, borderTop: '1px solid #f3f4f6', paddingTop: 12 }, children: [_jsx("button", { style: viewMode === 'dir' ? primaryBtn : smallBtn, onClick: () => setViewMode('dir'), children: "\uD83D\uDCC2 \u76EE\u5F55" }), _jsxs("button", { style: viewMode === 'files' ? primaryBtn : smallBtn, onClick: () => { setViewMode('files'); void loadFiles(); }, children: ["\uD83D\uDCCB \u5168\u90E8\u6587\u4EF6", files.length > 0 ? `（${files.length}）` : ''] })] })] }), viewMode === 'files' ? (_jsxs("div", { style: card, children: [_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }, children: [_jsx("input", { style: { ...inputStyle, flex: '1 1 200px' }, placeholder: "\u6309\u6587\u4EF6\u540D/\u5185\u5BB9\u6458\u8981\u8FC7\u6EE4\u2026", value: fileFilter, onChange: (e) => setFileFilter(e.target.value) }), _jsxs("select", { style: catSelect, value: fileCategory, onChange: (e) => setFileCategory(e.target.value), children: [_jsx("option", { value: "", children: "\u5168\u90E8\u5206\u7C7B" }), categories.map((c) => _jsx("option", { value: c, children: c }, c))] }), _jsx("button", { style: primaryButton, onClick: () => void runClassify(), disabled: classifying, children: classifying ? 'AI 分析中…' : '🤖 AI 整理' })] }), suggestions !== null && (_jsxs("div", { style: { border: '1px solid #bfdbfe', borderRadius: 10, padding: 12, marginBottom: 12, background: '#eff6ff' }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 8 }, children: "\uD83E\uDD16 AI \u5EFA\u8BAE\uFF08\u53EA\u5EFA\u8BAE\uFF0C\u4E0D\u6539\u52A8\uFF1B\u52FE\u9009\u540E\u70B9\"\u5E94\u7528\"\uFF09" }), suggestions.map((s, i) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderTop: '1px solid #dbeafe', fontSize: 12.5 }, children: [_jsx("input", { type: "checkbox", checked: accepted.has(i), disabled: s.error !== undefined, onChange: () => {
                                            setAccepted((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(i))
                                                    next.delete(i);
                                                else
                                                    next.add(i);
                                                return next;
                                            });
                                        } }), _jsx("span", { style: { flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: s.source }), s.error !== undefined ? (_jsxs("span", { style: { color: '#dc2626', flex: 1 }, children: ["\u26A0\uFE0F ", s.error] })) : (_jsxs(_Fragment, { children: [_jsx("span", { style: { color: '#9ca3af' }, children: "\u2192" }), _jsx("span", { style: { color: '#2563eb', fontWeight: 500 }, children: s.category }), _jsxs("span", { style: { color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: [s.name, Array.isArray(s.tags) && s.tags.length > 0 ? ` · #${s.tags.join(' #')}` : ''] })] }))] }, s.source))), _jsxs("div", { style: { marginTop: 10, display: 'flex', gap: 8 }, children: [_jsxs("button", { style: primaryBtn, onClick: () => void applySuggestions(), children: ["\u5E94\u7528\u9009\u4E2D\uFF08", accepted.size, "\uFF09"] }), _jsx("button", { style: smallBtn, onClick: () => setSuggestions(null), children: "\u53D6\u6D88" })] })] })), _jsxs("div", { style: { fontSize: 12.5 }, children: [filteredFiles.length === 0 && _jsx("p", { style: { ...sub, padding: '8px 0' }, children: "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u6587\u4EF6\u3002" }), filteredFiles.map((f) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderTop: '1px solid #f3f4f6' }, children: [_jsxs("div", { style: { flex: '1 1 30%', minWidth: 0 }, children: [_jsxs("div", { style: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: ["\uD83D\uDCC4 ", f.source] }), _jsx("div", { style: { color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: f.summary || '(无文本，可能为扫描版)' })] }), _jsxs("span", { style: { fontSize: 11.5, color: '#9ca3af', flexShrink: 0 }, children: [f.count, " \u5757"] }), _jsxs("select", { style: catSelect, value: f.category, onChange: (e) => {
                                            const target = e.target.value;
                                            if (target === f.category)
                                                return;
                                            void postJson('/api/kb/move-file', { source: f.source, category: target })
                                                .then(() => Promise.all([refresh(), loadFiles()]))
                                                .catch((err) => window.alert(`移动失败：${err instanceof Error ? err.message : String(err)}`));
                                        }, children: [categories.includes(f.category) ? null : _jsx("option", { value: f.category, children: f.category }), categories.map((c) => _jsx("option", { value: c, children: c }, c))] }), _jsx("span", { style: { fontSize: 11, color: '#9ca3af', flexShrink: 0 }, children: f.updatedAt.slice(0, 16) }), _jsx("button", { style: smallBtn, onClick: () => setEditing({ kind: 'file', value: f.source }), children: "\u270F\uFE0F" }), _jsx("button", { style: { ...smallBtn, color: '#dc2626', borderColor: '#fecaca' }, onClick: () => void deleteFile(f.source), children: "\uD83D\uDDD1" })] }, f.source)))] })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { style: { ...card, marginBottom: 14 }, children: _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("input", { style: inputStyle, placeholder: "\u68C0\u7D22\u77E5\u8BC6\u5E93\u2026\uFF08\u5982\uFF1AISO9001\u3001\u53C2\u6570\u3001\u5B89\u88C5\uFF09", value: query, onChange: (e) => { setQuery(e.target.value); setSearchResults(null); }, onKeyDown: (e) => { if (e.key === 'Enter')
                                        void runSearch(); } }), _jsx("button", { style: primaryButton, onClick: () => void runSearch(), children: "\u68C0\u7D22" }), searchResults !== null && (_jsx("button", { style: button, onClick: () => { setQuery(''); setSearchResults(null); }, children: "\u8FD4\u56DE\u76EE\u5F55" }))] }) }), _jsx("div", { style: card, children: searchResults === null ? (_jsxs(_Fragment, { children: [_jsxs("div", { style: breadcrumb, children: [!isRoot && _jsx("button", { style: backBtn, onClick: () => setView({ kind: 'root' }), children: "\u2190 \u4E0A\u4E00\u7EA7" }), breadcrumbs.length > 0 && _jsx("span", { style: { color: '#9ca3af' }, children: "/" }), breadcrumbs.map((c, i) => (_jsx("span", { style: c.current ? crumbCurrent : crumb, onClick: c.onClick, children: c.label }, i))), view.kind === 'category' && (_jsx("button", { style: { ...smallBtn, marginLeft: 'auto' }, onClick: () => setEditing({ kind: 'category', value: view.category }), children: "\u91CD\u547D\u540D\u5206\u7C7B" }))] }), editing !== null && (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', padding: '0 0 10px' }, children: [_jsx("input", { ref: editInput, style: renameInput, defaultValue: editing.value, onKeyDown: (e) => {
                                                if (e.key === 'Enter')
                                                    void submitRename(e.target.value);
                                                if (e.key === 'Escape')
                                                    setEditing(null);
                                            }, onBlur: (e) => void submitRename(e.target.value) }), _jsx("button", { style: primaryBtn, onClick: (e) => void submitRename(e.target.previousElementSibling ? e.target.previousElementSibling.value : ''), children: "\u786E\u5B9A" }), _jsx("button", { style: smallBtn, onClick: () => setEditing(null), children: "\u53D6\u6D88" })] })), isRoot && (_jsxs(_Fragment, { children: [_jsx("div", { style: { display: 'flex', gap: 8, alignItems: 'center', padding: '0 0 10px' }, children: creatingCategory ? (_jsxs(_Fragment, { children: [_jsx("input", { ref: createInput, style: renameInput, placeholder: "\u8F93\u5165\u65B0\u76EE\u5F55\u540D\u79F0\uFF0C\u56DE\u8F66\u521B\u5EFA", onKeyDown: (e) => {
                                                            if (e.key === 'Enter')
                                                                void createCategory(e.target.value);
                                                            if (e.key === 'Escape')
                                                                setCreatingCategory(false);
                                                        }, onBlur: (e) => void createCategory(e.target.value) }), _jsx("button", { style: primaryBtn, onClick: (e) => void createCategory(e.target.previousElementSibling ? e.target.previousElementSibling.value : ''), children: "\u521B\u5EFA" }), _jsx("button", { style: smallBtn, onClick: () => setCreatingCategory(false), children: "\u53D6\u6D88" })] })) : (_jsx("button", { style: smallBtn, onClick: () => setCreatingCategory(true), children: "\uFF0B \u65B0\u5EFA\u76EE\u5F55" })) }), fullFolders.length === 0
                                            ? _jsx("p", { style: { ...sub, padding: '8px 0' }, children: "\u77E5\u8BC6\u5E93\u4E3A\u7A7A\uFF0C\u5148\u5BFC\u5165\u4E00\u4E2A\u6587\u4EF6\uFF0C\u6216\u65B0\u5EFA\u4E00\u4E2A\u76EE\u5F55\u3002" })
                                            : _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 4 }, children: fullFolders.map((folder) => (_jsxs("div", { style: {
                                                        display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
                                                        borderRadius: 8,
                                                        border: editing !== null && editing.kind === 'category' && editing.value === folder.category
                                                            ? '2px solid #2563eb'
                                                            : hoveredFolder === folder.category ? '1px solid #2563eb' : '1px solid transparent',
                                                        cursor: 'pointer', background: hoveredFolder === folder.category ? '#f9fafb' : 'transparent',
                                                        transition: 'border-color .15s, background .15s', position: 'relative',
                                                    }, onClick: () => setView({ kind: 'category', category: folder.category }), onMouseEnter: () => setHoveredFolder(folder.category), onMouseLeave: () => setHoveredFolder(null), children: [_jsx("span", { style: { fontSize: 18, flexShrink: 0 }, children: "\uD83D\uDCC1" }), _jsx("span", { style: { fontWeight: 600, fontSize: 14, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: folder.category }), _jsx("span", { style: { fontSize: 11.5, color: '#9ca3af', marginLeft: 4, flexShrink: 0 }, children: folder.files.length > 0 ? `${folder.files.length} 个文件 · ${folder.count} 个条目` : '空目录' }), hoveredFolder === folder.category && (_jsxs("div", { style: { marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }, onClick: (e) => e.stopPropagation(), children: [_jsx("button", { style: { ...smallBtn, border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '1px 8px', fontSize: 12, cursor: 'pointer', color: '#374151' }, onClick: () => setEditing({ kind: 'category', value: folder.category }), title: "\u91CD\u547D\u540D\u76EE\u5F55", children: "\u270F\uFE0F \u91CD\u547D\u540D" }), folder.files.length === 0 && (_jsx("button", { style: { ...smallBtn, border: '1px solid #fecaca', background: '#fff', borderRadius: 6, padding: '1px 8px', fontSize: 12, cursor: 'pointer', color: '#dc2626' }, onClick: () => void deleteCategory(folder.category), title: "\u5220\u9664\u7A7A\u76EE\u5F55", children: "\uD83D\uDDD1 \u5220\u9664" }))] }))] }, folder.category))) })] })), view.kind === 'category' && (currentFiles.length === 0
                                    ? _jsx("p", { style: { ...sub, padding: '8px 0' }, children: "\u8BE5\u5206\u7C7B\u4E3A\u7A7A\u3002" })
                                    : _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }, children: currentFiles.map((file) => {
                                            const fileChunks = categoryEntries.filter((e) => (e.source ?? '(无来源)') === file.source);
                                            const collapsed = collapsedFiles?.has(file.source) ?? false;
                                            return (_jsxs("div", { style: { border: '1px solid #f0f1f4', borderRadius: 10 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', borderRadius: 10 }, onClick: () => toggleFile(file.source), onMouseEnter: (e) => { e.currentTarget.style.background = '#f9fafb'; }, onMouseLeave: (e) => { e.currentTarget.style.background = 'transparent'; }, children: [_jsx("span", { style: { fontSize: 11, color: '#9ca3af', width: 12, flexShrink: 0 }, children: collapsed ? '▸' : '▾' }), _jsx("span", { style: iconSize, children: "\uD83D\uDCC4" }), _jsx("span", { style: { fontWeight: 600, fontSize: 13.5, color: '#1f2937' }, children: file.source }), _jsxs("span", { style: meta, children: [fileChunks.length, " \u5757 \u00B7 ", file.updatedAt] }), _jsxs("div", { style: rowActions, onClick: (e) => e.stopPropagation(), children: [moving?.source === file.source && (_jsxs("select", { autoFocus: true, style: { border: '1px solid #2563eb', borderRadius: 6, padding: '2px 6px', fontSize: 11.5 }, value: "", onChange: (e) => { if (e.target.value !== '')
                                                                            void moveTo(file.source, e.target.value); }, onBlur: () => setMoving(null), children: [_jsx("option", { value: "", disabled: true, children: "\u79FB\u52A8\u5230\u2026" }), categories.filter((c) => c !== view.category).map((c) => _jsx("option", { value: c, children: c }, c))] })), _jsx("button", { style: smallBtn, onClick: () => setMoving({ source: file.source }), children: "\u79FB\u52A8\u5230\u2026" }), _jsx("button", { style: smallBtn, onClick: () => setEditing({ kind: 'file', value: file.source }), children: "\u270F\uFE0F \u91CD\u547D\u540D" }), _jsx("button", { style: { ...smallBtn, color: '#dc2626', borderColor: '#fecaca' }, onClick: () => void deleteFile(file.source), children: "\uD83D\uDDD1 \u5220\u9664" })] })] }), !collapsed && fileChunks.map((entry) => (_jsxs("div", { style: { ...row, cursor: 'default', paddingLeft: 34, borderTop: '1px solid #f5f6f8', borderRadius: 0 }, children: [_jsx("span", { style: { fontSize: 12, color: '#cbd5e1' }, children: "\u00B7" }), _jsxs("div", { style: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }, children: [_jsx("span", { style: { fontWeight: 500, color: '#374151', flex: '0 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: entry.name }), _jsx("span", { style: { fontSize: 11.5, color: '#9ca3af', flex: '1 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: entry.summary }), entry.tags.map((tag) => (_jsx("span", { style: { display: 'inline-block', fontSize: 11, color: '#374151', background: '#f3f4f6', borderRadius: 999, padding: '1px 8px', flexShrink: 0 }, children: tag }, tag)))] }), _jsx("button", { style: { ...smallBtn, color: '#9ca3af', borderColor: 'transparent', fontSize: 13, padding: '1px 6px', flexShrink: 0 }, title: "\u5220\u9664\u8FD9\u6761\u5185\u5BB9", onClick: (e) => { e.stopPropagation(); void deleteEntry(entry.id); }, children: "\u2715" })] }, entry.id)))] }, file.source));
                                        }) }))] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }, children: [_jsxs("h3", { style: { ...heading, fontSize: 14 }, children: ["\u68C0\u7D22\u7ED3\u679C\uFF08", searchResults.length, "\uFF09"] }), _jsx("button", { style: button, onClick: () => { setQuery(''); setSearchResults(null); }, children: "\u8FD4\u56DE\u76EE\u5F55" })] }), searchResults.map((entry) => (_jsxs("div", { style: { ...row, cursor: 'default' }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }, children: [_jsx("span", { style: { color: '#374151', flex: '0 1 auto', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: entry.name }), _jsxs("span", { style: { color: '#9ca3af', fontSize: 11.5, flexShrink: 0 }, children: [entry.category, " / ", entry.source ?? ''] })] }), _jsx("div", { style: { color: '#6b7280', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, children: entry.summary })] }, entry.id)))] })) })] }))] }));
}
//# sourceMappingURL=KnowledgePanel.js.map