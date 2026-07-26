import {promises as fs} from 'node:fs';

const path = 'scripts/apply-question-performance-optimization.mjs';
let source = await fs.readFile(path, 'utf8');

const oldBehaviorBlock = `demo = replaceOnce(
  demo,
  '为解析区设置视口相关的最大高度，仅在内容超过阈值时出现内部滚动；保留完整 DOM 内容，并让滚动区域可以通过键盘获得焦点。',
  '解析内容在第一次展开时才挂载，之后保持缓存；解析区使用视口相关的最大高度，仅在内容超过阈值时出现内部滚动，并允许键盘聚焦。',
  'update long analysis behavior documentation',
);`;
const newBehaviorBlock = `demo = demo.replaceAll(
  '为解析区设置视口相关的最大高度，仅在内容超过阈值时出现内部滚动；保留完整 DOM 内容，并让滚动区域可以通过键盘获得焦点。',
  '解析内容在第一次展开时才挂载，之后保持缓存；解析区使用视口相关的最大高度，仅在内容超过阈值时出现内部滚动，并允许键盘聚焦。',
);`;

const oldApiBlock = `demo = replaceOnce(
  demo,
  '- \`QuestionAnalysis\`：内容超过 \`min(30rem, 68vh)\` 后在解析区内部滚动；可通过 \`--question-analysis-max-height\` 覆盖阈值。',
  '- \`QuestionAnalysis\`：首次展开时才挂载解析 DOM，后续展开复用已挂载内容；内容超过 \`min(30rem, 68vh)\` 后在解析区内部滚动，可通过 \`--question-analysis-max-height\` 覆盖阈值。',
  'update QuestionAnalysis API documentation',
);`;
const newApiBlock = `demo = demo.replaceAll(
  '- \`QuestionAnalysis\`：内容超过 \`min(30rem, 68vh)\` 后在解析区内部滚动；可通过 \`--question-analysis-max-height\` 覆盖阈值。',
  '- \`QuestionAnalysis\`：首次展开时才挂载解析 DOM，后续展开复用已挂载内容；内容超过 \`min(30rem, 68vh)\` 后在解析区内部滚动，可通过 \`--question-analysis-max-height\` 覆盖阈值。',
);`;

for (const [label, oldBlock, newBlock] of [
  ['analysis behavior documentation', oldBehaviorBlock, newBehaviorBlock],
  ['QuestionAnalysis API documentation', oldApiBlock, newApiBlock],
]) {
  const count = source.split(oldBlock).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one patcher block, found ${count}`);
  }
  source = source.replace(oldBlock, newBlock);
}

await fs.writeFile(path, source, 'utf8');
console.log('Prepared concurrency-safe one-time documentation replacements.');
