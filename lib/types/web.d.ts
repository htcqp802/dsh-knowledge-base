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
import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "dsh-knowledge-base/web";
export interface Config {
    categories: string[];
}
export declare const Config: Schema<Config>;
export declare const inject: string[];
export declare function apply(ctx: Context, config: Config): (() => void) | void;
//# sourceMappingURL=web.d.ts.map