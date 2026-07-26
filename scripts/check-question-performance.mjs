import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8');
const [component, styles, globalStyles] = await Promise.all([
  read('src/components/Question/index.tsx'),
  read('src/components/Question/styles.module.css'),
  read('src/css/custom.css'),
]);

for (const [label, pattern] of [
  ['DOM cloning', 'cloneNode('],
  ['per-question ResizeObserver', 'new ResizeObserver'],
  ['synchronous layout effect', 'useLayoutEffect'],
  ['forced option geometry measurement', 'getBoundingClientRect().width'],
]) {
  if (component.includes(pattern)) {
    throw new Error(`Question component still uses ${label}: ${pattern}`);
  }
}

for (const required of [
  'hasRenderedAnalysis',
  'shouldRenderAnalysis',
  'data-question-options-columns={maximumColumns}',
]) {
  if (!component.includes(required)) {
    throw new Error(`Question component performance guard missing: ${required}`);
  }
}

if (!styles.includes('content-visibility: auto')) {
  throw new Error('Question cards do not use content-visibility');
}
if (!styles.includes('@container question-body (min-width: 48rem)')) {
  throw new Error('Question options are not driven by container queries');
}
if (styles.includes('grid-template-rows')) {
  throw new Error('Analysis still animates layout through grid-template-rows');
}
if (!globalStyles.includes('Keep the desktop docs sidebar independent')) {
  throw new Error('Stable desktop sidebar override is missing');
}

console.log('题目组件性能守卫通过：解析延迟挂载、CSS 分栏、无同步 DOM 测量、侧栏固定视口');
