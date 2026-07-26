import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '@mdx-js/mdx';
import remarkMath from 'remark-math';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(projectRoot, 'docs', '408模拟选择题');
const expectedFiles = 4;
const expectedQuestions = 600;
const expectedMissingImages = 26;
const residualMarkerPattern =
  /^\s*[-*+]\s+(?:答案|解析|解答)\s*[：:]/mu;

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function stripFrontMatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n/u, '');
}

const entries = await fs.readdir(docsRoot, {withFileTypes: true});
const files = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith('.mdx'))
  .map((entry) => path.join(docsRoot, entry.name))
  .sort();

if (files.length !== expectedFiles) {
  throw new Error(`应有 ${expectedFiles} 个科目文件，实际为 ${files.length} 个`);
}

let totalQuestions = 0;
let totalMissingImages = 0;
for (const filePath of files) {
  const content = await fs.readFile(filePath, 'utf8');
  if (/<\/?Question(?:\s|>|[A-Z])/u.test(content)) {
    throw new Error(`${filePath}: 不应包含 Question 题目组件`);
  }
  if (/<br\s*\/?>/iu.test(content)) {
    throw new Error(`${filePath}: 不应包含 br 标签`);
  }
  if (residualMarkerPattern.test(content)) {
    throw new Error(`${filePath}: 仍有未转换的答案或解析标记`);
  }
  if (/\]\(images\//u.test(content)) {
    throw new Error(`${filePath}: 仍有缺失的本地图片引用`);
  }

  const details = countMatches(content, /^<details>\s*$/gmu);
  const closingDetails = countMatches(content, /^<\/details>\s*$/gmu);
  const summaries = countMatches(
    content,
    /^<summary>查看答案与解析<\/summary>\s*$/gmu,
  );
  if (
    details !== closingDetails ||
    details !== summaries
  ) {
    throw new Error(
      `${filePath}: details 标签不平衡（${details}/${closingDetails}/${summaries}）`,
    );
  }

  try {
    await compile(stripFrontMatter(content), {
      remarkPlugins: [remarkMath],
    });
  } catch (error) {
    error.message = `${path.relative(projectRoot, filePath)}: ${error.message}`;
    throw error;
  }
  totalQuestions += details;
  totalMissingImages += countMatches(content, /^> \*\*题图缺失：\*\*/gmu);
}

if (totalQuestions !== expectedQuestions) {
  throw new Error(
    `应有 ${expectedQuestions} 个答案折叠区，实际为 ${totalQuestions} 个`,
  );
}
if (totalMissingImages !== expectedMissingImages) {
  throw new Error(
    `应保留 ${expectedMissingImages} 个缺图提示，实际为 ${totalMissingImages} 个`,
  );
}

console.log(
  `408模拟选择题校验通过：${files.length} 个科目文件，${totalQuestions} 个原生答案折叠区`,
);
