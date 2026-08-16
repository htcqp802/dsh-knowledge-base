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
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-knowledge-base";
export interface Config {
    /** 知识库分类体系（单值归档维度），可增删。 */
    categories: string[];
}
export declare const Config: Schema<Config>;
export declare const inject: string[];
export declare function apply(ctx: Context, config: Config): (() => void) | void;
//# sourceMappingURL=index.d.ts.map