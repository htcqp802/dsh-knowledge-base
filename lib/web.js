import { _ as upsertEntry, a as deleteFile, c as listEntries, d as removeCategory, f as renameCategory, g as updateEntry, h as searchKb, i as deleteEntry, l as moveFile, m as renameFile, n as suggestCategory, o as getCustomCategories, p as renameCustomCategory, r as addCategory, s as kbRoot, t as parseDocument, u as openKb } from "./parse-ByetpssQ.js";
import Schema from "@deepseek-ai/schemastery";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
//#region lib/types/web.js
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
const name = "dsh-knowledge-base/web";
const Config = Schema.object({ categories: Schema.array(String).default([]) });
const inject = [
	"tools",
	"webServer",
	"llm",
	"agentDefaultModel"
];
function apply(ctx, config) {
	const db = openKb();
	const { webServer } = ctx;
	webServer.register({
		kind: "exact",
		path: "/api/kb/import",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const name = String(body.name ?? "");
				const contentBase64 = String(body.contentBase64 ?? "");
				if (name === "" || contentBase64 === "") return sendJson(res, 400, { error: "name 与 contentBase64 必填" });
				const inbox = join(kbRoot(), "inbox");
				mkdirSync(inbox, { recursive: true });
				const tmpPath = join(inbox, sanitize(name));
				writeFileSync(tmpPath, Buffer.from(contentBase64, "base64"));
				try {
					const parsed = await parseDocument(tmpPath);
					const suggested = suggestCategory(name, parsed.chunks[0]?.payload ?? "", config.categories);
					const category = typeof body.category === "string" && body.category !== "" ? body.category : suggested ?? defaultCategory(config.categories);
					const ids = [];
					for (const chunk of parsed.chunks) ids.push(upsertEntry(db, {
						category,
						name: chunk.name,
						summary: chunk.summary,
						payload: chunk.payload,
						tags: [],
						source: parsed.source
					}));
					return sendJson(res, 200, {
						imported: parsed.chunks.length,
						source: parsed.source,
						ids,
						category,
						suggestedCategory: suggested ?? null,
						categories: allCategories(db, config.categories),
						chunks: parsed.chunks.map((c) => ({
							name: c.name,
							summary: c.summary
						}))
					});
				} finally {
					rmSync(tmpPath, { force: true });
				}
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/update",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const id = Number(body.id);
				const category = String(body.category ?? "");
				const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
				if (!Number.isFinite(id) || category === "") return sendJson(res, 400, { error: "id 与 category 必填" });
				updateEntry(db, id, category, tags);
				return sendJson(res, 200, {
					updated: id,
					category,
					tags
				});
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/list",
		handler: async (req, res) => {
			const category = new URL(req.url ?? "/", "http://localhost").searchParams.get("category") ?? void 0;
			const rows = listEntries(db, category);
			sendJson(res, 200, {
				matched: rows.length,
				categories: allCategories(db, config.categories),
				category: category ?? "all",
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
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/search",
		handler: async (req, res) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			const q = url.searchParams.get("q") ?? "";
			const categoryParam = url.searchParams.get("category");
			if (q === "") return sendJson(res, 400, { error: "q 必填" });
			const rows = categoryParam === null ? searchKb(db, { query: q }) : searchKb(db, {
				query: q,
				category: categoryParam
			});
			sendJson(res, 200, {
				matched: rows.length,
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
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/rename-category",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const oldCategory = String(body.oldCategory ?? "");
				const newCategory = String(body.newCategory ?? "").trim();
				if (oldCategory === "" || newCategory === "") return sendJson(res, 400, { error: "oldCategory 与 newCategory 必填" });
				if (oldCategory === newCategory) return sendJson(res, 200, { renamed: 0 });
				const changed = renameCategory(db, oldCategory, newCategory);
				renameCustomCategory(db, oldCategory, newCategory);
				return sendJson(res, 200, {
					renamed: changed,
					from: oldCategory,
					to: newCategory
				});
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/create-category",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const name = String(body.name ?? "").trim();
				if (name === "") return sendJson(res, 400, { error: "name 必填" });
				return sendJson(res, 200, {
					created: addCategory(db, name),
					name,
					categories: allCategories(db, config.categories)
				});
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/delete-category",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const name = String(body.name ?? "");
				if (name === "") return sendJson(res, 400, { error: "name 必填" });
				if (!removeCategory(db, name)) return sendJson(res, 400, { error: "目录下有条目，无法删除（请先移动或清空）" });
				return sendJson(res, 200, {
					deleted: name,
					categories: allCategories(db, config.categories)
				});
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/move-file",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const source = String(body.source ?? "");
				const category = String(body.category ?? "");
				if (source === "" || category === "") return sendJson(res, 400, { error: "source 与 category 必填" });
				return sendJson(res, 200, {
					moved: moveFile(db, source, category),
					source,
					category
				});
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/rename-file",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const source = String(body.source ?? "");
				const newSource = String(body.newSource ?? "").trim();
				if (source === "" || newSource === "") return sendJson(res, 400, { error: "source 与 newSource 必填" });
				if (source === newSource) return sendJson(res, 200, { renamed: 0 });
				return sendJson(res, 200, {
					renamed: renameFile(db, source, newSource),
					from: source,
					to: newSource
				});
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/delete-file",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const source = String(body.source ?? "");
				if (source === "") return sendJson(res, 400, { error: "source 必填" });
				return sendJson(res, 200, {
					deleted: deleteFile(db, source),
					source
				});
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/delete-entry",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const id = Number(body.id);
				if (!Number.isFinite(id)) return sendJson(res, 400, { error: "id 必填" });
				deleteEntry(db, id);
				return sendJson(res, 200, { deleted: id });
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/files",
		handler: async (_req, res) => {
			sendJson(res, 200, {
				files: db.prepare("SELECT source, category, COUNT(*) AS n, MAX(updated_at) AS t FROM kb GROUP BY source ORDER BY t DESC").all().map((r) => {
					const first = db.prepare("SELECT summary FROM kb WHERE source = ? ORDER BY id LIMIT 1").get(r.source);
					return {
						source: r.source,
						category: r.category,
						count: r.n,
						updatedAt: r.t,
						summary: first?.summary ?? ""
					};
				}),
				categories: allCategories(db, config.categories)
			});
		}
	});
	webServer.register({
		kind: "exact",
		path: "/api/kb/classify",
		handler: async (req, res) => {
			try {
				const body = await readJsonBody(req);
				const sources = Array.isArray(body.sources) ? body.sources.map(String) : void 0;
				const targets = sources !== void 0 ? sources.map((source) => ({ source })) : db.prepare("SELECT source FROM kb GROUP BY source HAVING category = '未分类' ORDER BY MAX(updated_at) DESC LIMIT 20").all();
				const llm = ctx.get("llm");
				const defaultModel = ctx.get("agentDefaultModel")?.currentSelection?.();
				const categories = allCategories(db, config.categories);
				const suggestions = [];
				for (const target of targets) {
					const content = collectFileContent(db, target.source);
					if (content.length < 20) {
						suggestions.push({
							source: target.source,
							error: "文件无有效文本（可能为扫描版），需 OCR 后才能分析"
						});
						continue;
					}
					try {
						const suggestion = await classifyWithLlm(llm, defaultModel, target.source, content, categories);
						suggestions.push(suggestion);
					} catch (error) {
						suggestions.push({
							source: target.source,
							error: `AI 分析失败：${error instanceof Error ? error.message : String(error)}`
						});
					}
				}
				return sendJson(res, 200, { suggestions });
			} catch (error) {
				return sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
			}
		}
	});
	return () => {
		db.close();
	};
}
/** 读取并解析 JSON 请求体（不设大小上限；大文件以 base64 上传时注意内存占用）。 */
function readJsonBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		req.on("data", (chunk) => {
			chunks.push(chunk);
		});
		req.on("end", () => {
			try {
				const raw = Buffer.concat(chunks).toString("utf8");
				resolve(JSON.parse(raw));
			} catch {
				reject(/* @__PURE__ */ new Error("请求体不是合法 JSON"));
			}
		});
		req.on("error", reject);
	});
}
function sendJson(res, status, data) {
	const body = JSON.stringify(data);
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(body);
}
/** 文件名安全化。 */
function sanitize(name) {
	return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}
/** payload 可能是 JSON 或 Markdown。 */
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
/** 合并后的全量分类：配置默认值 ∪ 手动新建的空目录 ∪ 条目实际出现的分类。 */
function allCategories(db, configCategories) {
	const set = new Set(configCategories);
	for (const c of getCustomCategories(db)) set.add(c);
	const rows = db.prepare("SELECT DISTINCT category FROM kb").all();
	for (const row of rows) set.add(row.category);
	return [...set];
}
/** 收集某文件的可读内容（前若干条切块的 payload，截断）。 */
function collectFileContent(db, source) {
	return db.prepare("SELECT payload FROM kb WHERE source = ? ORDER BY id LIMIT 5").all(source).map((r) => r.payload).join("\n").slice(0, 3e3);
}
/** 调用 LLM 对单个文件生成分类/改名/标签建议（JSON）。 */
async function classifyWithLlm(llm, defaultModel, source, content, categories) {
	if (llm === void 0 || defaultModel === void 0) throw new Error("LLM 服务不可用");
	const { provider, model } = defaultModel;
	const prepared = await llm.prepareCall({
		provider,
		model,
		maxTokens: 500
	});
	const system = "你是文档分类助手。分析文档内容，只输出一个 JSON 对象（不要其他文字）：{\"category\": 分类名, \"name\": 规范的文件名(不带扩展名,中文), \"tags\": [1-3个简短标签]}。分类优先从可用分类中选；都不合适可以提一个新分类名。";
	const prompt = `文档标题：${source}\n可用分类：${categories.join(" / ")}\n文档内容（节选）：\n${content}`;
	let text = "";
	for await (const chunk of prepared.stream({
		...prepared.config,
		system,
		messages: [{
			role: "user",
			content: [{
				type: "text",
				text: prompt
			}]
		}]
	})) if (chunk.type === "text-delta" && chunk.text !== void 0) text += chunk.text;
	const jsonText = /\{[\s\S]*\}/.exec(text)?.[0] ?? text;
	const parsed = JSON.parse(jsonText);
	return {
		source,
		category: typeof parsed.category === "string" ? parsed.category : "",
		name: typeof parsed.name === "string" ? parsed.name : "",
		tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : []
	};
}
//#endregion
export { Config, apply, inject, name };
