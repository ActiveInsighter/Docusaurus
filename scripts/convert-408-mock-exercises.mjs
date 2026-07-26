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

const subjects = [
  {name: '数据结构', position: 1, expectedQuestions: 165},
  {name: '计算机组成原理', position: 2, expectedQuestions: 165},
  {name: '操作系统', position: 3, expectedQuestions: 150},
  {name: '计算机网络', position: 4, expectedQuestions: 120},
];

const questionPattern = /^(\d+)[.、]\s+(.*)$/u;
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
  return cleanContentLines([inline, ...lines.slice(markerIndex + 1, end)]);
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

function renderDetails(answerLines, analysisLines) {
  return [
    '<details>',
    '<summary>查看答案与解析</summary>',
    '',
    '**答案**',
    '',
    ...answerLines,
    '',
    '**解析**',
    '',
    ...analysisLines,
    '',
    '</details>',
  ];
}

function renderQuestion(block) {
  const questionMatch = stripBreakTags(block[0]).match(questionPattern);
  if (!questionMatch) throw new Error(`无法识别题目：${block[0]}`);

  const answerIndex = block.findIndex((line) => answerPattern.test(line));
  const analysisIndex = block.findIndex((line) => analysisPattern.test(line));
  if (
    answerIndex < 1 ||
    analysisIndex <= answerIndex
  ) {
    throw new Error(`题目 ${questionMatch[1]} 缺少答案或解析`);
  }

  const promptLines = [
    questionMatch[2],
    ...block.slice(1, answerIndex),
  ].map(stripBreakTags);
  const parsedOptions = parseOptions(promptLines);
  const stemLines = parsedOptions?.stem ?? cleanContentLines(promptLines);
  const [firstStemLine = '题目如下：', ...remainingStemLines] = stemLines;
  const renderedStem = ensureBlankLinesAroundBlocks([
    `${questionMatch[1]}. ${firstStemLine}`,
    ...remainingStemLines,
  ]);
  const renderedOptions = parsedOptions
    ? formatChoiceOptionRows(parsedOptions.options)
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

function promoteHeading(line) {
  if (/^#####\s+/u.test(line)) return line.replace(/^#####/u, '####');
  if (/^####\s+/u.test(line)) return line.replace(/^####/u, '###');
  if (/^###\s+/u.test(line)) return line.replace(/^###/u, '##');
  return line;
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
      /^<summary>.*<\/summary>$/u.test(trimmed);

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

    output.push(
      mathBlockOpen || codeBlockOpen || isGeneratedTag
        ? line
        : escapeInlineMdxText(line),
    );
  }

  return output;
}

function convertSubject(lines) {
  const output = [];
  let questionCount = 0;

  for (let index = 0; index < lines.length;) {
    if (!questionPattern.test(lines[index])) {
      const cleaned = stripBreakTags(lines[index]);
      output.push(promoteHeading(cleaned));
      index += 1;
      continue;
    }

    let end = index + 1;
    while (
      end < lines.length &&
      !questionPattern.test(lines[end]) &&
      !headingPattern.test(lines[end])
    ) {
      end += 1;
    }

    output.push(...renderQuestion(lines.slice(index, end)), '', '---', '');
    questionCount += 1;
    index = end;
  }

  return {
    lines: compactBlankLines(output),
    questionCount,
  };
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const source = normalizeNewlines(await fs.readFile(sourcePath, 'utf8'));
  const lines = source.split('\n');
  await fs.mkdir(docsRoot, {recursive: true});
  await writeJson(path.join(docsRoot, '_category_.json'), {
    label: '408模拟选择题',
    position: 4,
    collapsible: true,
    collapsed: true,
  });

  let totalQuestions = 0;
  for (const subject of subjects) {
    const heading = `## ${subject.name}`;
    const start = lines.findIndex((line) => line.trim() === heading);
    if (start < 0) throw new Error(`未找到科目标题：${heading}`);

    let end = lines.length;
    for (let index = start + 1; index < lines.length; index += 1) {
      if (
        lines[index].startsWith('## ') &&
        subjects.some((candidate) => lines[index].trim() === `## ${candidate.name}`)
      ) {
        end = index;
        break;
      }
    }

    const converted = convertSubject(lines.slice(start + 1, end));
    if (converted.questionCount !== subject.expectedQuestions) {
      throw new Error(
        `${subject.name} 应有 ${subject.expectedQuestions} 道题，实际为 ${converted.questionCount} 道`,
      );
    }

    const body = [
      '---',
      `sidebar_position: ${subject.position}`,
      `title: 408模拟选择题 · ${subject.name}`,
      '---',
      '',
      generatedMarker,
      '',
      `# 408模拟选择题 · ${subject.name}`,
      '',
      ...sanitizeMdxLines(converted.lines),
      '',
    ].join('\n');
    const fileName = `${String(subject.position).padStart(2, '0')}-${subject.name}.mdx`;
    await fs.writeFile(path.join(docsRoot, fileName), body, 'utf8');
    totalQuestions += converted.questionCount;
    console.log(`${subject.name}: ${converted.questionCount} 道题`);
  }

  console.log(`408模拟选择题: 共 ${totalQuestions} 道题，生成 ${subjects.length} 个 MDX 文件`);
}

await main();
