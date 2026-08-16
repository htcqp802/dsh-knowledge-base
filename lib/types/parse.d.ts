/**
 * dsh-knowledge-base — 文件解析与切块（通用）。
 *
 * 支持的格式与解析方式（按可用性降级）：
 *   md / txt / json / yml   直读文本（零依赖）
 *   docx                    优先 macOS `textutil -convert txt`；其次 pandoc
 *   pdf                     优先 `pdftotext`（poppler）；缺失时用内置 pdfjs-dist 提取文本（跨平台，零系统依赖）
 *
 * 大文档按标题/段落切块，每块一条知识条目，检索更精准。
 */
export interface Chunk {
    name: string;
    summary: string;
    payload: string;
}
export interface ParsedDocument {
    source: string;
    chunks: Chunk[];
}
/** 读取文件文本。不支持的格式抛出带指引的错误。 */
export declare function readTextFile(filePath: string): Promise<string>;
/** 按标题/段落切块。块上限约 2000 字符，超限硬切。 */
export declare function chunkText(text: string, sourceName: string): Chunk[];
/** 解析并切块一个文件。 */
export declare function parseDocument(filePath: string): Promise<ParsedDocument>;
/**
 * 启发式建议分类：把文件名与首段文本与类别名/类别关键词做匹配，
 * 命中第一个即返回；未命中返回空（由用户/AI 决定）。
 */
export declare function suggestCategory(filePath: string, text: string, categories: readonly string[]): string | undefined;
//# sourceMappingURL=parse.d.ts.map