/**
 * dsh-knowledge-base — 浏览器半部：知识库管理视图。
 *
 * 注册一个会话视图 tab「知识库」，提供：
 *   - 拖拽 / 选择文件导入（POST /api/kb/import，base64 JSON）
 *   - 条目列表 + 分类下拉确认（GET /api/kb/list + POST /api/kb/update）
 *   - 关键词检索（GET /api/kb/search）
 *
 * 端点由同插件的 host 半部（src/web.ts）在 web 组合中注册，走同源 fetch。
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** 本插件拥有的字典命名空间与键集合。 */
export type KnowledgeBaseKey = 'view.knowledgeBase';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'knowledge.base': KnowledgeBaseKey;
    }
}
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map