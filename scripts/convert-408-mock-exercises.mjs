import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatChoiceOptionRows} from './choice-option-layout.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(
  projectRoot,
  'sources',
  '408模拟选择题',
  '408模拟选择题详细解答_合并版_600题-Docusaurus公式格式化.md',
);
const docsRoot = path.join(projectRoot, 'docs', '408模拟选择题');
const generatedMarker =
  '{/* 此文件由 scripts/convert-408-mock-exercises.mjs 自动生成，请勿直接修改。 */}';

const books = [
  {
    name: '王道',
    position: 1,
    expectedQuestions: 320,
    paperPattern: /^卷[一二三四五六七八]$/u,
  },
  {
    name: '竟成',
    position: 2,
    expectedQuestions: 280,
    paperPattern: /^模拟[一二三四五六七]$/u,
  },
];

const subjects = [
  {
    name: '数据结构',
    position: 1,
    expectedQuestions: 165,
    expectedByBook: {王道: 88, 竟成: 77},
    expectedChapters: 8,
  },
  {
    name: '计算机组成原理',
    position: 2,
    expectedQuestions: 165,
    expectedByBook: {王道: 88, 竟成: 77},
    expectedChapters: 7,
  },
  {
    name: '操作系统',
    position: 3,
    expectedQuestions: 150,
    expectedByBook: {王道: 80, 竟成: 70},
    expectedChapters: 5,
  },
  {
    name: '计算机网络',
    position: 4,
    expectedQuestions: 120,
    expectedByBook: {王道: 64, 竟成: 56},
    expectedChapters: 6,
  },
];

const questionPattern =
  /^(\d+)[.、]\s+(\*\*【([^】]+)】\*\*\s*.*)$/u;
const tagPattern =
  /^(王道|竟成)·(卷[一二三四五六七八]|模拟[一二三四五六七])-(Q?)(\d{2})$/u;
const optionPattern = /^\s*([A-D])[.、]\s*(.*)$/u;
const answerPattern = /^\s*[-*+]\s+答案[：:]\s*(.*)$/u;
const analysisPattern = /^\s*[-*+]\s+(?:解析|解答)[：:]\s*(.*)$/u;
const headingPattern = /^#{2,5}\s+/u;

function normalizeNewlines(content) {
  return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function stripBreakTags(line) {
  return line.replace(/<br\s*\/?>/giu, '').replace(/\s+$/u, '');
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

function compactBlankLines(lines) {
  const compact = [];
  for (const line of lines) {
    if (line.trim() === '' && compact.at(-1)?.trim() === '') continue;
    compact.push(line);
  }
  return trimBlankLines(compact);
}

function cleanContentLines(lines) {
  return compactBlankLines(
    lines.map((line) => stripBreakTags(line).replace(/^\s+/u, '')),
  );
}

function replaceMissingImage(line) {
  const match = line.match(/^!\[([^\]]*)\]\((images\/[^)]+)\)$/u);
  if (!match) return line;
  const [, alt, imagePath] = match;
  return `> **题图缺失：** ${alt || '未命名题图'}（原引用：\`${imagePath}\`）`;
}

function ensureBlankLinesAroundBlocks(lines) {
  const output = [];
  let mathBlockOpen = false;
  let codeBlockOpen = false;

  for (const sourceLine of lines) {
    const line = replaceMissingImage(sourceLine);
    const trimmed = line.trim();
    const isMathFence = trimmed === '$$';
    const isCodeFence = trimmed.startsWith('```');

    if (
      (isMathFence && !mathBlockOpen) ||
      (isCodeFence && !codeBlockOpen)
    ) {
      if (output.at(-1)?.trim() !== '') output.push('');
    }

    output.push(line);

    if (isMathFence) {
      mathBlockOpen = !mathBlockOpen;
      if (!mathBlockOpen) output.push('');
    } else if (isCodeFence) {
      codeBlockOpen = !codeBlockOpen;
      if (!codeBlockOpen) output.push('');
    }
  }

  return compactBlankLines(output);
}

function markerContent(lines, markerIndex, pattern, end) {
  const inline = lines[markerIndex].match(pattern)?.[1] ?? '';
  return ensureBlankLinesAroundBlocks(
    cleanContentLines([inline, ...lines.slice(markerIndex + 1, end)]),
  );
}

function parseOptions(lines) {
  const starts = [];
  lines.forEach((line, index) => {
    const match = line.match(optionPattern);
    if (match) starts.push({index, label: match[1], inline: match[2]});
  });

  if (starts.length === 0) return null;
  if (
    starts.length !== 4 ||
    starts.map((option) => option.label).join('') !== 'ABCD'
  ) {
    throw new Error(`选项结构异常：${starts.map((option) => option.label).join('')}`);
  }

  return {
    stem: cleanContentLines(lines.slice(0, starts[0].index)),
    options: starts.map((start, optionIndex) => {
      const end = starts[optionIndex + 1]?.index ?? lines.length;
      return {
        label: start.label,
        lines: cleanContentLines([
          `${start.label}. ${start.inline}`,
          ...lines.slice(start.index + 1, end),
        ]),
      };
    }),
  };
}

function renderLabeledContent(label, lines) {
  const [firstLine, ...remainingLines] = lines;
  if (firstLine === undefined) {
    throw new Error(`${label}内容为空`);
  }

  const firstTrimmed = firstLine.trim();
  const startsBlock =
    firstTrimmed === '$$' || firstTrimmed.startsWith('```');

  if (startsBlock) {
    return [`**${label}：**`, '', firstLine, ...remainingLines];
  }

  return [`**${label}：** ${firstLine}`, ...remainingLines];
}

function renderDetails(answerLines, analysisLines) {
  return [
    '<details>',
    '<summary>查看答案与解析</summary>',
    '',
    ...renderLabeledContent('答案', answerLines),
    '',
    ...renderLabeledContent('解析', analysisLines),
    '',
    '</details>',
  ];
}

function renderQuestion(block, displayNumber) {
  const questionMatch = stripBreakTags(block[0]).match(questionPattern);
  if (!questionMatch) throw new Error(`无法识别题目：${block[0]}`);

  const answerIndex = block.findIndex((line) => answerPattern.test(line));
  const analysisIndex = block.findIndex((line) => analysisPattern.test(line));
  if (answerIndex < 1 || analysisIndex <= answerIndex) {
    throw new Error(`题目 ${questionMatch[3]} 缺少答案或解析`);
  }

  const promptLines = [
    questionMatch[2],
    ...block.slice(1, answerIndex),
  ].map(stripBreakTags);
  const parsedOptions = parseOptions(promptLines);
  const stemLines = parsedOptions?.stem ?? cleanContentLines(promptLines);
  const [firstStemLine = '题目如下：', ...remainingStemLines] = stemLines;
  const renderedStem = ensureBlankLinesAroundBlocks([
    `${displayNumber}. ${firstStemLine}`,
    ...remainingStemLines,
  ]);
  const renderedOptions = parsedOptions
    ? ensureBlankLinesAroundBlocks(formatChoiceOptionRows(parsedOptions.options))
    : [];
  const answerLines = markerContent(
    block,
    answerIndex,
    answerPattern,
    analysisIndex,
  );
  const analysisLines = markerContent(
    block,
    analysisIndex,
    analysisPattern,
    block.length,
  );

  return [
    ...renderedStem,
    ...(renderedOptions.length > 0 ? ['', ...renderedOptions] : []),
    '',
    ...renderDetails(answerLines, analysisLines),
  ];
}

function parseKnowledgeHeading(line) {
  const match = line.match(/^#{3,5}\s+(.+?)\s*$/u);
  if (!match) return null;

  const normalizedTitle = match[1].replace(/^\*(?=\d)/u, '');
  const chapterMatch = normalizedTitle.match(/^第(\d+)章\s+(.+)$/u);
  if (chapterMatch) {
    return {
      type: 'chapter',
      number: Number(chapterMatch[1]),
      label: `第${chapterMatch[1]}章 ${chapterMatch[2]}`,
      title: chapterMatch[2],
    };
  }

  const subsectionMatch = normalizedTitle.match(
    /^(\d+\.\d+\.\d+)\s+(.+)$/u,
  );
  if (subsectionMatch) {
    return {
      type: 'subsection',
      number: subsectionMatch[1],
      label: `${subsectionMatch[1]} ${subsectionMatch[2]}`,
    };
  }

  const sectionMatch = normalizedTitle.match(/^(\d+\.\d+)\s+(.+)$/u);
  if (sectionMatch) {
    return {
      type: 'section',
      number: sectionMatch[1],
      label: `${sectionMatch[1]} ${sectionMatch[2]}`,
    };
  }

  if (line.startsWith('##### ')) {
    return {
      type: 'subsection',
      number: null,
      label: normalizedTitle,
    };
  }

  return null;
}

function parseQuestionTag(tag, sourceLine) {
  const match = tag.match(tagPattern);
  if (!match) {
    throw new Error(`第 ${sourceLine} 行题目标记格式异常：${tag}`);
  }

  const [, book, paper, prefix, questionNumber] = match;
  const bookConfig = books.find((candidate) => candidate.name === book);
  if (!bookConfig?.paperPattern.test(paper)) {
    throw new Error(`第 ${sourceLine} 行书名与试卷不匹配：${tag}`);
  }
  if ((book === '王道' && prefix !== 'Q') || (book === '竟成' && prefix !== '')) {
    throw new Error(`第 ${sourceLine} 行题号前缀异常：${tag}`);
  }

  return {
    tag,
    book,
    paper,
    questionNumber: Number(questionNumber),
  };
}

function parseQuestions(lines) {
  const questions = [];
  let subject = null;
  let chapter = null;
  let section = null;
  let subsection = null;

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const subjectMatch = line.match(/^##\s+(.+?)\s*$/u);
    const subjectConfig = subjectMatch
      ? subjects.find((candidate) => candidate.name === subjectMatch[1])
      : null;

    if (subjectConfig) {
      subject = subjectConfig.name;
      chapter = null;
      section = null;
      subsection = null;
      index += 1;
      continue;
    }

    const knowledgeHeading = parseKnowledgeHeading(line);
    if (knowledgeHeading?.type === 'chapter') {
      chapter = knowledgeHeading;
      section = null;
      subsection = null;
      index += 1;
      continue;
    }
    if (knowledgeHeading?.type === 'section') {
      section = knowledgeHeading;
      subsection = null;
      index += 1;
      continue;
    }
    if (knowledgeHeading?.type === 'subsection') {
      subsection = knowledgeHeading;
      index += 1;
      continue;
    }

    const questionMatch = stripBreakTags(line).match(questionPattern);
    if (!questionMatch) {
      index += 1;
      continue;
    }
    if (!subject || !chapter || !section) {
      throw new Error(`第 ${index + 1} 行题目缺少科目、章或节上下文`);
    }

    let end = index + 1;
    while (
      end < lines.length &&
      !questionPattern.test(stripBreakTags(lines[end])) &&
      !headingPattern.test(lines[end])
    ) {
      end += 1;
    }

    const tag = parseQuestionTag(questionMatch[3], index + 1);
    questions.push({
      ...tag,
      sourceLine: index + 1,
      subject,
      chapter: {...chapter},
      section: {...section},
      subsection: subsection ? {...subsection} : null,
      block: lines.slice(index, end),
    });
    index = end;
  }

  return questions;
}

function escapeInlineMdxText(line) {
  let inlineMathOpen = false;
  let inlineCodeOpen = false;
  let output = '';

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const escaped = index > 0 && line[index - 1] === '\\';

    if (character === '`' && !escaped && !inlineMathOpen) {
      inlineCodeOpen = !inlineCodeOpen;
      output += character;
      continue;
    }
    if (character === '$' && !escaped && !inlineCodeOpen) {
      inlineMathOpen = !inlineMathOpen;
      output += character;
      continue;
    }

    if (!inlineMathOpen && !inlineCodeOpen) {
      if (character === '<') {
        output += '&lt;';
        continue;
      }
      if (character === '{') {
        output += '&#123;';
        continue;
      }
      if (character === '}') {
        output += '&#125;';
        continue;
      }
    }

    output += character;
  }

  return output;
}

function sanitizeMdxLines(lines) {
  const output = [];
  let mathBlockOpen = false;
  let codeBlockOpen = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isMathFence = trimmed === '$$';
    const isCodeFence = trimmed.startsWith('```');
    const isGeneratedTag =
      /^<\/?details>$/u.test(trimmed) ||
      /^<summary>.*<\/summary>$/u.test(trimmed) ||
      /^<div className="choice-options">$/u.test(trimmed) ||
      /^<\/div>$/u.test(trimmed);
    const choiceRowMatch = line.match(
      /^(\s*<div className="choice-option-row">)(.*)(<\/div>\s*)$/u,
    );

    if (isMathFence) {
      mathBlockOpen = !mathBlockOpen;
      output.push(line);
      continue;
    }
    if (isCodeFence) {
      codeBlockOpen = !codeBlockOpen;
      output.push(line);
      continue;
    }
    if (choiceRowMatch) {
      output.push(
        `${choiceRowMatch[1]}${escapeInlineMdxText(choiceRowMatch[2])}${choiceRowMatch[3]}`,
      );
      continue;
    }

    output.push(
      mathBlockOpen || codeBlockOpen || isGeneratedTag
        ? line
        : escapeInlineMdxText(line),
    );
  }

  return output;
}

function safeFileSegment(value) {
  return value
    .replace(/[\\/:*?"<>|]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function renderChapterPage(questions) {
  const output = [];
  let previousSection = null;
  let previousSubsection = null;

  questions.forEach((question, index) => {
    if (question.section.label !== previousSection) {
      if (output.length > 0) output.push('');
      output.push(`## ${question.section.label}`, '');
      previousSection = question.section.label;
      previousSubsection = null;
    }

    const subsectionLabel = question.subsection?.label ?? null;
    if (subsectionLabel && subsectionLabel !== previousSubsection) {
      output.push(`### ${subsectionLabel}`, '');
      previousSubsection = subsectionLabel;
    }

    output.push(...renderQuestion(question.block, index + 1));
    if (index < questions.length - 1) {
      output.push('', '---', '');
    }
  });

  return compactBlankLines(output);
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function clearGeneratedDocs() {
  await fs.mkdir(docsRoot, {recursive: true});
  const entries = await fs.readdir(docsRoot, {withFileTypes: true});

  for (const entry of entries) {
    const entryPath = path.join(docsRoot, entry.name);
    if (entry.isFile() && entry.name.endsWith('.mdx')) {
      const content = await fs.readFile(entryPath, 'utf8');
      if (content.includes(generatedMarker)) await fs.rm(entryPath);
    }
  }

  const generatedDirectoryNames = [
    ...books.map(
      (book) => `${String(book.position).padStart(2, '0')}-${book.name}`,
    ),
    ...subjects.map(
      (subject) =>
        `${String(subject.position).padStart(2, '0')}-${subject.name}`,
    ),
  ];

  for (const directoryName of generatedDirectoryNames) {
    const directoryPath = path.join(docsRoot, directoryName);
    if (
      path.dirname(directoryPath) !== docsRoot ||
      path.basename(directoryPath) !== directoryName
    ) {
      throw new Error(`拒绝清理超出 408 生成目录的路径：${directoryPath}`);
    }
    await fs.rm(directoryPath, {recursive: true, force: true});
  }
}

async function main() {
  const source = normalizeNewlines(await fs.readFile(sourcePath, 'utf8'));
  const questions = parseQuestions(source.split('\n'));
  if (questions.length !== 600) {
    throw new Error(`应解析 600 道题，实际为 ${questions.length} 道`);
  }

  await clearGeneratedDocs();
  await writeJson(path.join(docsRoot, '_category_.json'), {
    label: '408模拟选择题',
    position: 4,
    collapsible: true,
    collapsed: true,
  });

  let totalQuestions = 0;
  let totalFiles = 0;

  for (const subject of subjects) {
    const subjectRoot = path.join(
      docsRoot,
      `${String(subject.position).padStart(2, '0')}-${subject.name}`,
    );
    await fs.mkdir(subjectRoot, {recursive: true});
    await writeJson(path.join(subjectRoot, '_category_.json'), {
      label: subject.name,
      position: subject.position,
      collapsible: true,
      collapsed: true,
    });

    const subjectQuestions = questions.filter(
      (question) => question.subject === subject.name,
    );
    if (subjectQuestions.length !== subject.expectedQuestions) {
      throw new Error(
        `${subject.name} 应有 ${subject.expectedQuestions} 道题，实际为 ${subjectQuestions.length} 道`,
      );
    }

    for (const book of books) {
      const bookQuestionCount = subjectQuestions.filter(
        (question) => question.book === book.name,
      ).length;
      if (bookQuestionCount !== subject.expectedByBook[book.name]) {
        throw new Error(
          `${subject.name} · ${book.name} 应有 ${subject.expectedByBook[book.name]} 道题，实际为 ${bookQuestionCount} 道`,
        );
      }
    }

    const chapters = new Map();
    for (const question of subjectQuestions) {
      const key = question.chapter.number;
      if (!chapters.has(key)) chapters.set(key, []);
      chapters.get(key).push(question);
    }
    if (chapters.size !== subject.expectedChapters) {
      throw new Error(
        `${subject.name} 应有 ${subject.expectedChapters} 个章节，实际为 ${chapters.size} 个`,
      );
    }

    for (const [chapterNumber, chapterQuestions] of [...chapters.entries()].sort(
      ([left], [right]) => left - right,
    )) {
      chapterQuestions.sort(
        (left, right) => left.sourceLine - right.sourceLine,
      );
      const chapter = chapterQuestions[0].chapter;
      const title = `408模拟选择题 · ${subject.name} · ${chapter.label}`;
      const fileName =
        `${String(chapterNumber).padStart(2, '0')}-` +
        `${safeFileSegment(chapter.label)}.mdx`;
      const body = [
        '---',
        `sidebar_position: ${chapterNumber}`,
        `title: ${title}`,
        '---',
        '',
        generatedMarker,
        '',
        `# ${title}`,
        '',
        ...sanitizeMdxLines(renderChapterPage(chapterQuestions)),
        '',
      ].join('\n');
      await fs.writeFile(path.join(subjectRoot, fileName), body, 'utf8');
      totalFiles += 1;
    }

    totalQuestions += subjectQuestions.length;
    console.log(
      `${subject.name}: ${subjectQuestions.length} 道题（王道 ${subject.expectedByBook.王道}，竟成 ${subject.expectedByBook.竟成}），${chapters.size} 个章节文件`,
    );
  }

  for (const book of books) {
    const bookQuestionCount = questions.filter(
      (question) => question.book === book.name,
    ).length;
    if (bookQuestionCount !== book.expectedQuestions) {
      throw new Error(
        `${book.name} 应有 ${book.expectedQuestions} 道题，实际为 ${bookQuestionCount} 道`,
      );
    }
  }

  if (totalFiles !== 26 || totalQuestions !== 600) {
    throw new Error(
      `生成结果异常：${totalFiles} 个 MDX 文件，${totalQuestions} 道题`,
    );
  }

  console.log(
    `408模拟选择题: 共 ${totalQuestions} 道题，按科目和章节生成 ${totalFiles} 个 MDX 文件`,
  );
}

await main();
