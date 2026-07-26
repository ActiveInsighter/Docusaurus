import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '@mdx-js/mdx';
import remarkMath from 'remark-math';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(projectRoot, 'docs', '李正元练习题');
const expectedFiles = 24;
const expectedQuestions = 655;
const residualMarkerPattern =
  /^\s*(?:[-*+]\s+)?(?:\*\*)?(?:答案|参考答案|解析|解答)\s*[：:]/mu;
const questionComponentPattern = /<\/?Question(?:\s|>|[A-Z])/u;

async function findMdxFiles(directory) {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return findMdxFiles(target);
      return entry.isFile() && entry.name.endsWith('.mdx') ? [target] : [];
    }),
  );
  return nested.flat().sort();
}

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function stripFrontMatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n/u, '');
}

function stripAnswerDetails(content) {
  return content.replace(/<details>[\s\S]*?<\/details>/gu, '');
}

async function validateFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  if (residualMarkerPattern.test(stripAnswerDetails(content))) {
    throw new Error(`${filePath}: 仍有未转换的答案或解析标记`);
  }

  if (questionComponentPattern.test(content)) {
    throw new Error(`${filePath}: 不应包含 Question 题目组件`);
  }
  if (/^\*\*(?:答案|解析)\*\*\s*$/gmu.test(content)) {
    throw new Error(`${filePath}: 答案或解析标签仍单独占行`);
  }

  const details = countMatches(content, /^\s*<details>\s*$/gmu);
  const closingDetails = countMatches(content, /^\s*<\/details>\s*$/gmu);
  const summaries = countMatches(
    content,
    /^\s*<summary>查看答案与解析<\/summary>\s*$/gmu,
  );
  if (
    closingDetails !== details ||
    summaries !== details
  ) {
    throw new Error(
      `${filePath}: 答案折叠区标签不平衡（details ${details}/${closingDetails}，summary ${summaries}）`,
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

  return details;
}

const files = await findMdxFiles(docsRoot);
if (files.length !== expectedFiles) {
  throw new Error(`应有 ${expectedFiles} 个章节文件，实际为 ${files.length} 个`);
}

const counts = await Promise.all(files.map(validateFile));
const questionCount = counts.reduce((sum, count) => sum + count, 0);
if (questionCount !== expectedQuestions) {
  throw new Error(
    `应有 ${expectedQuestions} 个题目组件，实际为 ${questionCount} 个`,
  );
}

console.log(
  `李正元练习题校验通过：${files.length} 个 MDX 文件，${questionCount} 个原生答案折叠区`,
);
