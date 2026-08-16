<div align="center">

# 🐳 dsh-knowledge-base

**A general-purpose knowledge base plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH)**

Import documents · organize in folders · full-text search · manage in the Web UI

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen)](package.json)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)
[![Topic: dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-8257D0)](https://github.com/topics/dsh-plugin)

**English** · [简体中文](README.zh.md) · [Español](README.es.md) · [日本語](README.ja.md)

</div>

---

**dsh-knowledge-base** turns documents into a searchable knowledge base for DeepSeek Harness agents. Drop in a PDF, Word, or Markdown file — it is parsed, chunked by section, and instantly searchable by your agent with FTS5 (BM25) ranked retrieval. A built-in Web UI lets you manage the knowledge base like a file manager: create/rename/delete folders, move files, and browse content.

## ✨ Features

- 📥 **Import anything** — `md / txt / json / yml / docx / pdf`, no size limit; PDF is parsed in-process with [pdfjs-dist](https://github.com/mozilla/pdf.js) (cross-platform, zero system dependencies)
- 🔪 **Auto-chunking** — documents are split by headings/paragraphs; adjacent small chunks are merged to reduce fragmentation
- 🔁 **Upsert** — re-importing the same file overwrites it; no duplicate accumulation
- 🗂 **Folder management** — categories are folders: create / rename / delete (empty) / move files, like an OS file manager
- 🔍 **FTS5 full-text search** — SQLite FTS5 (trigram tokenizer, no Chinese segmentation needed) + BM25 relevance ranking; falls back to LIKE for short queries or anomalies
- 🤖 **Agent-native tools** — `kb_query` / `kb_import` / `kb_list` / `kb_update` / `kb_delete`, usable directly by the model in conversation
- 🖥 **Web management UI** — a "Knowledge Base" tab in the conversation view: drag-and-drop import, directory browsing, category management, search
- ⚙️ **Configurable categories** — no preset categories by default (fits any domain); create folders at runtime from the UI

## 🚀 Install

```sh
dsh plugin --profile web add dsh-knowledge-base
```

> Dependencies: DeepSeek Harness (`dsh`) provides the `@deepseek-ai/*` runtime; Node ≥ 22.5 (built-in `node:sqlite`).

## 🏃 Quick Start

**Via the Web UI (recommended)**
1. Start dsh Web: `dsh web` (or `dsh --profile web`)
2. Open your browser, create a session, and switch to the **Knowledge Base** tab at the top of the session view
3. Drag and drop files to import → auto-chunked → browse / rename / move in the directory view
4. Ask your agent in chat: *"Use kb_query to search for ISO9001"*

**Via agent tools (headless / any profile)**
```
import:  Use kb_import to import /path/to/manual.pdf, category "Documents", tags ["manual"]
search:  Use kb_query to search for "transformer"
list:    Use kb_list / kb_list category=Documents
update:  Use kb_update to change id=3's category to "Documents"
delete:  Use kb_delete to delete id=3
```

## ⚙️ Configuration

```yaml
# In the profile's cordis.patch.yml or when installing the bundle
# No categories are preset (fits any domain); entries without a category go to "Uncategorized".
# You can also create folders directly in the UI (persisted, no config edit needed).
- id: knowledge-base
  name: 'dsh-knowledge-base'
  config:
    categories:            # configure as needed, e.g.:
      - Documents
      - Manuals
```

## 🗂 Web API (for the UI and third-party integrations)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/kb/import` | Upload a file (base64 JSON) → parse, chunk, store |
| GET | `/api/kb/list` | List entries and categories |
| GET | `/api/kb/search?q=` | Full-text search (FTS5 + BM25) |
| POST | `/api/kb/update` | Update an entry's category/tags |
| POST | `/api/kb/rename-category` | Rename a category |
| POST | `/api/kb/create-category` | Create a folder (persisted) |
| POST | `/api/kb/delete-category` | Delete an empty folder |
| POST | `/api/kb/move-file` | Move a file (change category) |
| POST | `/api/kb/rename-file` | Rename a file |
| POST | `/api/kb/delete-file` | Delete an entire file |
| POST | `/api/kb/delete-entry` | Delete a single entry |

## 🏗 Architecture

```
dsh-knowledge-base (one npm package, three plugin rows)
├── dsh-knowledge-base          host tools: kb_query / kb_import / kb_list / kb_update / kb_delete
├── dsh-knowledge-base/web      Web endpoints: /api/kb/* (web composition only)
└── (client half)               "Knowledge Base" conversation view tab + directory browser UI
```

Data storage (default):
```
$DSH_HOME/knowledge-base/kb.sqlite    # entries + FTS5 index + meta (dynamic categories)
$DSH_HOME/knowledge-base/inbox/       # upload temp dir (cleaned up after import)
```

Tables: `kb(id, category, name, summary, payload, tags, source, updated_at)` + `kb_fts` (FTS5 external-content table) + `meta` (dynamic categories).

## 🔧 Development

```sh
npm run build                     # tsc type-check + tsdown bundle (host half + client bundle)

# Local verification (use a workspace-local test home, never touch ~/.dsh)
DSH_HOME=$PWD/.dsh-home DSH_TELEMETRY_DISABLED=1 \
  dsh --profile headless --patch dev-headless.cordis.yml \
  "Use kb_import to import /tmp/test.md, then kb_query to search for 'keyword'"
```

> The standalone repo ships `dev.cordis.yml` / `dev-headless.cordis.yml` for local verification.
> During development the `@deepseek-ai/*` dependencies are symlinked from an official checkout via
> `scripts/link-official-deps.mjs` — see [AGENTS.md](AGENTS.md) → "Dependencies".

## 🗺 Roadmap

- [x] File import (md/txt/json/yml/docx/pdf)
- [x] Folder management (create/rename/delete/move)
- [x] FTS5 full-text search (BM25 + Chinese trigram)
- [x] Knowledge base management Web UI
- [ ] AI auto-classification (direct `ctx.llm` structured calls on import)
- [ ] Entry detail view/edit
- [ ] OCR (scanned PDFs)
- [ ] Better Chinese tokenization (custom tokenizer instead of trigram)

## 🤝 Contributing

PRs welcome! Please read [AGENTS.md](AGENTS.md) (agent development guide) first. Before submitting:
1. `npm run build` passes
2. The headless tool chain is self-tested
3. No local data is committed (`.dsh-home/`, `.test-workspace/`, etc. — see [.gitignore](.gitignore))

## 📄 License

[MIT](LICENSE) © dsh-knowledge-base contributors

## 🔗 Related

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Everything is a Plugin
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — curated community plugin list
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF parsing engine
