import { clientBundle } from '/Users/qinpu/Projects/deepseek-harness/packages/client/tsdown.client.ts'

// lib 半部入口：先 tsc 编译到 lib/types，tsdown 再打包。
// index.ts（工具插件）+ web.ts（端点插件行）都产出构建产物——npm 发布版入口必须是 JS，
// 因为安装方（全局 dsh）没有 tsx，无法加载 node_modules 里的 .ts。
export default clientBundle('dsh-knowledge-base', ['lib/types/index.js', 'lib/types/web.js'])
