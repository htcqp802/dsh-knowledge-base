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

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only：拉入 locale 插件对 Context 的合并（ctx.locale）。
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only：拉入 ui-sidebar 对 SlotMap 的声明（sidebar.footer.action）。
import { KnowledgePanel } from './KnowledgePanel.tsx'

/** 本插件拥有的字典命名空间与键集合。 */
export type KnowledgeBaseKey = 'view.knowledgeBase'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'knowledge.base': KnowledgeBaseKey
  }
}

const NS = 'knowledge.base'

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, {
    zh: { 'view.knowledgeBase': '知识库' },
    en: { 'view.knowledgeBase': 'Knowledge Base' },
  }), 'dsh-knowledge-base: dictionaries')

  const t = (ctx.get('locale') as { bind: (ns: string) => (key: string) => string }).bind(NS)

  // 会话视图 tab：知识库。
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'knowledge-base',
    order: 30,
    locale: NS,
    label: () => t('view.knowledgeBase'),
  }, KnowledgePanel))

}
