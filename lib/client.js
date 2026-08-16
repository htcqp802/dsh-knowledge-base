window.__ModuleLoader__.load({
	id: "dsh-knowledge-base",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/KnowledgePanel.tsx
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
		const card = {
			border: "1px solid #e5e7eb",
			borderRadius: 10,
			padding: "14px 16px",
			background: "#fff",
			boxShadow: "0 1px 3px rgba(16,24,40,.06)"
		};
		const heading = {
			margin: "0 0 4px",
			fontSize: 16,
			fontWeight: 600
		};
		const sub = {
			margin: "0 0 12px",
			fontSize: 12.5,
			color: "#6b7280"
		};
		const dropZone = {
			border: "2px dashed #cbd5e1",
			borderRadius: 8,
			padding: "18px",
			textAlign: "center",
			fontSize: 13,
			color: "#6b7280",
			cursor: "pointer",
			background: "#f9fafb",
			transition: "border-color .15s"
		};
		const breadcrumb = {
			display: "flex",
			alignItems: "center",
			gap: 6,
			fontSize: 13.5,
			padding: "2px 0 10px",
			color: "#6b7280",
			flexWrap: "wrap"
		};
		const crumb = {
			cursor: "pointer",
			color: "#2563eb",
			fontWeight: 500
		};
		const crumbCurrent = {
			color: "#1f2937",
			fontWeight: 600
		};
		const backBtn = {
			border: "1px solid #d1d5db",
			background: "#fff",
			borderRadius: 6,
			padding: "2px 10px",
			fontSize: 12,
			cursor: "pointer",
			color: "#374151"
		};
		const row = {
			display: "flex",
			alignItems: "center",
			gap: 10,
			padding: "9px 10px",
			borderRadius: 6,
			fontSize: 13,
			cursor: "pointer"
		};
		const rowActions = {
			display: "flex",
			alignItems: "center",
			gap: 6,
			flexShrink: 0
		};
		const smallBtn = {
			border: "1px solid #d1d5db",
			background: "#fff",
			borderRadius: 6,
			padding: "2px 8px",
			fontSize: 11.5,
			cursor: "pointer",
			color: "#374151"
		};
		const primaryBtn = {
			border: "1px solid #2563eb",
			background: "#2563eb",
			color: "#fff",
			borderRadius: 6,
			padding: "2px 8px",
			fontSize: 11.5,
			cursor: "pointer"
		};
		const renameInput = {
			border: "1px solid #2563eb",
			borderRadius: 6,
			padding: "3px 8px",
			fontSize: 13,
			outline: "none",
			width: 260
		};
		const iconSize = {
			fontSize: 18,
			flexShrink: 0
		};
		const meta = {
			fontSize: 11.5,
			color: "#9ca3af",
			flex: 1,
			overflow: "hidden",
			textOverflow: "ellipsis",
			whiteSpace: "nowrap"
		};
		const inputStyle = {
			border: "1px solid #d1d5db",
			borderRadius: 8,
			padding: "8px 12px",
			fontSize: 13,
			outline: "none",
			flex: 1
		};
		const button = {
			border: "1px solid #d1d5db",
			background: "#fff",
			borderRadius: 8,
			padding: "8px 14px",
			fontSize: 13,
			cursor: "pointer",
			color: "#2563eb"
		};
		const primaryButton = {
			...button,
			background: "#2563eb",
			color: "#fff",
			borderColor: "#2563eb"
		};
		async function postJson(url, body) {
			const res = await fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
			return await res.json();
		}
		async function getJson(url) {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			return await res.json();
		}
		function fileToBase64(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => {
					const raw = String(reader.result ?? "");
					const idx = raw.indexOf(",");
					resolve(idx === -1 ? raw : raw.slice(idx + 1));
				};
				reader.onerror = () => reject(reader.error);
				reader.readAsDataURL(file);
			});
		}
		/** 从扁平条目派生"分类 → 文件"结构。 */
		function buildFolders(entries) {
			const byCategory = /* @__PURE__ */ new Map();
			const metaOf = /* @__PURE__ */ new Map();
			for (const entry of entries) {
				const source = entry.source ?? "(无来源)";
				let files = byCategory.get(entry.category);
				if (files === void 0) {
					files = /* @__PURE__ */ new Map();
					byCategory.set(entry.category, files);
				}
				files.set(source, (files.get(source) ?? 0) + 1);
				const prev = metaOf.get(`${entry.category}\u0000${source}`);
				if (prev === void 0 || entry.updatedAt > prev.updatedAt) metaOf.set(`${entry.category}\u0000${source}`, { updatedAt: entry.updatedAt });
			}
			const folders = [];
			for (const [category, files] of byCategory) {
				const fileInfos = [];
				for (const [source, chunks] of files) fileInfos.push({
					source,
					chunks,
					updatedAt: metaOf.get(`${category}\u0000${source}`)?.updatedAt ?? ""
				});
				fileInfos.sort((a, b) => a.updatedAt < b.updatedAt ? 1 : -1);
				folders.push({
					category,
					files: fileInfos,
					count: fileInfos.reduce((n, f) => n + f.chunks, 0)
				});
			}
			folders.sort((a, b) => a.category < b.category ? -1 : 1);
			return folders;
		}
		function KnowledgePanel(_props) {
			const [entries, setEntries] = (0, react.useState)([]);
			const [categories, setCategories] = (0, react.useState)([]);
			const [importing, setImporting] = (0, react.useState)(false);
			const [lastImport, setLastImport] = (0, react.useState)(null);
			const [dragOver, setDragOver] = (0, react.useState)(false);
			const [view, setView] = (0, react.useState)({ kind: "root" });
			const [editing, setEditing] = (0, react.useState)(null);
			const [moving, setMoving] = (0, react.useState)(null);
			const [hoveredFolder, setHoveredFolder] = (0, react.useState)(null);
			const [collapsedFiles, setCollapsedFiles] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [creatingCategory, setCreatingCategory] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)("");
			const [searchResults, setSearchResults] = (0, react.useState)(null);
			const fileInput = (0, react.useRef)(null);
			const editInput = (0, react.useRef)(null);
			const createInput = (0, react.useRef)(null);
			const refresh = (0, react.useCallback)(async () => {
				try {
					const data = await getJson("/api/kb/list");
					setEntries(data.rows);
					setCategories(data.categories);
				} catch (error) {
					console.error("knowledge-base: list failed", error);
				}
			}, []);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			(0, react.useEffect)(() => {
				if (editing !== null) editInput.current?.focus();
			}, [editing]);
			(0, react.useEffect)(() => {
				if (creatingCategory) createInput.current?.focus();
			}, [creatingCategory]);
			/** 新建目录。 */
			const createCategory = (0, react.useCallback)(async (name) => {
				setCreatingCategory(false);
				const trimmed = name.trim();
				if (trimmed === "") return;
				try {
					await postJson("/api/kb/create-category", { name: trimmed });
					await refresh();
				} catch (error) {
					window.alert(`新建目录失败：${error instanceof Error ? error.message : String(error)}`);
				}
			}, [refresh]);
			/** 删除空目录。 */
			const deleteCategory = (0, react.useCallback)(async (name) => {
				if (!window.confirm(`删除目录「${name}」？仅空目录可删除。`)) return;
				try {
					await postJson("/api/kb/delete-category", { name });
					await refresh();
				} catch (error) {
					window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`);
				}
			}, [refresh]);
			const importFile = (0, react.useCallback)(async (file) => {
				setImporting(true);
				try {
					const contentBase64 = await fileToBase64(file);
					setLastImport(await postJson("/api/kb/import", {
						name: file.name,
						contentBase64
					}));
					setView({ kind: "root" });
					await refresh();
				} catch (error) {
					console.error("knowledge-base: import failed", error);
					window.alert(`导入失败：${error instanceof Error ? error.message : String(error)}`);
				} finally {
					setImporting(false);
				}
			}, [refresh]);
			/** 提交重命名（分类或文件）。分类改名后回根视图；文件改名留在当前分类视图。 */
			const submitRename = (0, react.useCallback)(async (value) => {
				const target = editing;
				setEditing(null);
				if (target === null) return;
				const name = value.trim();
				if (name === "" || name === target.value) return;
				try {
					if (target.kind === "category") {
						await postJson("/api/kb/rename-category", {
							oldCategory: target.value,
							newCategory: name
						});
						setView({ kind: "root" });
					} else await postJson("/api/kb/rename-file", {
						source: target.value,
						newSource: name
					});
					await refresh();
				} catch (error) {
					window.alert(`重命名失败：${error instanceof Error ? error.message : String(error)}`);
				}
			}, [editing, refresh]);
			/** 移动文件到目标分类；留在当前分类视图（文件从列表消失）。 */
			const moveTo = (0, react.useCallback)(async (source, category) => {
				setMoving(null);
				try {
					await postJson("/api/kb/move-file", {
						source,
						category
					});
					await refresh();
				} catch (error) {
					window.alert(`移动失败：${error instanceof Error ? error.message : String(error)}`);
				}
			}, [refresh]);
			/** 折叠/展开文件分组。 */
			const toggleFile = (0, react.useCallback)((source) => {
				setCollapsedFiles((prev) => {
					const next = new Set(prev ?? []);
					if (next.has(source)) next.delete(source);
					else next.add(source);
					return next;
				});
			}, []);
			/** 删除整个文件（该文件所有条目）。 */
			const deleteFile = (0, react.useCallback)(async (source) => {
				if (!window.confirm(`删除文件「${source}」？其所有条目将一并删除。`)) return;
				try {
					await postJson("/api/kb/delete-file", { source });
					await refresh();
				} catch (error) {
					window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`);
				}
			}, [refresh]);
			/** 删除单个条目。 */
			const deleteEntry = (0, react.useCallback)(async (id) => {
				if (!window.confirm("删除这条内容？")) return;
				try {
					await postJson("/api/kb/delete-entry", { id });
					await refresh();
				} catch (error) {
					window.alert(`删除失败：${error instanceof Error ? error.message : String(error)}`);
				}
			}, [refresh]);
			const runSearch = (0, react.useCallback)(async () => {
				if (query.trim() === "") {
					setSearchResults(null);
					return;
				}
				try {
					setSearchResults((await getJson(`/api/kb/search?q=${encodeURIComponent(query.trim())}`)).rows);
				} catch (error) {
					console.error("knowledge-base: search failed", error);
				}
			}, [query]);
			const folders = buildFolders(entries);
			const fullFolders = [];
			for (const category of categories) {
				const existing = folders.find((f) => f.category === category);
				fullFolders.push(existing ?? {
					category,
					files: [],
					count: 0
				});
			}
			for (const f of folders) if (!categories.includes(f.category)) fullFolders.push(f);
			const breadcrumbs = [];
			if (view.kind === "category") breadcrumbs.push({
				label: view.category,
				onClick: () => setView({
					kind: "category",
					category: view.category
				}),
				current: true
			});
			const currentFiles = view.kind === "category" ? fullFolders.find((f) => f.category === view.category)?.files ?? [] : [];
			const categoryEntries = view.kind === "category" ? entries.filter((e) => e.category === view.category) : [];
			const isRoot = view.kind === "root";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					maxWidth: "var(--dsh-chat-content-width)",
					width: "100%",
					margin: "0 auto",
					padding: "20px 24px"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...card,
							marginBottom: 14
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								style: heading,
								children: "知识库"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: sub,
								children: "支持 md / txt / json / yml / docx / pdf，无大小限制；文件按章节切块，同名重导 = 覆盖更新。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									...dropZone,
									borderColor: dragOver ? "#2563eb" : "#cbd5e1",
									background: dragOver ? "#eff4ff" : "#f9fafb"
								},
								onClick: () => fileInput.current?.click(),
								onDragOver: (e) => {
									e.preventDefault();
									setDragOver(true);
								},
								onDragLeave: () => setDragOver(false),
								onDrop: (e) => {
									e.preventDefault();
									setDragOver(false);
									const file = e.dataTransfer.files[0];
									if (file !== void 0) importFile(file);
								},
								children: importing ? "导入中…" : "拖拽文件到这里，或点击选择文件"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: fileInput,
								type: "file",
								style: { display: "none" },
								onChange: (e) => {
									const file = e.target.files?.[0];
									if (file !== void 0) importFile(file);
									e.target.value = "";
								}
							}),
							lastImport !== null && lastImport.imported > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									marginTop: 10,
									fontSize: 12.5,
									color: "#16a34a",
									background: "#ecfdf3",
									borderRadius: 8,
									padding: "8px 12px"
								},
								children: [
									"✓ 已导入《",
									lastImport.source,
									"》：",
									lastImport.imported,
									" 个条目，分类「",
									lastImport.category,
									"」（可在目录中重命名 / 移动）"
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...card,
							marginBottom: 14
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									style: inputStyle,
									placeholder: "检索知识库…（如：ISO9001、参数、安装）",
									value: query,
									onChange: (e) => {
										setQuery(e.target.value);
										setSearchResults(null);
									},
									onKeyDown: (e) => {
										if (e.key === "Enter") runSearch();
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									style: primaryButton,
									onClick: () => void runSearch(),
									children: "检索"
								}),
								searchResults !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									style: button,
									onClick: () => {
										setQuery("");
										setSearchResults(null);
									},
									children: "返回目录"
								})
							]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: card,
						children: searchResults === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: breadcrumb,
								children: [
									!isRoot && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										style: backBtn,
										onClick: () => setView({ kind: "root" }),
										children: "← 上一级"
									}),
									breadcrumbs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: "#9ca3af" },
										children: "/"
									}),
									breadcrumbs.map((c, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: c.current ? crumbCurrent : crumb,
										onClick: c.onClick,
										children: c.label
									}, i)),
									view.kind === "category" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										style: {
											...smallBtn,
											marginLeft: "auto"
										},
										onClick: () => setEditing({
											kind: "category",
											value: view.category
										}),
										children: "重命名分类"
									})
								]
							}),
							editing !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									gap: 8,
									alignItems: "center",
									padding: "0 0 10px"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										ref: editInput,
										style: renameInput,
										defaultValue: editing.value,
										onKeyDown: (e) => {
											if (e.key === "Enter") submitRename(e.target.value);
											if (e.key === "Escape") setEditing(null);
										},
										onBlur: (e) => void submitRename(e.target.value)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										style: primaryBtn,
										onClick: (e) => void submitRename(e.target.previousElementSibling ? e.target.previousElementSibling.value : ""),
										children: "确定"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										style: smallBtn,
										onClick: () => setEditing(null),
										children: "取消"
									})
								]
							}),
							isRoot && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									gap: 8,
									alignItems: "center",
									padding: "0 0 10px"
								},
								children: creatingCategory ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										ref: createInput,
										style: renameInput,
										placeholder: "输入新目录名称，回车创建",
										onKeyDown: (e) => {
											if (e.key === "Enter") createCategory(e.target.value);
											if (e.key === "Escape") setCreatingCategory(false);
										},
										onBlur: (e) => void createCategory(e.target.value)
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										style: primaryBtn,
										onClick: (e) => void createCategory(e.target.previousElementSibling ? e.target.previousElementSibling.value : ""),
										children: "创建"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										style: smallBtn,
										onClick: () => setCreatingCategory(false),
										children: "取消"
									})
								] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									style: smallBtn,
									onClick: () => setCreatingCategory(true),
									children: "＋ 新建目录"
								})
							}), fullFolders.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...sub,
									padding: "8px 0"
								},
								children: "知识库为空，先导入一个文件，或新建一个目录。"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 4
								},
								children: fullFolders.map((folder) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 12,
										padding: "11px 12px",
										borderRadius: 8,
										border: editing !== null && editing.kind === "category" && editing.value === folder.category ? "2px solid #2563eb" : hoveredFolder === folder.category ? "1px solid #2563eb" : "1px solid transparent",
										cursor: "pointer",
										background: hoveredFolder === folder.category ? "#f9fafb" : "transparent",
										transition: "border-color .15s, background .15s",
										position: "relative"
									},
									onClick: () => setView({
										kind: "category",
										category: folder.category
									}),
									onMouseEnter: () => setHoveredFolder(folder.category),
									onMouseLeave: () => setHoveredFolder(null),
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												fontSize: 18,
												flexShrink: 0
											},
											children: "📁"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												fontWeight: 600,
												fontSize: 14,
												color: "#1f2937",
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis"
											},
											children: folder.category
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: {
												fontSize: 11.5,
												color: "#9ca3af",
												marginLeft: 4,
												flexShrink: 0
											},
											children: folder.files.length > 0 ? `${folder.files.length} 个文件 · ${folder.count} 个条目` : "空目录"
										}),
										hoveredFolder === folder.category && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												marginLeft: "auto",
												display: "flex",
												gap: 6,
												flexShrink: 0
											},
											onClick: (e) => e.stopPropagation(),
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												style: {
													...smallBtn,
													border: "1px solid #d1d5db",
													background: "#fff",
													borderRadius: 6,
													padding: "1px 8px",
													fontSize: 12,
													cursor: "pointer",
													color: "#374151"
												},
												onClick: () => setEditing({
													kind: "category",
													value: folder.category
												}),
												title: "重命名目录",
												children: "✏️ 重命名"
											}), folder.files.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												style: {
													...smallBtn,
													border: "1px solid #fecaca",
													background: "#fff",
													borderRadius: 6,
													padding: "1px 8px",
													fontSize: 12,
													cursor: "pointer",
													color: "#dc2626"
												},
												onClick: () => void deleteCategory(folder.category),
												title: "删除空目录",
												children: "🗑 删除"
											})]
										})
									]
								}, folder.category))
							})] }),
							view.kind === "category" && (currentFiles.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...sub,
									padding: "8px 0"
								},
								children: "该分类为空。"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 6,
									paddingTop: 4
								},
								children: currentFiles.map((file) => {
									const fileChunks = categoryEntries.filter((e) => (e.source ?? "(无来源)") === file.source);
									const collapsed = collapsedFiles?.has(file.source) ?? false;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											border: "1px solid #f0f1f4",
											borderRadius: 10
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												alignItems: "center",
												gap: 10,
												padding: "10px 12px",
												cursor: "pointer",
												borderRadius: 10
											},
											onClick: () => toggleFile(file.source),
											onMouseEnter: (e) => {
												e.currentTarget.style.background = "#f9fafb";
											},
											onMouseLeave: (e) => {
												e.currentTarget.style.background = "transparent";
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: {
														fontSize: 11,
														color: "#9ca3af",
														width: 12,
														flexShrink: 0
													},
													children: collapsed ? "▸" : "▾"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: iconSize,
													children: "📄"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: {
														fontWeight: 600,
														fontSize: 13.5,
														color: "#1f2937"
													},
													children: file.source
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													style: meta,
													children: [
														fileChunks.length,
														" 块 · ",
														file.updatedAt
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: rowActions,
													onClick: (e) => e.stopPropagation(),
													children: [
														moving?.source === file.source && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
															autoFocus: true,
															style: {
																border: "1px solid #2563eb",
																borderRadius: 6,
																padding: "2px 6px",
																fontSize: 11.5
															},
															value: "",
															onChange: (e) => {
																if (e.target.value !== "") moveTo(file.source, e.target.value);
															},
															onBlur: () => setMoving(null),
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "",
																disabled: true,
																children: "移动到…"
															}), categories.filter((c) => c !== view.category).map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: c,
																children: c
															}, c))]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															style: smallBtn,
															onClick: () => setMoving({ source: file.source }),
															children: "移动到…"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															style: smallBtn,
															onClick: () => setEditing({
																kind: "file",
																value: file.source
															}),
															children: "✏️ 重命名"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															style: {
																...smallBtn,
																color: "#dc2626",
																borderColor: "#fecaca"
															},
															onClick: () => void deleteFile(file.source),
															children: "🗑 删除"
														})
													]
												})
											]
										}), !collapsed && fileChunks.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												...row,
												cursor: "default",
												paddingLeft: 34,
												borderTop: "1px solid #f5f6f8",
												borderRadius: 0
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: {
														fontSize: 12,
														color: "#cbd5e1"
													},
													children: "·"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														flex: 1,
														minWidth: 0,
														display: "flex",
														alignItems: "baseline",
														gap: 8
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: {
																fontWeight: 500,
																color: "#374151",
																flex: "0 1 auto",
																whiteSpace: "nowrap",
																overflow: "hidden",
																textOverflow: "ellipsis"
															},
															children: entry.name
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: {
																fontSize: 11.5,
																color: "#9ca3af",
																flex: "1 1 auto",
																whiteSpace: "nowrap",
																overflow: "hidden",
																textOverflow: "ellipsis"
															},
															children: entry.summary
														}),
														entry.tags.map((tag) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: {
																display: "inline-block",
																fontSize: 11,
																color: "#374151",
																background: "#f3f4f6",
																borderRadius: 999,
																padding: "1px 8px",
																flexShrink: 0
															},
															children: tag
														}, tag))
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													style: {
														...smallBtn,
														color: "#9ca3af",
														borderColor: "transparent",
														fontSize: 13,
														padding: "1px 6px",
														flexShrink: 0
													},
													title: "删除这条内容",
													onClick: (e) => {
														e.stopPropagation();
														deleteEntry(entry.id);
													},
													children: "✕"
												})
											]
										}, entry.id))]
									}, file.source);
								})
							}))
						] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								marginBottom: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
								style: {
									...heading,
									fontSize: 14
								},
								children: [
									"检索结果（",
									searchResults.length,
									"）"
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: button,
								onClick: () => {
									setQuery("");
									setSearchResults(null);
								},
								children: "返回目录"
							})]
						}), searchResults.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								...row,
								cursor: "default"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									flex: 1,
									minWidth: 0,
									display: "flex",
									alignItems: "baseline",
									gap: 8
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										color: "#374151",
										flex: "0 1 auto",
										whiteSpace: "nowrap",
										overflow: "hidden",
										textOverflow: "ellipsis"
									},
									children: entry.name
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										color: "#9ca3af",
										fontSize: 11.5,
										flexShrink: 0
									},
									children: [
										entry.category,
										" / ",
										entry.source ?? ""
									]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									color: "#6b7280",
									fontSize: 12,
									marginTop: 2,
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis"
								},
								children: entry.summary
							})]
						}, entry.id))] })
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		const NS = "knowledge.base";
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh: { "view.knowledgeBase": "知识库" },
				en: { "view.knowledgeBase": "Knowledge Base" }
			}), "dsh-knowledge-base: dictionaries");
			const t = ctx.get("locale").bind(NS);
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "knowledge-base",
				order: 30,
				locale: NS,
				label: () => t("view.knowledgeBase")
			}, KnowledgePanel));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map