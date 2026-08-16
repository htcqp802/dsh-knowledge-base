import { clientBundle } from '/Users/qinpu/Projects/deepseek-harness/packages/client/tsdown.client.ts'

// lib 半部入口：先 tsc 编译到 lib/types，tsdown 再打包。
export default clientBundle('dsh-knowledge-base', ['lib/types/index.js'])
