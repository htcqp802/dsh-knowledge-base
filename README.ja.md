<div align="center">

# 🐳 dsh-knowledge-base

**[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）向け汎用ナレッジベースプラグイン**

ドキュメントの取り込み · フォルダ管理 · 全文検索 · Web UI での管理

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen)](package.json)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[English](README.md) · [简体中文](README.zh.md) · [Español](README.es.md) · **日本語**

</div>

---

**dsh-knowledge-base** は、DeepSeek Harness のエージェント向けにドキュメントを検索可能なナレッジベースへ変換します。PDF・Word・Markdown をドロップするだけで、解析・セクション単位の分割・FTS5（BM25）による関連度順検索が即座に利用できます。内蔵の Web UI ではファイルマネージャーのように知識ベースを管理できます：フォルダの作成・名前変更・削除、ファイルの移動、コンテンツの閲覧。

## ✨ 特徴

- 📥 **あらゆる形式を取り込み** — `md / txt / json / yml / docx / pdf`、サイズ制限なし。PDF は [pdfjs-dist](https://github.com/mozilla/pdf.js) でプロセス内解析（クロスプラットフォーム、システム依存なし）
- 🔪 **自動チャンク分割** — 見出し/段落で分割し、隣接する小さなチャンクは自動マージ
- 🔁 **上書き更新** — 同じファイルの再取り込みは上書き。重複は蓄積しません
- 🗂 **フォルダ管理** — カテゴリ＝フォルダ：作成 / 名前変更 / 削除（空のみ）/ ファイル移動
- 🔍 **FTS5 全文検索** — SQLite FTS5（trigram トークナイザ、中国語の分かち書き不要）+ BM25 関連度順。短いクエリや異常時は LIKE にフォールバック
- 🤖 **エージェント用ツール** — `kb_query` / `kb_import` / `kb_list` / `kb_update` / `kb_delete`、会話中にモデルが直接利用可能
- 🖥 **Web 管理 UI** — 会話ビューの「ナレッジベース」タブ：ドラッグ＆ドロップ取り込み、フォルダ閲覧、カテゴリ管理、検索
- ⚙️ **カテゴリ設定可能** — デフォルトでカテゴリをプリセットしません（あらゆる分野に対応）。UI から実行時にフォルダを作成可能

## 🚀 インストール

```sh
dsh plugin --profile web add dsh-knowledge-base
```

> 依存：`@deepseek-ai/*` ランタイムは DeepSeek Harness（`dsh`）が提供。Node ≥ 22.5（`node:sqlite` 内蔵）。

## 🏃 クイックスタート

**Web UI を使用（推奨）**
1. dsh Web を起動: `dsh web`（または `dsh --profile web`）
2. セッションを作成し、ビュー上部の「**ナレッジベース**」タブへ切り替え
3. ファイルをドラッグ＆ドロップで取り込み → 自動チャンク → フォルダビューで閲覧 / 名前変更 / 移動
4. チャットでエージェントに依頼: *"kb_query で ISO9001 を検索して"*

**エージェントツールを使用（headless / 任意のプロファイル）**
```
取り込み:  kb_import で /path/to/manual.pdf をインポート、カテゴリ "Documents"、タグ ["manual"]
検索:      kb_query で "transformer" を検索
一覧:      kb_list / kb_list category=Documents
更新:      kb_update で id=3 のカテゴリを "Documents" に変更
削除:      kb_delete で id=3 を削除
```

## ⚙️ 設定

```yaml
# プロファイルの cordis.patch.yml またはバンドルインストール時
# デフォルトでカテゴリはプリセットされません。カテゴリ未指定のエントリは「未分類」になります。
- id: knowledge-base
  name: 'dsh-knowledge-base'
  config:
    categories:            # 必要に応じて設定、例:
      - Documents
      - Manuals
```

## 🗂 Web API（UI とサードパーティ連携向け）

| Method | Path | 用途 |
|---|---|---|
| POST | `/api/kb/import` | ファイルをアップロード（base64 JSON）→ 解析・チャンク・保存 |
| GET | `/api/kb/list` | エントリとカテゴリの一覧 |
| GET | `/api/kb/search?q=` | 全文検索（FTS5 + BM25） |
| POST | `/api/kb/update` | エントリのカテゴリ/タグを更新 |
| POST | `/api/kb/rename-category` | カテゴリ名の変更 |
| POST | `/api/kb/create-category` | フォルダ作成（永続化） |
| POST | `/api/kb/delete-category` | 空フォルダの削除 |
| POST | `/api/kb/move-file` | ファイル移動（カテゴリ変更） |
| POST | `/api/kb/rename-file` | ファイル名の変更 |
| POST | `/api/kb/delete-file` | ファイル全体を削除 |
| POST | `/api/kb/delete-entry` | 単一エントリの削除 |

## 🏗 アーキテクチャ

```
dsh-knowledge-base（1 npm パッケージ、3 つのプラグイン行）
├── dsh-knowledge-base          host ツール: kb_query / kb_import / kb_list / kb_update / kb_delete
├── dsh-knowledge-base/web      Web エンドポイント: /api/kb/*（web 構成のみ）
└── (client 側)                 「ナレッジベース」タブ + フォルダブラウザ UI
```

データ保存（デフォルト）：
```
$DSH_HOME/knowledge-base/kb.sqlite    # エントリ + FTS5 インデックス + meta（動的カテゴリ）
$DSH_HOME/knowledge-base/inbox/       # アップロード一時ディレクトリ（取り込み後に自動削除）
```

テーブル：`kb(id, category, name, summary, payload, tags, source, updated_at)` + `kb_fts`（FTS5 外部コンテンツテーブル）+ `meta`（動的カテゴリ）。

## 🔧 開発

```sh
npm run build                     # tsc 型チェック + tsdown バンドル（host + client bundle）

# ローカル検証（ワークスペース内のテスト用 home を使用。~/.dsh は触らないこと）
DSH_HOME=$PWD/.dsh-home DSH_TELEMETRY_DISABLED=1 \
  dsh --profile headless --patch dev-headless.cordis.yml \
  "kb_import で /tmp/test.md をインポートし、kb_query で 'keyword' を検索して"
```

> リポジトリには `dev.cordis.yml` / `dev-headless.cordis.yml` を同梱（ローカル検証用）。
> 開発中、`@deepseek-ai/*` 依存は `scripts/link-official-deps.mjs` で公式 checkout からシンボリックリンクします
> — [AGENTS.md](AGENTS.md) → "Dependencies" 参照。

## 🗺 ロードマップ

- [x] ファイル取り込み（md/txt/json/yml/docx/pdf）
- [x] フォルダ管理（作成/名前変更/削除/移動）
- [x] FTS5 全文検索（BM25 + 中国語 trigram）
- [x] ナレッジベース管理 Web UI
- [ ] AI 自動分類（取り込み時の `ctx.llm` 直接呼び出し）
- [ ] エントリ詳細表示/編集
- [ ] OCR（スキャン PDF）
- [ ] より良い中国語トークナイズ（trigram の代わりに独自トークナイザ）

## 🤝 コントリビュート

PR 歓迎！先に [AGENTS.md](AGENTS.md)（エージェント向け開発ガイド）をお読みください。送信前：
1. `npm run build` が通ること
2. headless ツールチェーンが自己テスト済みであること
3. ローカルデータ（`.dsh-home/`、`.test-workspace/` など）をコミットしないこと（[.gitignore](.gitignore) 参照）

## 📄 ライセンス

[MIT](LICENSE) © dsh-knowledge-base contributors

## 🔗 関連

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Everything is a Plugin
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — コミュニティプラグインリスト
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF 解析エンジン
