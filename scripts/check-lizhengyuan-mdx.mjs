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
  if (/^\*\*(?:答案|解析)[：:]\*\*[ \t]*$/gmu.test(content)) {
    throw new Error(`${filePath}: 答案或解析标签仍单独占行`);
  }

  const details = countMatches(content, /^\s*<details>\s*$/gmu);
  const closingDetails = countMatches(content, /^\s*<\/details>\s*$/gmu);
  const summaries = countMatches(
    content,
    /^\s*<summary>查看答案与解析<\/summary>\s*$/gmu,
  );
  const labelRows = countMatches(
    content,
    /^\s*<div className="exercise-label-row">\s*$/gmu,
  );
  const labelBodies = countMatches(
    content,
    /^\s*<div className="exercise-label-body">\s*$/gmu,
  );
  const blockAnswers = countMatches(
    content,
    /^\s*<strong>答案：<\/strong>\s*$/gmu,
  );
  const blockAnalyses = countMatches(
    content,
    /^\s*<strong>解析：<\/strong>\s*$/gmu,
  );
  const inlineAnswers = countMatches(
    content,
    /^\*\*答案[：:]\*\*[ \t]+\S/gmu,
  );
  const inlineAnalyses = countMatches(
    content,
    /^\*\*解析[：:]\*\*[ \t]+\S/gmu,
  );
  if (
    closingDetails !== details ||
    summaries !== details
  ) {
    throw new Error(
      `${filePath}: 答案折叠区标签不平衡（details ${details}/${closingDetails}，summary ${summaries}）`,
    );
  }
  if (
    labelRows !== labelBodies ||
    labelRows !== blockAnswers + blockAnalyses
  ) {
    throw new Error(
      `${filePath}: 块级答案标签结构不平衡（row ${labelRows}，body ${labelBodies}，标签 ${blockAnswers + blockAnalyses}）`,
    );
  }
  if (
    inlineAnswers + blockAnswers !== details ||
    inlineAnalyses + blockAnalyses !== details
  ) {
    throw new Error(
      `${filePath}: 每道题应各有一个答案和解析（details ${details}，答案 ${inlineAnswers + blockAnswers}，解析 ${inlineAnalyses + blockAnalyses}）`,
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
