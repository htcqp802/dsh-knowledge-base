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
import { KnowledgePanel } from "./KnowledgePanel.js";
const NS = 'knowledge.base';
export const inject = ['slots', 'locale'];
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, {
        zh: { 'view.knowledgeBase': '知识库' },
        en: { 'view.knowledgeBase': 'Knowledge Base' },
    }), 'dsh-knowledge-base: dictionaries');
    const t = ctx.get('locale').bind(NS);
    // 会话视图 tab：知识库。
    ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'knowledge-base',
        order: 30,
        locale: NS,
        label: () => t('view.knowledgeBase'),
    }, KnowledgePanel));
}
//# sourceMappingURL=index.js.map