<div align="center">

# 🐳 dsh-knowledge-base

**DeepSeek Harness (DSH) 通用知识库插件**

文件导入 · 目录化管理 · FTS5 全文检索 · 知识库管理 UI

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen)](package.json)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[English](README.md) · **简体中文** · [Español](README.es.md) · [日本語](README.ja.md)

</div>

---

**dsh-knowledge-base** 把文档变成 DeepSeek Harness agent 可检索的知识库：丢进一个 PDF、Word 或 Markdown 文件，自动解析、按章节切块入库，agent 即可用 FTS5（BM25）相关度排序检索。内置 Web 管理界面支持像文件管理器一样管理知识库：新建/重命名/删除目录、移动文件、浏览内容。

## ✨ 功能特性

- 📥 **导入任意文件** — `md / txt / json / yml / docx / pdf`，无大小限制；PDF 内置 [pdfjs-dist](https://github.com/mozilla/pdf.js) 解析（跨平台、零系统依赖）
- 🔪 **自动切块** — 按标题/段落切块，大文档拆成多条可检索条目；相邻小块自动合并，减少碎片
- 🔁 **覆盖更新** — 同名文件重新导入 = 覆盖，不重复堆积
- 🗂 **目录化管理** — 分类即目录：新建 / 重命名 / 删除（空）/ 移动文件，像操作系统文件管理器
- 🔍 **FTS5 全文检索** — SQLite FTS5（trigram tokenizer，中文免分词）+ BM25 相关度排序；短词/异常自动回退 LIKE
- 🤖 **Agent 原生工具** — `kb_query` / `kb_import` / `kb_list` / `kb_update` / `kb_delete`，模型在对话中直接使用
- 🖥 **Web 管理界面** — 会话视图「知识库」tab：拖拽导入、目录浏览、分类管理、检索
- ⚙️ **分类体系可配置** — 默认不预置任何分类（适用于任意领域），运行时可在 UI 直接新建目录

## 🚀 安装

```sh
dsh plugin --profile web add dsh-knowledge-base
```

> 依赖：DeepSeek Harness（`dsh`）环境提供 `@deepseek-ai/*` 运行时；Node ≥ 22.5（内置 `node:sqlite`）。

## 🏃 快速开始

**方式一：Web 界面（推荐）**
1. 启动 dsh Web：`dsh web`（或 `dsh --profile web`）
2. 打开浏览器，新建会话 → 会话视图顶部切换到「**知识库**」tab
3. 拖拽文件导入 → 自动切块入库 → 在目录中浏览 / 重命名 / 移动
4. 在对话中让 agent 检索：*"用 kb_query 查一下 ISO9001"*

**方式二：Agent 工具（headless / 任意 profile）**
```
导入：  用 kb_import 导入 /path/to/手册.pdf，分类"文档"，标签 ["手册"]
检索：  用 kb_query 查 "变压器"
浏览：  用 kb_list / kb_list 分类=文档
修改：  用 kb_update 改 id=3 的分类为"文档"
删除：  用 kb_delete 删除 id=3
```

## ⚙️ 配置

```yaml
# 在 profile 的 cordis.patch.yml 或安装 bundle 时配置
# 默认不预置任何分类（适用于任意领域）；未指定分类的条目归入"未分类"。
# 也可在 UI 中直接新建目录（持久化，无需改配置）。
- id: knowledge-base
  name: 'dsh-knowledge-base'
  config:
    categories:            # 按需配置，例如：
      - 文档
      - 手册
```

## 🗂 Web API（供 UI 与第三方集成）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/kb/import` | 上传文件（base64 JSON）→ 解析切块入库 |
| GET | `/api/kb/list` | 列出条目与分类 |
| GET | `/api/kb/search?q=` | 全文检索（FTS5 + BM25） |
| POST | `/api/kb/update` | 修改条目分类/标签 |
| POST | `/api/kb/rename-category` | 分类重命名 |
| POST | `/api/kb/create-category` | 新建目录（持久化） |
| POST | `/api/kb/delete-category` | 删除空目录 |
| POST | `/api/kb/move-file` | 文件移动（改分类） |
| POST | `/api/kb/rename-file` | 文件重命名 |
| POST | `/api/kb/delete-file` | 删除整个文件 |
| POST | `/api/kb/delete-entry` | 删除单个条目 |

## 🏗 架构

```
dsh-knowledge-base（一个 npm 包，三个插件行）
├── dsh-knowledge-base          host 工具：kb_query / kb_import / kb_list / kb_update / kb_delete
├── dsh-knowledge-base/web      Web 端点：/api/kb/*（仅 web 组合挂载）
└── (client 半部)               会话视图「知识库」tab + 目录浏览器 UI
```

数据存储（默认）：
```
$DSH_HOME/knowledge-base/kb.sqlite    # 知识数据 + FTS5 索引 + meta（自定义分类）
$DSH_HOME/knowledge-base/inbox/       # 上传临时目录（导入后自动清理）
```

表：`kb(id, category, name, summary, payload, tags, source, updated_at)` + `kb_fts`（FTS5 外部内容表）+ `meta`（动态分类）。

## 🔧 开发

```sh
npm run build                     # tsc 类型检查 + tsdown 打包（host 半部 + client bundle）

# 本地验证（使用工作区内的测试 home，绝不污染 ~/.dsh）
DSH_HOME=$PWD/.dsh-home DSH_TELEMETRY_DISABLED=1 \
  dsh --profile headless --patch dev-headless.cordis.yml \
  "用 kb_import 导入 /tmp/测试.md，然后 kb_query 检索 '关键词'"
```

> 开源独立仓库随附 `dev.cordis.yml` / `dev-headless.cordis.yml` 用于本地验证。
> 开发期 `@deepseek-ai/*` 依赖通过 `scripts/link-official-deps.mjs` 链接官方 checkout（symlink），
> 详见 [AGENTS.md](AGENTS.md)「依赖说明」。

## 🗺 路线图

- [x] 文件导入（md/txt/json/yml/docx/pdf）
- [x] 目录化管理（新建/重命名/删除/移动）
- [x] FTS5 全文检索（BM25 + 中文 trigram）
- [x] 知识库管理 Web UI
- [ ] AI 自动分类（导入端点直连 `ctx.llm` 结构化分类）
- [ ] 条目详情查看/编辑
- [ ] OCR（扫描版 PDF）
- [ ] 中文分词升级（自建 tokenizer 替代 trigram）

## 🤝 参与贡献

欢迎 PR！请先阅读 [AGENTS.md](AGENTS.md)（agent 开发指南）。提交前：
1. `npm run build` 通过
2. headless 工具链路自测通过
3. 不提交本地数据（`.dsh-home/`、`.test-workspace/` 等，见 [.gitignore](.gitignore)）

## 📄 许可证

[MIT](LICENSE) © dsh-knowledge-base contributors

## 🔗 相关项目

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Everything is a Plugin
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — 社区插件精选列表
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF 解析引擎
