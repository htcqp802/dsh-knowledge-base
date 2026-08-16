/**
 * dsh-knowledge-base — 文件解析与切块（通用）。
 *
 * 支持的格式与解析方式（按可用性降级）：
 *   md / txt / json / yml   直读文本（零依赖）
 *   docx                    优先 macOS `textutil -convert txt`；其次 pandoc
 *   pdf                     优先 `pdftotext`（poppler）；缺失时用内置 pdfjs-dist 提取文本（跨平台，零系统依赖）
 *
 * 大文档按标题/段落切块，每块一条知识条目，检索更精准。
 */
import { readFileSync } from 'node:fs';
import { extname, basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
/** 单块最大长度（超出按此硬切）。 */
const CHUNK_MAX = 2000;
/** 最小块长度：小于它的相邻块会被合并，减少碎片。 */
const MIN_CHUNK = 600;
/** 读取文件文本。不支持的格式抛出带指引的错误。 */
export async function readTextFile(filePath) {
    const ext = extname(filePath).toLowerCase();
    switch (ext) {
        case '.md':
        case '.markdown':
        case '.txt':
        case '.text':
        case '.json':
        case '.yml':
        case '.yaml':
            return readFileSync(filePath, 'utf8');
        case '.docx':
        case '.doc': {
            const viaTextutil = run('textutil', ['-convert', 'txt', '-stdout', filePath]);
            if (viaTextutil.ok)
                return viaTextutil.stdout;
            const viaPandoc = run('pandoc', [filePath, '-t', 'plain']);
            if (viaPandoc.ok)
                return viaPandoc.stdout;
            throw new Error('无法解析 docx：需要 macOS textutil 或 pandoc 之一（请安装 pandoc 后重试）');
        }
        case '.pdf': {
            const viaPdftotext = run('pdftotext', [filePath, '-']);
            if (viaPdftotext.ok)
                return viaPdftotext.stdout;
            try {
                return await extractPdfWithPdfjs(filePath);
            }
            catch (error) {
                const detail = error instanceof Error ? error.message : String(error);
                throw new Error(`无法解析 pdf：${detail}。若为扫描版（图片 PDF）需 OCR，或请先转为 txt/md 再导入`);
            }
        }
        default:
            throw new Error(`暂不支持的文件类型：${ext}（支持 md/txt/json/yml/docx/pdf）`);
    }
}
/** 用 pdfjs-dist（Mozilla PDF.js，纯 JS）提取 PDF 文本。 */
async function extractPdfWithPdfjs(filePath) {
    // node 环境缺浏览器 DOM 全局（DOMMatrix 等）；pdfjs 文本提取只用 2D 矩阵部分，
    // 提供最小 polyfill（覆盖构造/属性同步/translate/scale/rotate/multiply/inverse/transformPoint）。
    installPdfjsPolyfills();
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(readFileSync(filePath));
    const loadingTask = getDocument({
        data,
        // node 下 cmaps/字体通过 file:// URL 提供给 pdfjs（内置资源，无需网络）。
        cMapUrl: pathToFileURL(join(fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url)), 'cmaps') + '/').href,
        cMapPacked: true,
        standardFontDataUrl: pathToFileURL(join(fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url)), 'standard_fonts') + '/').href,
    });
    const doc = await loadingTask.promise;
    try {
        const parts = [];
        for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
            const page = await doc.getPage(pageNo);
            try {
                const content = await page.getTextContent();
                const text = content.items
                    .map((item) => ('str' in item ? item.str : ''))
                    .join('');
                parts.push(text);
            }
            finally {
                page.cleanup();
            }
        }
        return parts.join('\n');
    }
    finally {
        await loadingTask.destroy();
    }
}
/** 按标题/段落切块。块上限约 2000 字符，超限硬切。 */
export function chunkText(text, sourceName) {
    const lines = text.split(/\r?\n/);
    const chunks = [];
    let current = [];
    let currentTitle;
    const flush = () => {
        const body = current.join('\n').trim();
        if (body === '')
            return;
        const title = currentTitle ?? firstMeaningfulLine(body);
        const label = title.length > 40 ? `${title.slice(0, 40)}…` : title;
        chunks.push({
            name: `${sourceName} · ${label}`,
            summary: body.slice(0, 120).replace(/\s+/g, ' ').trim(),
            payload: body,
        });
        current = [];
        currentTitle = undefined;
    };
    for (const line of lines) {
        const heading = /^(#{1,4})\s+(.+)$/.exec(line.trim());
        if (heading !== null) {
            flush();
            currentTitle = (heading[2] ?? '').trim();
            current.push(line);
            continue;
        }
        current.push(line);
        if (current.join('\n').length >= CHUNK_MAX)
            flush();
    }
    flush();
    // 空文件兜底：给一条占位条目，避免知识库吞掉文件却无内容可查。
    if (chunks.length === 0) {
        chunks.push({ name: sourceName, summary: '(文件无有效文本内容)', payload: text.slice(0, 2000) });
    }
    return mergeSmallChunks(chunks, sourceName);
}
/**
 * 相邻小块合并：标题密集导致的碎片（如每个小标题只有一两行）合并成更完整的块，
 * 减少条目数量、提升检索命中与可读性。块不小于 MIN_CHUNK 为止（末尾不足也并入前一块）。
 */
function mergeSmallChunks(chunks, sourceName) {
    if (chunks.length <= 1)
        return chunks;
    const merged = [];
    for (const chunk of chunks) {
        const last = merged[merged.length - 1];
        if (last !== undefined && chunk.payload.length < MIN_CHUNK && last.payload.length + chunk.payload.length <= CHUNK_MAX * 2) {
            // 并入前一块（保留分隔），并刷新名称/摘要。
            last.payload = `${last.payload}\n\n${chunk.payload}`;
            last.summary = last.payload.slice(0, 120).replace(/\s+/g, ' ').trim();
            const title = firstMeaningfulLine(last.payload);
            const label = title.length > 40 ? `${title.slice(0, 40)}…` : title;
            last.name = `${sourceName} · ${label}`;
        }
        else {
            merged.push({ ...chunk });
        }
    }
    return merged;
}
/** 解析并切块一个文件。 */
export async function parseDocument(filePath) {
    const source = basename(filePath);
    const text = await readTextFile(filePath);
    const chunks = chunkText(text, source);
    return { source, chunks };
}
/**
 * 启发式建议分类：把文件名与首段文本与类别名/类别关键词做匹配，
 * 命中第一个即返回；未命中返回空（由用户/AI 决定）。
 */
export function suggestCategory(filePath, text, categories) {
    const haystack = `${basename(filePath)} ${text.slice(0, 300)}`;
    for (const category of categories) {
        // 类别名本身就是关键词（如"文档"）；同时允许类别名拆词匹配。
        if (haystack.includes(category))
            return category;
    }
    return undefined;
}
/** 块内第一行有意义的文本（作为条目名兜底）。 */
function firstMeaningfulLine(body) {
    const line = body.split('\n').find((l) => l.trim() !== '');
    return (line ?? '未命名片段').trim().slice(0, 60);
}
/** 运行外部命令并捕获 stdout（静默失败）。 */
function run(cmd, args) {
    try {
        const result = spawnSync(cmd, [...args], { encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
        if (result.status === 0)
            return { ok: true, stdout: result.stdout ?? '' };
        return { ok: false, stdout: '' };
    }
    catch {
        return { ok: false, stdout: '' };
    }
}
/**
 * 最小 DOMMatrix polyfill（node 环境；仅覆盖 pdfjs 文本提取用到的 2D 矩阵能力）。
 * 不参与渲染，够 getTextContent 使用即可。
 */
function installPdfjsPolyfills() {
    const g = globalThis;
    if (g.DOMMatrix === undefined) {
        class DOMMatrix {
            m11 = 1;
            m12 = 0;
            m13 = 0;
            m14 = 0;
            m21 = 0;
            m22 = 1;
            m23 = 0;
            m24 = 0;
            m31 = 0;
            m32 = 0;
            m33 = 1;
            m34 = 0;
            m41 = 0;
            m42 = 0;
            m43 = 0;
            m44 = 1;
            a = 1;
            b = 0;
            c = 0;
            d = 1;
            e = 0;
            f = 0;
            constructor(init) {
                this.#sync();
                if (init === undefined || init === null)
                    return;
                if (typeof init === 'string') {
                    const m = /matrix\(([^)]+)\)/.exec(init);
                    if (m !== null) {
                        const nums = (m[1] ?? '').split(',').map((n) => Number(n) || 0);
                        if (nums.length === 6) {
                            const g = (i) => nums[i] ?? 0;
                            this.#set2d(g(0), g(1), g(2), g(3), g(4), g(5));
                        }
                    }
                    return;
                }
                if (Array.isArray(init)) {
                    if (init.length === 16) {
                        const arr = init;
                        const get = (i) => arr[i] ?? 0;
                        this.m11 = get(0);
                        this.m12 = get(1);
                        this.m13 = get(2);
                        this.m14 = get(3);
                        this.m21 = get(4);
                        this.m22 = get(5);
                        this.m23 = get(6);
                        this.m24 = get(7);
                        this.m31 = get(8);
                        this.m32 = get(9);
                        this.m33 = get(10);
                        this.m34 = get(11);
                        this.m41 = get(12);
                        this.m42 = get(13);
                        this.m43 = get(14);
                        this.m44 = get(15);
                        this.#sync();
                    }
                    return;
                }
                if (typeof init === 'object') {
                    const o = init;
                    if (o.m11 !== undefined) {
                        this.m11 = o.m11 ?? 1;
                        this.m12 = o.m12 ?? 0;
                        this.m13 = o.m13 ?? 0;
                        this.m14 = o.m14 ?? 0;
                        this.m21 = o.m21 ?? 0;
                        this.m22 = o.m22 ?? 1;
                        this.m23 = o.m23 ?? 0;
                        this.m24 = o.m24 ?? 0;
                        this.m31 = o.m31 ?? 0;
                        this.m32 = o.m32 ?? 0;
                        this.m33 = o.m33 ?? 1;
                        this.m34 = o.m34 ?? 0;
                        this.m41 = o.m41 ?? 0;
                        this.m42 = o.m42 ?? 0;
                        this.m43 = o.m43 ?? 0;
                        this.m44 = o.m44 ?? 1;
                    }
                    else {
                        this.#set2d(o.a ?? 1, o.b ?? 0, o.c ?? 0, o.d ?? 1, o.e ?? 0, o.f ?? 0);
                    }
                }
            }
            #set2d(a, b, c, d, e, f) {
                this.m11 = a;
                this.m12 = b;
                this.m13 = 0;
                this.m14 = 0;
                this.m21 = c;
                this.m22 = d;
                this.m23 = 0;
                this.m24 = 0;
                this.m31 = 0;
                this.m32 = 0;
                this.m33 = 1;
                this.m34 = 0;
                this.m41 = e;
                this.m42 = f;
                this.m43 = 0;
                this.m44 = 1;
                this.#sync();
            }
            #sync() {
                this.a = this.m11;
                this.b = this.m12;
                this.c = this.m21;
                this.d = this.m22;
                this.e = this.m41;
                this.f = this.m42;
            }
            #values() {
                return [this.m11, this.m12, this.m21, this.m22, this.m41, this.m42];
            }
            set(...args) {
                if (args.length >= 6) {
                    const g = (i) => args[i] ?? 0;
                    this.#set2d(g(0), g(1), g(2), g(3), g(4), g(5));
                }
                return this;
            }
            multiply(other) {
                return new DOMMatrix(multiply2d(this.#values(), other.#values()));
            }
            multiplySelf(other) {
                this.#set2d(...multiply2d(this.#values(), other.#values()));
                return this;
            }
            preMultiplySelf(other) {
                this.#set2d(...multiply2d(other.#values(), this.#values()));
                return this;
            }
            translate(tx, ty) {
                return new DOMMatrix(multiply2d(this.#values(), [1, 0, 0, 1, tx, ty]));
            }
            translateSelf(tx, ty) {
                this.#set2d(...multiply2d(this.#values(), [1, 0, 0, 1, tx, ty]));
                return this;
            }
            scale(sx, sy) {
                return new DOMMatrix(multiply2d(this.#values(), [sx, 0, 0, sy, 0, 0]));
            }
            scaleSelf(sx, sy) {
                this.#set2d(...multiply2d(this.#values(), [sx, 0, 0, sy, 0, 0]));
                return this;
            }
            rotate(angle) {
                const rad = (angle * Math.PI) / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                return new DOMMatrix(multiply2d(this.#values(), [cos, sin, -sin, cos, 0, 0]));
            }
            inverse() {
                const [a, b, c, d, e, f] = this.#values();
                const det = a * d - b * c;
                if (det === 0)
                    return new DOMMatrix();
                return new DOMMatrix([d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]);
            }
            transformPoint(p) {
                const [a, b, c, d, e, f] = this.#values();
                return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
            }
        }
        g.DOMMatrix = DOMMatrix;
    }
    if (g.DOMPoint === undefined) {
        g.DOMPoint = class {
            x = 0;
            y = 0;
            z = 0;
            w = 1;
            constructor(x = 0, y = 0, z = 0, w = 1) {
                this.x = x;
                this.y = y;
                this.z = z;
                this.w = w;
            }
        };
    }
}
/** 2D 矩阵乘法（[a,b,c,d,e,f] 表示 a=m11, b=m12, c=m21, d=m22, e=m41, f=m42）。 */
function multiply2d(left, right) {
    const [a1, b1, c1, d1, e1, f1] = left;
    const [a2, b2, c2, d2, e2, f2] = right;
    return [
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    ];
}
//# sourceMappingURL=parse.js.map