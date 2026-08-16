/**
 * dsh-knowledge-base — SQLite 知识库核心（通用）。
 *
 * 数据文件：$DSH_HOME/knowledge-base/kb.sqlite（默认 ~/.dsh/knowledge-base/kb.sqlite）。
 *
 * 表结构：
 *   kb(id, category, name, summary, payload, tags, source, updated_at)
 *   - category  单值归档维度（类别由插件配置，可增删）
 *   - tags      多值细粒度标签（JSON 数组）
 *   - source    来源文件（同名重新导入 = 覆盖更新，upsert 语义）
 *   - updated_at 更新时间戳
 *
 * 本模块无任何行业绑定数据；示例/行业数据由上层导入。
 */
import { DatabaseSync } from 'node:sqlite';
export interface KbSearchArgs {
    query: string;
    category?: string;
}
export interface KbRow {
    id: number;
    category: string;
    name: string;
    summary: string;
    payload: string;
    tags: string[];
    source: string | null;
    updatedAt: string;
}
export interface KbEntryInput {
    category: string;
    name: string;
    summary: string;
    payload: string;
    tags?: string[];
    source?: string;
}
/** 知识库根目录。 */
export declare function kbRoot(): string;
/** 知识库数据文件绝对路径。 */
export declare function kbPath(): string;
/** 打开（必要时创建）知识库，并保证 FTS 索引与数据一致。 */
export declare function openKb(): DatabaseSync;
/**
 * 写入一条知识条目（同名同来源 = 覆盖更新）。
 * @returns 条目 id。
 */
export declare function upsertEntry(db: DatabaseSync, input: KbEntryInput): number;
/** 更新条目的分类与标签（同步 FTS：tags 变化）。 */
export declare function updateEntry(db: DatabaseSync, id: number, category: string, tags?: string[]): void;
/** 列出条目（可按 category 过滤，按更新时间倒序）。 */
export declare function listEntries(db: DatabaseSync, category?: string): KbRow[];
/**
 * 关键词检索：优先 FTS5（trigram，中文 3 字滑窗子串匹配 + BM25 相关度排序）；
 * 查询词不足 3 字符或 FTS 异常/无结果时回退 LIKE 子串匹配。可按 category 过滤。
 */
export declare function searchKb(db: DatabaseSync, args: KbSearchArgs): KbRow[];
/** 删除条目（同步 FTS）。 */
export declare function deleteEntry(db: DatabaseSync, id: number): void;
/**
 * 分类重命名：把该分类下所有条目的 category 字段更新为新名称。
 * @returns 受影响条目数。
 */
export declare function renameCategory(db: DatabaseSync, oldName: string, newName: string): number;
/**
 * 文件移动：把某 source 下所有条目的 category 更新为目标分类。
 * @returns 受影响条目数。
 */
export declare function moveFile(db: DatabaseSync, source: string, category: string): number;
/**
 * 文件重命名：更新某 source 下所有条目的 source 字段，
 * 并把条目名中的旧文件名前缀替换为新文件名。
 * @returns 受影响条目数。
 */
export declare function renameFile(db: DatabaseSync, source: string, newSource: string): number;
/** 读取用户手动新建的分类列表（含空目录）。 */
export declare function getCustomCategories(db: DatabaseSync): string[];
/** 新建分类（空目录）。返回是否实际新增（重名返回 false）。 */
export declare function addCategory(db: DatabaseSync, name: string): boolean;
/** 删除空目录。若目录下有条目返回 false（拒绝删除）。 */
export declare function removeCategory(db: DatabaseSync, name: string): boolean;
/** 分类重命名时，同步更新自定义分类列表中的名字。 */
export declare function renameCustomCategory(db: DatabaseSync, oldName: string, newName: string): void;
/** 删除整个文件（该 source 下所有条目）。@returns 删除条目数。 */
export declare function deleteFile(db: DatabaseSync, source: string): number;
//# sourceMappingURL=kb.d.ts.map