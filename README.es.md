<div align="center">

# 🐳 dsh-knowledge-base

**Un plugin de base de conocimiento de propósito general para [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH)**

Importa documentos · organízalos en carpetas · búsqueda de texto completo · gestión en la interfaz web

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.5-brightgreen)](package.json)
[![Awesome DSH Plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[English](README.md) · [简体中文](README.zh.md) · **Español** · [日本語](README.ja.md)

</div>

---

**dsh-knowledge-base** convierte documentos en una base de conocimiento buscable para los agentes de DeepSeek Harness. Suelta un archivo PDF, Word o Markdown: se analiza, se divide en secciones y queda al instante disponible para la búsqueda con ranking FTS5 (BM25). Una interfaz web integrada permite gestionar la base de conocimiento como un gestor de archivos: crear/renombrar/eliminar carpetas, mover archivos y navegar por el contenido.

## ✨ Características

- 📥 **Importa cualquier cosa** — `md / txt / json / yml / docx / pdf`, sin límite de tamaño; los PDF se analizan en proceso con [pdfjs-dist](https://github.com/mozilla/pdf.js) (multiplataforma, sin dependencias del sistema)
- 🔪 **Fragmentación automática** — los documentos se dividen por títulos/párrafos; los fragmentos pequeños adyacentes se fusionan para reducir la fragmentación
- 🔁 **Upsert** — reimportar el mismo archivo lo sobrescribe; sin acumulación de duplicados
- 🗂 **Gestión de carpetas** — las categorías son carpetas: crear / renombrar / eliminar (vacías) / mover archivos
- 🔍 **Búsqueda FTS5** — SQLite FTS5 (tokenizador trigram, sin necesidad de segmentación china) + orden por relevancia BM25; retrocede a LIKE en consultas cortas o anomalías
- 🤖 **Herramientas nativas para agentes** — `kb_query` / `kb_import` / `kb_list` / `kb_update` / `kb_delete`
- 🖥 **Interfaz web de gestión** — pestaña "Base de conocimiento" en la vista de conversación: importación por arrastrar y soltar, navegación por carpetas, gestión de categorías, búsqueda
- ⚙️ **Categorías configurables** — sin categorías predefinidas (vale para cualquier dominio); crea carpetas en tiempo de ejecución desde la interfaz

## 🚀 Instalación

```sh
dsh plugin --profile web add dsh-knowledge-base
```

> Dependencias: DeepSeek Harness (`dsh`) proporciona el runtime `@deepseek-ai/*`; Node ≥ 22.5 (incluye `node:sqlite`).

## 🏃 Inicio rápido

**Mediante la interfaz web (recomendado)**
1. Inicia dsh Web: `dsh web` (o `dsh --profile web`)
2. Crea una sesión y cambia a la pestaña **Base de conocimiento**
3. Arrastra y suelta archivos para importarlos → se fragmentan → navega / renombra / mueve en la vista de carpetas
4. Pregunta a tu agente: *"Usa kb_query para buscar ISO9001"*

**Mediante herramientas del agente (headless / cualquier perfil)**
```
importar:  Usa kb_import para importar /ruta/manual.pdf, categoría "Documentos", etiquetas ["manual"]
buscar:    Usa kb_query para buscar "transformador"
listar:    Usa kb_list / kb_list categoría=Documentos
modificar: Usa kb_update para cambiar la categoría de id=3 a "Documentos"
eliminar:  Usa kb_delete para eliminar id=3
```

## ⚙️ Configuración

```yaml
# En cordis.patch.yml del perfil o al instalar el bundle
# Sin categorías predefinidas; las entradas sin categoría van a "Sin clasificar".
- id: knowledge-base
  name: 'dsh-knowledge-base'
  config:
    categories:            # configura según necesidad, p. ej.:
      - Documentos
      - Manuales
```

## 🗂 API web (para la interfaz e integraciones de terceros)

| Método | Ruta | Propósito |
|---|---|---|
| POST | `/api/kb/import` | Subir un archivo (JSON base64) → analizar, fragmentar, almacenar |
| GET | `/api/kb/list` | Listar entradas y categorías |
| GET | `/api/kb/search?q=` | Búsqueda de texto completo (FTS5 + BM25) |
| POST | `/api/kb/update` | Actualizar categoría/etiquetas de una entrada |
| POST | `/api/kb/rename-category` | Renombrar una categoría |
| POST | `/api/kb/create-category` | Crear una carpeta (persistente) |
| POST | `/api/kb/delete-category` | Eliminar una carpeta vacía |
| POST | `/api/kb/move-file` | Mover un archivo (cambiar categoría) |
| POST | `/api/kb/rename-file` | Renombrar un archivo |
| POST | `/api/kb/delete-file` | Eliminar un archivo completo |
| POST | `/api/kb/delete-entry` | Eliminar una entrada individual |

## 🏗 Arquitectura

```
dsh-knowledge-base (un paquete npm, tres filas de plugin)
├── dsh-knowledge-base          herramientas host: kb_query / kb_import / kb_list / kb_update / kb_delete
├── dsh-knowledge-base/web      endpoints web: /api/kb/* (solo composición web)
└── (mitad cliente)             pestaña "Base de conocimiento" + navegador de carpetas
```

Almacenamiento (por defecto):
```
$DSH_HOME/knowledge-base/kb.sqlite    # entradas + índice FTS5 + meta (categorías dinámicas)
$DSH_HOME/knowledge-base/inbox/       # directorio temporal de subida (se limpia tras importar)
```

Tablas: `kb(id, category, name, summary, payload, tags, source, updated_at)` + `kb_fts` (tabla externa FTS5) + `meta` (categorías dinámicas).

## 🔧 Desarrollo

```sh
npm run build                     # type-check de tsc + bundle tsdown (mitad host + bundle cliente)

# Verificación local (usa un home de prueba local, nunca toques ~/.dsh)
DSH_HOME=$PWD/.dsh-home DSH_TELEMETRY_DISABLED=1 \
  dsh --profile headless --patch dev-headless.cordis.yml \
  "Usa kb_import para importar /tmp/test.md, luego kb_query para buscar 'palabra'"
```

> El repositorio incluye `dev.cordis.yml` / `dev-headless.cordis.yml` para verificación local.
> Durante el desarrollo, las dependencias `@deepseek-ai/*` se enlazan desde un checkout oficial mediante
> `scripts/link-official-deps.mjs` — ver [AGENTS.md](AGENTS.md) → "Dependencies".

## 🗺 Hoja de ruta

- [x] Importación de archivos (md/txt/json/yml/docx/pdf)
- [x] Gestión de carpetas (crear/renombrar/eliminar/mover)
- [x] Búsqueda FTS5 (BM25 + trigram chino)
- [x] Interfaz web de gestión
- [ ] Clasificación automática con IA (`ctx.llm` directo en la importación)
- [ ] Vista/edición de detalle de entradas
- [ ] OCR (PDF escaneados)
- [ ] Mejor tokenización china (tokenizer personalizado en lugar de trigram)

## 🤝 Contribuciones

¡PRs bienvenidas! Lee primero [AGENTS.md](AGENTS.md). Antes de enviar:
1. `npm run build` pasa
2. La cadena de herramientas headless se autoprueba
3. No se commitean datos locales (`.dsh-home/`, `.test-workspace/`, etc. — ver [.gitignore](.gitignore))

## 📄 Licencia

[MIT](LICENSE) © dsh-knowledge-base contributors

## 🔗 Relacionados

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — Everything is a Plugin
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — lista comunitaria de plugins
- [pdfjs-dist](https://github.com/mozilla/pdf.js) — motor de análisis de PDF
