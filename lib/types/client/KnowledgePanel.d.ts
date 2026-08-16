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
import { type ReactNode } from 'react';
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
export declare function KnowledgePanel(_props: ConvViewProps): ReactNode;
//# sourceMappingURL=KnowledgePanel.d.ts.map