import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { DatabaseSync } from "node:sqlite";
import { homedir } from "node:os";
import { mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
//#region lib/types/kb.js
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
/** 知识库根目录。 */
function kbRoot() {
	return join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "knowledge-base");
}
/** 知识库数据文件绝对路径。 */
function kbPath() {
	return join(kbRoot(), "kb.sqlite");
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
`;
/** 打开（必要时创建）知识库，并保证 FTS 索引与数据一致。 */
function openKb() {
	const path = kbPath();
	mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec(SCHEMA);
	syncFts(db);
	return db;
}
/** 写一行 FTS 索引（外部内容表：按 rowid 对应 kb.id）。 */
function ftsInsert(db, id, name, summary, payload, tags) {
	db.prepare("INSERT INTO kb_fts(rowid, name, summary, payload, tags) VALUES (?, ?, ?, ?, ?)").run(id, name, summary, payload, tags);
}
/** 删除一行 FTS 索引。对不存在的 rowid 必须先跳过——外部内容表对不存在行执行 'delete' 会损坏整个索引（SQLite FTS5 已知坑）。 */
function ftsDelete(db, id) {
	if (db.prepare("SELECT rowid FROM kb_fts WHERE rowid = ?").get(id) === void 0) return;
	db.prepare("INSERT INTO kb_fts(kb_fts, rowid, name, summary, payload, tags) VALUES ('delete', ?, '', '', '', '')").run(id);
}
/** 索引与数据行数不一致时全量重建（首次升级/异常恢复）。 */
function syncFts(db) {
	if (db.prepare("SELECT COUNT(*) AS n FROM kb").get().n === db.prepare("SELECT COUNT(*) AS n FROM kb_fts").get().n) return;
	db.exec("INSERT INTO kb_fts(kb_fts) VALUES ('delete-all')");
	const rows = db.prepare("SELECT id, name, summary, payload, tags FROM kb").all();
	const insert = db.prepare("INSERT INTO kb_fts(rowid, name, summary, payload, tags) VALUES (?, ?, ?, ?, ?)");
	for (const row of rows) insert.run(row.id, row.name, row.summary, row.payload, row.tags);
}
function rowToKbRow(row) {
	return {
		id: row.id,
		category: row.category,
		name: row.name,
		summary: row.summary,
		payload: row.payload,
		tags: JSON.parse(row.tags || "[]"),
		source: row.source ?? null,
		updatedAt: row.updated_at
	};
}
/**
* 写入一条知识条目（同名同来源 = 覆盖更新）。
* @returns 条目 id。
*/
function upsertEntry(db, input) {
	const tags = JSON.stringify(input.tags ?? []);
	const payload = typeof input.payload === "string" ? input.payload : JSON.stringify(input.payload);
	if (input.source !== void 0) {
		const existing = db.prepare("SELECT id FROM kb WHERE source = ? AND name = ?").get(input.source, input.name);
		if (existing !== void 0) {
			db.prepare(`
        UPDATE kb SET category = ?, summary = ?, payload = ?, tags = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(input.category, input.summary, payload, tags, existing.id);
			ftsDelete(db, existing.id);
			ftsInsert(db, existing.id, input.name, input.summary, payload, tags);
			return existing.id;
		}
		const result = db.prepare(`
      INSERT INTO kb (category, name, summary, payload, tags, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(input.category, input.name, input.summary, payload, tags, input.source);
		const id = Number(result.lastInsertRowid);
		ftsInsert(db, id, input.name, input.summary, payload, tags);
		return id;
	}
	const result = db.prepare(`
    INSERT INTO kb (category, name, summary, payload, tags, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `).run(input.category, input.name, input.summary, payload, tags);
	const id = Number(result.lastInsertRowid);
	ftsInsert(db, id, input.name, input.summary, payload, tags);
	return id;
}
/** 更新条目的分类与标签（同步 FTS：tags 变化）。 */
function updateEntry(db, id, category, tags) {
	db.prepare("UPDATE kb SET category = ?, tags = ?, updated_at = datetime('now') WHERE id = ?").run(category, JSON.stringify(tags ?? []), id);
	const row = db.prepare("SELECT name, summary, payload FROM kb WHERE id = ?").get(id);
	if (row !== void 0) {
		ftsDelete(db, id);
		ftsInsert(db, id, row.name, row.summary, row.payload, JSON.stringify(tags ?? []));
	}
}
/** 列出条目（可按 category 过滤，按更新时间倒序）。 */
function listEntries(db, category) {
	const where = category !== void 0 && category !== "" ? "WHERE category = ?" : "";
	const params = [];
	if (category !== void 0 && category !== "") params.push(category);
	return db.prepare(`
    SELECT id, category, name, summary, payload, tags, source, updated_at
    FROM kb ${where}
    ORDER BY updated_at DESC, id DESC
    LIMIT 1000
  `).all(...params).map(rowToKbRow);
}
/**
* 关键词检索：优先 FTS5（trigram，中文 3 字滑窗子串匹配 + BM25 相关度排序）；
* 查询词不足 3 字符或 FTS 异常/无结果时回退 LIKE 子串匹配。可按 category 过滤。
*/
function searchKb(db, args) {
	const q = args.query.trim();
	if (q === "") return [];
	const category = args.category !== void 0 && args.category !== "" ? args.category : void 0;
	if (q.length >= 3) try {
		const match = `"${q.replaceAll("\"", "\"\"")}"`;
		const sql = category !== void 0 ? `
          SELECT kb.id, kb.category, kb.name, kb.summary, kb.payload, kb.tags, kb.source, kb.updated_at
          FROM kb JOIN kb_fts ON kb_fts.rowid = kb.id
          WHERE kb.category = ? AND kb_fts MATCH ?
          ORDER BY bm25(kb_fts)
          LIMIT 50` : `
          SELECT kb.id, kb.category, kb.name, kb.summary, kb.payload, kb.tags, kb.source, kb.updated_at
          FROM kb JOIN kb_fts ON kb_fts.rowid = kb.id
          WHERE kb_fts MATCH ?
          ORDER BY bm25(kb_fts)
          LIMIT 50`;
		const params = category !== void 0 ? [category, match] : [match];
		const rows = db.prepare(sql).all(...params);
		if (rows.length > 0) return rows.map(rowToKbRow);
	} catch {}
	const like = `%${q}%`;
	const where = category !== void 0 ? "category = ? AND (name LIKE ? OR summary LIKE ? OR payload LIKE ? OR tags LIKE ?)" : "(name LIKE ? OR summary LIKE ? OR payload LIKE ? OR tags LIKE ?)";
	const params = [];
	if (category !== void 0) params.push(category);
	params.push(like, like, like, like);
	return db.prepare(`
    SELECT id, category, name, summary, payload, tags, source, updated_at
    FROM kb
    WHERE ${where}
    ORDER BY updated_at DESC, id DESC
    LIMIT 50
  `).all(...params).map(rowToKbRow);
}
/** 删除条目（同步 FTS）。 */
function deleteEntry(db, id) {
	db.prepare("DELETE FROM kb WHERE id = ?").run(id);
	ftsDelete(db, id);
}
//#endregion
//#region lib/types/parse.js
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
/** 单块最大长度（超出按此硬切）。 */
const CHUNK_MAX = 2e3;
/** 最小块长度：小于它的相邻块会被合并，减少碎片。 */
const MIN_CHUNK = 600;
/** 读取文件文本。不支持的格式抛出带指引的错误。 */
async function readTextFile(filePath) {
	const ext = extname(filePath).toLowerCase();
	switch (ext) {
		case ".md":
		case ".markdown":
		case ".txt":
		case ".text":
		case ".json":
		case ".yml":
		case ".yaml": return readFileSync(filePath, "utf8");
		case ".docx":
		case ".doc": {
			const viaTextutil = run("textutil", [
				"-convert",
				"txt",
				"-stdout",
				filePath
			]);
			if (viaTextutil.ok) return viaTextutil.stdout;
			const viaPandoc = run("pandoc", [
				filePath,
				"-t",
				"plain"
			]);
			if (viaPandoc.ok) return viaPandoc.stdout;
			throw new Error("无法解析 docx：需要 macOS textutil 或 pandoc 之一（请安装 pandoc 后重试）");
		}
		case ".pdf": {
			const viaPdftotext = run("pdftotext", [filePath, "-"]);
			if (viaPdftotext.ok) return viaPdftotext.stdout;
			try {
				return await extractPdfWithPdfjs(filePath);
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				throw new Error(`无法解析 pdf：${detail}。若为扫描版（图片 PDF）需 OCR，或请先转为 txt/md 再导入`);
			}
		}
		default: throw new Error(`暂不支持的文件类型：${ext}（支持 md/txt/json/yml/docx/pdf）`);
	}
}
/** 用 pdfjs-dist（Mozilla PDF.js，纯 JS）提取 PDF 文本。 */
async function extractPdfWithPdfjs(filePath) {
	installPdfjsPolyfills();
	const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
	const loadingTask = getDocument({
		data: new Uint8Array(readFileSync(filePath)),
		cMapUrl: pathToFileURL(join(fileURLToPath(new URL("../node_modules/pdfjs-dist/", import.meta.url)), "cmaps") + "/").href,
		cMapPacked: true,
		standardFontDataUrl: pathToFileURL(join(fileURLToPath(new URL("../node_modules/pdfjs-dist/", import.meta.url)), "standard_fonts") + "/").href
	});
	const doc = await loadingTask.promise;
	try {
		const parts = [];
		for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
			const page = await doc.getPage(pageNo);
			try {
				const text = (await page.getTextContent()).items.map((item) => "str" in item ? item.str : "").join("");
				parts.push(text);
			} finally {
				page.cleanup();
			}
		}
		return parts.join("\n");
	} finally {
		await loadingTask.destroy();
	}
}
/** 按标题/段落切块。块上限约 2000 字符，超限硬切。 */
function chunkText(text, sourceName) {
	const lines = text.split(/\r?\n/);
	const chunks = [];
	let current = [];
	let currentTitle;
	const flush = () => {
		const body = current.join("\n").trim();
		if (body === "") return;
		const title = currentTitle ?? firstMeaningfulLine(body);
		const label = title.length > 40 ? `${title.slice(0, 40)}…` : title;
		chunks.push({
			name: `${sourceName} · ${label}`,
			summary: body.slice(0, 120).replace(/\s+/g, " ").trim(),
			payload: body
		});
		current = [];
		currentTitle = void 0;
	};
	for (const line of lines) {
		const heading = /^(#{1,4})\s+(.+)$/.exec(line.trim());
		if (heading !== null) {
			flush();
			currentTitle = (heading[2] ?? "").trim();
			current.push(line);
			continue;
		}
		current.push(line);
		if (current.join("\n").length >= CHUNK_MAX) flush();
	}
	flush();
	if (chunks.length === 0) chunks.push({
		name: sourceName,
		summary: "(文件无有效文本内容)",
		payload: text.slice(0, 2e3)
	});
	return mergeSmallChunks(chunks, sourceName);
}
/**
* 相邻小块合并：标题密集导致的碎片（如每个小标题只有一两行）合并成更完整的块，
* 减少条目数量、提升检索命中与可读性。块不小于 MIN_CHUNK 为止（末尾不足也并入前一块）。
*/
function mergeSmallChunks(chunks, sourceName) {
	if (chunks.length <= 1) return chunks;
	const merged = [];
	for (const chunk of chunks) {
		const last = merged[merged.length - 1];
		if (last !== void 0 && chunk.payload.length < MIN_CHUNK && last.payload.length + chunk.payload.length <= CHUNK_MAX * 2) {
			last.payload = `${last.payload}\n\n${chunk.payload}`;
			last.summary = last.payload.slice(0, 120).replace(/\s+/g, " ").trim();
			const title = firstMeaningfulLine(last.payload);
			last.name = `${sourceName} · ${title.length > 40 ? `${title.slice(0, 40)}…` : title}`;
		} else merged.push({ ...chunk });
	}
	return merged;
}
/** 解析并切块一个文件。 */
async function parseDocument(filePath) {
	const source = basename(filePath);
	return {
		source,
		chunks: chunkText(await readTextFile(filePath), source)
	};
}
/**
* 启发式建议分类：把文件名与首段文本与类别名/类别关键词做匹配，
* 命中第一个即返回；未命中返回空（由用户/AI 决定）。
*/
function suggestCategory(filePath, text, categories) {
	const haystack = `${basename(filePath)} ${text.slice(0, 300)}`;
	for (const category of categories) if (haystack.includes(category)) return category;
}
/** 块内第一行有意义的文本（作为条目名兜底）。 */
function firstMeaningfulLine(body) {
	return (body.split("\n").find((l) => l.trim() !== "") ?? "未命名片段").trim().slice(0, 60);
}
/** 运行外部命令并捕获 stdout（静默失败）。 */
function run(cmd, args) {
	try {
		const result = spawnSync(cmd, [...args], {
			encoding: "utf8",
			timeout: 3e4,
			maxBuffer: 64 * 1024 * 1024
		});
		if (result.status === 0) return {
			ok: true,
			stdout: result.stdout ?? ""
		};
		return {
			ok: false,
			stdout: ""
		};
	} catch {
		return {
			ok: false,
			stdout: ""
		};
	}
}
/**
* 最小 DOMMatrix polyfill（node 环境；仅覆盖 pdfjs 文本提取用到的 2D 矩阵能力）。
* 不参与渲染，够 getTextContent 使用即可。
*/
function installPdfjsPolyfills() {
	const g = globalThis;
	if (g.DOMMatrix === void 0) {
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
				if (init === void 0 || init === null) return;
				if (typeof init === "string") {
					const m = /matrix\(([^)]+)\)/.exec(init);
					if (m !== null) {
						const nums = (m[1] ?? "").split(",").map((n) => Number(n) || 0);
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
				if (typeof init === "object") {
					const o = init;
					if (o.m11 !== void 0) {
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
					} else this.#set2d(o.a ?? 1, o.b ?? 0, o.c ?? 0, o.d ?? 1, o.e ?? 0, o.f ?? 0);
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
				return [
					this.m11,
					this.m12,
					this.m21,
					this.m22,
					this.m41,
					this.m42
				];
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
				return new DOMMatrix(multiply2d(this.#values(), [
					1,
					0,
					0,
					1,
					tx,
					ty
				]));
			}
			translateSelf(tx, ty) {
				this.#set2d(...multiply2d(this.#values(), [
					1,
					0,
					0,
					1,
					tx,
					ty
				]));
				return this;
			}
			scale(sx, sy) {
				return new DOMMatrix(multiply2d(this.#values(), [
					sx,
					0,
					0,
					sy,
					0,
					0
				]));
			}
			scaleSelf(sx, sy) {
				this.#set2d(...multiply2d(this.#values(), [
					sx,
					0,
					0,
					sy,
					0,
					0
				]));
				return this;
			}
			rotate(angle) {
				const rad = angle * Math.PI / 180;
				const cos = Math.cos(rad);
				const sin = Math.sin(rad);
				return new DOMMatrix(multiply2d(this.#values(), [
					cos,
					sin,
					-sin,
					cos,
					0,
					0
				]));
			}
			inverse() {
				const [a, b, c, d, e, f] = this.#values();
				const det = a * d - b * c;
				if (det === 0) return new DOMMatrix();
				return new DOMMatrix([
					d / det,
					-b / det,
					-c / det,
					a / det,
					(c * f - d * e) / det,
					(b * e - a * f) / det
				]);
			}
			transformPoint(p) {
				const [a, b, c, d, e, f] = this.#values();
				return {
					x: a * p.x + c * p.y + e,
					y: b * p.x + d * p.y + f
				};
			}
		}
		g.DOMMatrix = DOMMatrix;
	}
	if (g.DOMPoint === void 0) g.DOMPoint = class {
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
		b1 * e2 + d1 * f2 + f1
	];
}
//#endregion
//#region lib/types/index.js
/**
* dsh-knowledge-base — 通用知识库插件（host 半部，工具面）。
*
* 工具：
*   kb_query   关键词检索（可按分类过滤）
*   kb_import  导入本机文件（md/txt/json/yml/docx/pdf）→ 切块入库
*   kb_list    列出条目（可按分类过滤）
*   kb_delete  删除条目
*
* 分类体系由 config.categories 配置（管理员可增删）；
* 导入时分类由调用方（agent）决定，未指定则用启发式建议。
*
* web 上传端点见 ./web.ts（另一插件行，仅 web 组合挂载）。
*/
const name = "dsh-knowledge-base";
const Config = Schema.object({ categories: Schema.array(String).default([]) });
const inject = ["tools"];
function apply(ctx, config) {
	const db = openKb();
	ctx.tools.register(defineTool({
		name: "kb_query",
		description: "检索知识库（kb = Knowledge Base，知识库）。按关键词在名称/摘要/内容/标签上匹配，可按分类过滤。知识库内容来自 kb_import 或 Web 界面导入的文档。典型用法：回答业务问题前先查知识库是否有相关资料。",
		parameters: {
			query: {
				type: "string",
				required: true,
				description: "检索关键词"
			},
			category: {
				type: "string",
				description: `按分类过滤（可选）：${config.categories.length > 0 ? config.categories.join(" / ") : "未配置分类"}`
			}
		},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		async execute(args) {
			const rows = searchKb(db, args);
			if (rows.length === 0) return JSON.stringify({
				matched: 0,
				hint: `知识库中未找到与 "${args.query}" 相关的内容`
			});
			return JSON.stringify({
				matched: rows.length,
				query: args.query,
				category: args.category ?? "all",
				rows: rows.map((r) => ({
					id: r.id,
					category: r.category,
					name: r.name,
					summary: r.summary,
					source: r.source,
					updatedAt: r.updatedAt,
					tags: r.tags,
					detail: safeJson(r.payload)
				}))
			});
		}
	}));
	ctx.tools.register(defineTool({
		name: "kb_import",
		description: "导入本机文件到知识库（支持 md/txt/json/yml/docx/pdf）。文件按标题/段落自动切块，每块成为一条可检索条目；同名文件重新导入 = 覆盖更新。导入时给出 category（分类）与 tags（标签）；未指定则自动建议分类。典型用法：把产品手册、规范书、认证文件等导入知识库。",
		parameters: {
			path: {
				type: "string",
				required: true,
				description: "本机文件绝对路径"
			},
			category: {
				type: "string",
				description: `分类（可选）：${config.categories.length > 0 ? config.categories.join(" / ") : "未配置分类，可留空"}；未指定时自动建议`
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "标签列表（可选），如 [\"ISO9001\",\"SCB14\"]"
			}
		},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		async execute(args) {
			const parsed = await parseDocument(args.path);
			const category = args.category ?? suggestCategory(args.path, parsed.chunks[0]?.payload ?? "", config.categories) ?? defaultCategory(config.categories);
			const tags = args.tags ?? [];
			const ids = [];
			for (const chunk of parsed.chunks) ids.push(upsertEntry(db, {
				category,
				name: chunk.name,
				summary: chunk.summary,
				payload: chunk.payload,
				tags,
				source: parsed.source
			}));
			return JSON.stringify({
				imported: parsed.chunks.length,
				source: parsed.source,
				category,
				ids,
				note: "如需调整分类或标签，请用 kb_list 找到条目后通过 kb_update 修改"
			});
		}
	}));
	ctx.tools.register(defineTool({
		name: "kb_list",
		description: "列出知识库条目（可按分类过滤），返回 id/分类/名称/来源/更新时间。",
		parameters: { category: {
			type: "string",
			description: `按分类过滤（可选）：${config.categories.length > 0 ? config.categories.join(" / ") : "未配置分类"}`
		} },
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		async execute(args) {
			const rows = listEntries(db, args.category);
			return JSON.stringify({
				matched: rows.length,
				category: args.category ?? "all",
				rows: rows.map((r) => ({
					id: r.id,
					category: r.category,
					name: r.name,
					summary: r.summary,
					source: r.source,
					updatedAt: r.updatedAt,
					tags: r.tags
				}))
			});
		}
	}));
	ctx.tools.register(defineTool({
		name: "kb_update",
		description: "修改知识库条目的分类与标签（导入后分类不当时使用）。",
		parameters: {
			id: {
				type: "number",
				required: true,
				description: "条目 id（来自 kb_list / kb_query）"
			},
			category: {
				type: "string",
				required: true,
				description: `新分类：${config.categories.join(" / ")}`
			},
			tags: {
				type: "array",
				items: { type: "string" },
				description: "新标签列表"
			}
		},
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		async execute(args) {
			updateEntry(db, args.id, args.category, args.tags);
			return JSON.stringify({
				updated: args.id,
				category: args.category
			});
		}
	}));
	ctx.tools.register(defineTool({
		name: "kb_delete",
		description: "删除知识库条目。",
		parameters: { id: {
			type: "number",
			required: true,
			description: "条目 id（来自 kb_list / kb_query）"
		} },
		output: {
			schema: { type: "string" },
			render: (_args, value) => [{
				type: "text",
				text: value
			}]
		},
		async execute(args) {
			deleteEntry(db, args.id);
			return JSON.stringify({ deleted: args.id });
		}
	}));
	return () => {
		db.close();
	};
}
/** payload 可能是 JSON 或 Markdown：能解析则解析，否则原样返回。 */
function safeJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
/** 未命中启发式时的兜底分类：归入中性的"未分类"，由用户后续手动归类。 */
function defaultCategory(_categories) {
	return "未分类";
}
//#endregion
export { Config, apply, inject, name };
