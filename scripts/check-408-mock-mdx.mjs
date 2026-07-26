import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compile} from '@mdx-js/mdx';
import remarkMath from 'remark-math';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(projectRoot, 'docs', '408模拟选择题');
const expectedFiles = 52;
const expectedCategoryFiles = 11;
const expectedQuestions = 600;
const expectedMissingImages = 26;
const expectedBooks = {
  '01-王道': {
    name: '王道',
    questions: 320,
    subjects: {
      '01-数据结构': {name: '数据结构', files: 8, questions: 88},
      '02-计算机组成原理': {
        name: '计算机组成原理',
        files: 7,
        questions: 88,
      },
      '03-操作系统': {name: '操作系统', files: 5, questions: 80},
      '04-计算机网络': {name: '计算机网络', files: 6, questions: 64},
    },
  },
  '02-竟成': {
    name: '竟成',
    questions: 280,
    subjects: {
      '01-数据结构': {name: '数据结构', files: 8, questions: 77},
      '02-计算机组成原理': {
        name: '计算机组成原理',
        files: 7,
        questions: 77,
      },
      '03-操作系统': {name: '操作系统', files: 5, questions: 70},
      '04-计算机网络': {name: '计算机网络', files: 6, questions: 56},
    },
  },
};
const subjectQuestionRanges = {
  数据结构: [1, 11],
  计算机组成原理: [12, 22],
  操作系统: [23, 32],
  计算机网络: [33, 40],
};
const renderedQuestionPattern =
  /^(\d+)\.\s+\*\*【([^】]+)】\*\*/gmu;
const tagPattern =
  /^(王道|竟成)·(卷[一二三四五六七八]|模拟[一二三四五六七])-(Q?)(\d{2})$/u;
const residualMarkerPattern =
  /^\s*[-*+]\s+(?:答案|解析|解答)\s*[：:]/mu;

function countMatches(content, pattern) {
  return [...content.matchAll(pattern)].length;
}

function stripFrontMatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n/u, '');
}

async function collectFiles(directory) {
  const files = [];
  const entries = await fs.readdir(directory, {withFileTypes: true});
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

function assertCompactLabels(content, filePath, detailsCount) {
  if (/^\*\*(?:答案|解析)\*\*\s*$/mu.test(content)) {
    throw new Error(`${filePath}: 仍存在旧的答案或解析独占标签`);
  }

  const answerLines = countMatches(content, /^\*\*答案：\*\*\s+\S.*$/gmu);
  if (answerLines !== detailsCount) {
    throw new Error(
      `${filePath}: 紧凑答案标签应有 ${detailsCount} 个，实际为 ${answerLines} 个`,
    );
  }

  const analysisLabels = countMatches(content, /^\*\*解析：\*\*(?:\s+.*)?$/gmu);
  if (analysisLabels !== detailsCount) {
    throw new Error(
      `${filePath}: 解析标签应有 ${detailsCount} 个，实际为 ${analysisLabels} 个`,
    );
  }

  const lines = content.split('\n');
  lines.forEach((line, index) => {
    if (line.trim() !== '**解析：**') return;
    let next = index + 1;
    while (next < lines.length && lines[next].trim() === '') next += 1;
    const nextLine = lines[next]?.trim() ?? '';
    if (nextLine !== '$$' && !nextLine.startsWith('```')) {
      throw new Error(
        `${filePath}:${index + 1}: 解析标签仅可在数学或代码块前独占一行`,
      );
    }
  });
}

const allFiles = await collectFiles(docsRoot);
const files = allFiles
  .filter((filePath) => filePath.endsWith('.mdx'))
  .sort();
const categoryFiles = allFiles.filter(
  (filePath) => path.basename(filePath) === '_category_.json',
);

if (files.length !== expectedFiles) {
  throw new Error(`应有 ${expectedFiles} 个章节文件，实际为 ${files.length} 个`);
}
if (categoryFiles.length !== expectedCategoryFiles) {
  throw new Error(
    `应有 ${expectedCategoryFiles} 个分类文件，实际为 ${categoryFiles.length} 个`,
  );
}

const actualBookDirectories = (
  await fs.readdir(docsRoot, {withFileTypes: true})
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const expectedBookDirectories = Object.keys(expectedBooks).sort();
if (
  JSON.stringify(actualBookDirectories) !==
  JSON.stringify(expectedBookDirectories)
) {
  throw new Error(
    `书目目录异常：${actualBookDirectories.join('、') || '无'}`,
  );
}

let totalQuestions = 0;
let totalMissingImages = 0;
const seenTags = new Set();
const paperQuestions = new Map();
const actualCounts = new Map();
const actualFileCounts = new Map();

for (const filePath of files) {
  const relativePath = path.relative(docsRoot, filePath);
  const pathParts = relativePath.split(path.sep);
  if (pathParts.length !== 3) {
    throw new Error(`${relativePath}: 应位于“书/科目/章节”三级路径中`);
  }

  const [bookDirectory, subjectDirectory, fileName] = pathParts;
  const bookConfig = expectedBooks[bookDirectory];
  const subjectConfig = bookConfig?.subjects[subjectDirectory];
  if (!bookConfig || !subjectConfig) {
    throw new Error(`${relativePath}: 书目或科目目录不符合预期`);
  }
  if (!/^\d{2}-第\d+章-.+\.mdx$/u.test(fileName)) {
    throw new Error(`${relativePath}: 章节文件名不符合编号命名规则`);
  }

  const groupKey = `${bookDirectory}/${subjectDirectory}`;
  actualFileCounts.set(groupKey, (actualFileCounts.get(groupKey) ?? 0) + 1);

  const content = await fs.readFile(filePath, 'utf8');
  if (/<\/?Question(?:\s|>|[A-Z])/u.test(content)) {
    throw new Error(`${relativePath}: 不应包含 Question 题目组件`);
  }
  if (/<br\s*\/?>/iu.test(content)) {
    throw new Error(`${relativePath}: 不应包含 br 标签`);
  }
  if (residualMarkerPattern.test(content)) {
    throw new Error(`${relativePath}: 仍有未转换的答案或解析标记`);
  }
  if (/\]\(images\//u.test(content)) {
    throw new Error(`${relativePath}: 仍有缺失的本地图片引用`);
  }

  const details = countMatches(content, /^<details>\s*$/gmu);
  const closingDetails = countMatches(content, /^<\/details>\s*$/gmu);
  const summaries = countMatches(
    content,
    /^<summary>查看答案与解析<\/summary>\s*$/gmu,
  );
  if (details === 0 || details !== closingDetails || details !== summaries) {
    throw new Error(
      `${relativePath}: details 标签异常（${details}/${closingDetails}/${summaries}）`,
    );
  }
  assertCompactLabels(content, relativePath, details);

  const questionMatches = [...content.matchAll(renderedQuestionPattern)];
  if (questionMatches.length !== details) {
    throw new Error(
      `${relativePath}: 题目与折叠区数量不一致（${questionMatches.length}/${details}）`,
    );
  }
  questionMatches.forEach((match, index) => {
    const displayNumber = Number(match[1]);
    if (displayNumber !== index + 1) {
      throw new Error(
        `${relativePath}: 页内题号应连续，期望 ${index + 1}，实际 ${displayNumber}`,
      );
    }

    const tag = match[2];
    const tagMatch = tag.match(tagPattern);
    if (!tagMatch) {
      throw new Error(`${relativePath}: 题目标记格式异常：${tag}`);
    }
    const [, book, paper, prefix, questionNumberText] = tagMatch;
    if (book !== bookConfig.name) {
      throw new Error(`${relativePath}: 题目标记 ${tag} 放入了错误书目`);
    }
    if (
      (book === '王道' &&
        (!paper.startsWith('卷') || prefix !== 'Q')) ||
      (book === '竟成' &&
        (!paper.startsWith('模拟') || prefix !== ''))
    ) {
      throw new Error(`${relativePath}: 题目标记 ${tag} 的书卷格式异常`);
    }
    if (seenTags.has(tag)) {
      throw new Error(`${relativePath}: 题目标记重复：${tag}`);
    }
    seenTags.add(tag);

    const questionNumber = Number(questionNumberText);
    const [minimum, maximum] = subjectQuestionRanges[subjectConfig.name];
    if (questionNumber < minimum || questionNumber > maximum) {
      throw new Error(
        `${relativePath}: 题目标记 ${tag} 不属于 ${subjectConfig.name} 题号范围`,
      );
    }

    const paperKey = `${book}·${paper}`;
    if (!paperQuestions.has(paperKey)) paperQuestions.set(paperKey, []);
    paperQuestions.get(paperKey).push(questionNumber);
  });

  try {
    await compile(stripFrontMatter(content), {
      remarkPlugins: [remarkMath],
    });
  } catch (error) {
    error.message = `${relativePath}: ${error.message}`;
    throw error;
  }

  totalQuestions += details;
  totalMissingImages += countMatches(content, /^> \*\*题图缺失：\*\*/gmu);
  actualCounts.set(groupKey, (actualCounts.get(groupKey) ?? 0) + details);
}

for (const [bookDirectory, bookConfig] of Object.entries(expectedBooks)) {
  let bookQuestionCount = 0;
  for (const [subjectDirectory, subjectConfig] of Object.entries(
    bookConfig.subjects,
  )) {
    const groupKey = `${bookDirectory}/${subjectDirectory}`;
    const fileCount = actualFileCounts.get(groupKey) ?? 0;
    const questionCount = actualCounts.get(groupKey) ?? 0;
    if (fileCount !== subjectConfig.files) {
      throw new Error(
        `${bookConfig.name} · ${subjectConfig.name} 应有 ${subjectConfig.files} 个章节文件，实际为 ${fileCount} 个`,
      );
    }
    if (questionCount !== subjectConfig.questions) {
      throw new Error(
        `${bookConfig.name} · ${subjectConfig.name} 应有 ${subjectConfig.questions} 道题，实际为 ${questionCount} 道`,
      );
    }
    bookQuestionCount += questionCount;
  }
  if (bookQuestionCount !== bookConfig.questions) {
    throw new Error(
      `${bookConfig.name} 应有 ${bookConfig.questions} 道题，实际为 ${bookQuestionCount} 道`,
    );
  }
}

for (const [paper, numbers] of paperQuestions) {
  const sortedNumbers = [...numbers].sort((left, right) => left - right);
  const expectedNumbers = Array.from({length: 40}, (_, index) => index + 1);
  if (JSON.stringify(sortedNumbers) !== JSON.stringify(expectedNumbers)) {
    throw new Error(`${paper}: 应完整包含第 1 至 40 题`);
  }
}
if (paperQuestions.size !== 15) {
  throw new Error(`应有 15 套完整试卷，实际为 ${paperQuestions.size} 套`);
}

if (totalQuestions !== expectedQuestions || seenTags.size !== expectedQuestions) {
  throw new Error(
    `应有 ${expectedQuestions} 道唯一题目，实际为 ${totalQuestions} 道、${seenTags.size} 个标签`,
  );
}
if (totalMissingImages !== expectedMissingImages) {
  throw new Error(
    `应保留 ${expectedMissingImages} 个缺图提示，实际为 ${totalMissingImages} 个`,
  );
}

console.log(
  `408模拟选择题校验通过：${files.length} 个章节文件，王道 320 题，竟成 280 题，共 ${totalQuestions} 个原生答案折叠区，${totalMissingImages} 个缺图提示`,
);
