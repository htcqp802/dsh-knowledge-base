# AGENTS.md — 给 AI Agent 的项目指南

> 本文件为 **AI 编程代理**（Claude Code / Cline / Copilot / Cursor / DeepSeek Harness 等）编写，
> 让代理无需完整阅读源码即可正确理解、构建、测试和扩展本项目。

## 项目是什么

`dsh-knowledge-base` 是一个 **DeepSeek Harness（DSH）插件**：把文档（md/txt/json/yml/docx/pdf）变成
可检索的知识库，供 agent 对话中检索使用；附带一个目录浏览器风格的 Web 管理界面。

- 宿主：DeepSeek Harness（`dsh`）——"Everything is a Plugin" 框架
- 语言：TypeScript；运行时 Node ≥ 22.5（依赖内置 `node:sqlite`）
- 存储：SQLite（`kb` 表 + FTS5 索引 `kb_fts` + `meta` 表）

## 目录结构

```
src/
├── index.ts          # host 插件：注册 kb_query/kb_import/kb_list/kb_update/kb_delete 工具
├── kb.ts             # SQLite 核心：增删改查 + FTS5 同步 + 动态分类（meta 表）
├── parse.ts          # 文件解析：md/txt 直读、docx(textutil/pandoc)、pdf(pdfjs-dist + DOMMatrix polyfill)
├── web.ts            # Web 端点插件行：/api/kb/*（仅 web 组合挂载）
└── client/
    ├── index.ts      # 浏览器半部：注册会话视图「知识库」tab
    └── KnowledgePanel.tsx  # 目录浏览器 UI（导入/浏览/新建/重命名/删除/移动/检索）
```

## 关键命令

```sh
npm run build         # tsc 类型检查 + tsdown 打包（host 半部 + client bundle）
```

## 验证方式（重要：别污染真实环境）

所有 dsh 命令必须使用**工作区内的测试 home**，绝不碰真实 `~/.dsh`：

```sh
# headless 工具链路验证（无需浏览器）
DSH_HOME=$PWD/.dsh-home DSH_TELEMETRY_DISABLED=1 \
  dsh --profile headless --patch dev-headless.cordis.yml \
  "用 kb_import 导入 /tmp/测试.md，然后 kb_query 检索 '关键词'"
```

Web UI 验证（端口避开 3080 现有实例）：

```sh
DSH_HOME=$PWD/.dsh-home dsh web --patch dev.cordis.yml --port 3091
```

## 架构要点（改代码前必读）

1. **双插件行**：`src/index.ts`（工具，任意 profile 可用）和 `src/web.ts`（HTTP 端点，仅 web 组合）——headless 验证用 `dev-headless.cordis.yml`（不含 web 行），web 用 `dev.cordis.yml`。
2. **client 半部构建**：改 `src/client/*` 后必须 `npm run build`，且 dev.cordis.yml 中 knowledge-base 行用包名 `dsh-knowledge-base`（client-modules 从 package.json 的 `dsh.client` 发现 bundle）；包需链接进 profile 的 `node_modules`。
3. **FTS5 同步**：`kb.ts` 中所有增删改（`upsertEntry`/`updateEntry`/`deleteEntry`/`deleteFile`）必须同步维护 `kb_fts`（外部内容表）；`openKb` 自动全量回填（`syncFts`）。
4. **搜索降级**：`searchKb` 优先 FTS5（trigram，需 ≥3 字符），空结果/短词/异常回退 LIKE。
5. **动态分类**：分类 = 配置的 categories ∪ `meta.custom_categories`（UI 新建的目录）∪ 条目实际分类；默认不预置任何分类，未指定分类的条目归入「未分类」；`addCategory`/`removeCategory` 只改 meta 表（不写配置）。
6. **PDF 解析**：`parse.ts` 用 pdfjs-dist，Node 环境需 `installPdfjsPolyfills()`（DOMMatrix/DOMPoint 最小 polyfill，勿删）。
7. **切块**：`chunkText` 按标题切块 + 超长硬切（2000 字符）+ `mergeSmallChunks` 合并 <600 字符碎片。

## 依赖说明

- 运行时：`@deepseek-ai/*`（cordis/dsh-tools/schemastery/client-*）由 DSH 宿主提供（peerDependencies）；`pdfjs-dist` 是唯一第三方运行时依赖
- 开发期：官方 checkout 的 `@deepseek-ai` 包通过 `scripts/link-official-deps.mjs` 链接（symlink），不用 npm registry（版本与本地 checkout 一致）

## 提交前检查清单

- [ ] `npm run build` 通过（tsc 零错误）
- [ ] headless 验证：kb_import 导入 → kb_query 检索命中
- [ ] 若改了 web.ts：curl 测对应 `/api/kb/*` 端点
- [ ] 若改了 client：确认 client bundle 进入 boot graph（`curl :3091/ | grep knowledge-base`）
- [ ] 不提交 `.dsh-home/`、`.test-workspace/`、`node_modules/`、`lib/`
