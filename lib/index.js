import { _ as upsertEntry, c as listEntries, g as updateEntry, h as searchKb, i as deleteEntry, n as suggestCategory, t as parseDocument, u as openKb } from "./parse-ByetpssQ.js";
import Schema from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
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
