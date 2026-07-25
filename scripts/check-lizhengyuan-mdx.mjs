import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '@mdx-js/mdx';
import remarkMath from 'remark-math';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(projectRoot, 'docs', '李正元练习题');
const expectedFiles = 18;
const expectedQuestions = 527;
const componentNames = [
  'Question',
  'QuestionStem',
  'QuestionOptions',
  'QuestionOption',
  'QuestionAnswer',
  'QuestionAnalysis',
];
const residualMarkerPattern =
  /^\s*(?:[-*+]\s+)?(?:\*\*)?(?:答案|参考答案|解析|解答)\s*[：:]/mu;

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

async function validateFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  if (residualMarkerPattern.test(content)) {
    throw new Error(`${filePath}: 仍有未转换的答案或解析标记`);
  }

  for (const component of componentNames) {
    const opens = countMatches(
      content,
      new RegExp(`<${component}(?:\\s|>)`, 'gu'),
    );
    const closes = countMatches(
      content,
      new RegExp(`</${component}>`, 'gu'),
    );
    if (opens !== closes) {
      throw new Error(
        `${filePath}: ${component} 标签不平衡（${opens} / ${closes}）`,
      );
    }
  }

  try {
    await compile(stripFrontMatter(content), {
      remarkPlugins: [remarkMath],
    });
  } catch (error) {
    error.message = `${path.relative(projectRoot, filePath)}: ${error.message}`;
    throw error;
  }

  return countMatches(content, /^<Question\s/gmu);
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
  `李正元练习题校验通过：${files.length} 个 MDX 文件，${questionCount} 个题目组件`,
);
