import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatChoiceOptionRows} from './choice-option-layout.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'sources', '李正元练习题');
const docsRoot = path.join(projectRoot, 'docs', '李正元练习题');
const generatedMarker =
  '{/* 此文件由 scripts/convert-lizhengyuan-exercises.mjs 自动生成，请勿直接修改。 */}';

const books = [
  {
    subject: '高等数学',
    sourceFiles: [
      '李正元练习题-高等数学-第1至5章-公式格式化.md',
      '李正元练习题-高等数学-第6至11章-公式格式化.md',
    ],
    position: 1,
  },
  {
    subject: '线性代数',
    sourceFiles: ['李正元练习题-线性代数-公式格式化.md'],
    position: 2,
  },
  {
    subject: '概率论与数理统计',
    sourceFiles: ['李正元练习题-概率论与数理统计-公式格式化.md'],
    position: 3,
  },
];

const answerPattern =
  /^\s*(?:[-*+]\s+)?(?:\*\*)?(?:答案|参考答案)\s*[：:](?:\*\*)?\s*(.*)$/;
const analysisPattern =
  /^\s*(?:[-*+]\s+)?(?:\*\*)?(?:解析|解答|证明)\s*[：:](?:\*\*)?\s*(.*)$/;
const questionPattern = /^(?:#{2,3}\s+)?(\d+)[.、]\s*(.*)$/;
const subpartPattern =
  /^\s*([（(](?:\d+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)[）)])(?:\s*(.*))?$/;
const optionPatterns = [
  /^\s*[（(]([A-H])[）)]\s*(.*)$/,
  /^\s*([A-H])[.、]\s+(.*)$/,
];

function normalizeNewlines(content) {
  return content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === '') start += 1;
  while (end > start && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(start, end);
}

function cleanLines(lines) {
  const cleaned = lines.filter((line) => {
    const value = line.trim();
    return (
      value !== '<br>' &&
      value !== '<br/>' &&
      value !== '<br />' &&
      value !== '---' &&
      value !== '<details>' &&
      value !== '</details>' &&
      !/^<summary>.*<\/summary>$/u.test(value) &&
      !/^<!--.*-->$/u.test(value)
    );
  });

  const compact = [];
  for (const line of cleaned) {
    if (line.trim() === '' && compact.at(-1)?.trim() === '') continue;
    compact.push(
      line
        .replace(/^\s+/u, '')
        .replace(/<br\s*>/giu, '<br />')
        .replace(/\s+$/g, ''),
    );
  }
  return trimBlankLines(compact);
}

function sectionLabel(line) {
  return line
    .replace(/^##\s+/, '')
    .replace(/^[一二三四五六七八九十]+、\s*/, '')
    .trim();
}

function safeFilePart(value) {
  return value
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/[，、；：！？（）()[\]{}]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function matchOption(line) {
  for (const pattern of optionPatterns) {
    const match = line.match(pattern);
    if (match) return {label: match[1], content: match[2]};
  }
  return null;
}

function parseOptions(stemLines) {
  const starts = [];
  stemLines.forEach((line, index) => {
    const option = matchOption(line);
    if (option) starts.push({index, ...option});
  });
  if (starts.length < 2) return null;

  const options = starts.map((start, optionIndex) => {
    const end = starts[optionIndex + 1]?.index ?? stemLines.length;
    return {
      label: start.label,
      lines: cleanLines([
        `${start.label}. ${start.content}`,
        ...stemLines.slice(start.index + 1, end),
      ]),
    };
  });

  return {
    stem: cleanLines(stemLines.slice(0, starts[0].index)),
    options,
  };
}

function findMarker(lines, pattern, start = 0) {
  for (let index = start; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (match) return {index, inline: match[1] ?? ''};
  }
  return null;
}

function findMarkers(lines, pattern, start = 0) {
  const markers = [];
  lines.forEach((line, index) => {
    if (index < start) return;
    const match = line.match(pattern);
    if (match) markers.push({index, inline: match[1] ?? ''});
  });
  return markers;
}

function markerContent(lines, marker, end) {
  if (!marker) return [];
  return cleanLines([marker.inline, ...lines.slice(marker.index + 1, end)]);
}

function leadingBlockEnd(contentLines) {
  const firstLine = contentLines[0]?.trim() ?? '';

  if (firstLine === '$$') {
    const closingIndex = contentLines.findIndex(
      (line, index) => index > 0 && line.trim() === '$$',
    );
    return closingIndex >= 0 ? closingIndex + 1 : contentLines.length;
  }

  if (firstLine.startsWith('```')) {
    const fence = firstLine.match(/^`{3,}/u)?.[0] ?? '```';
    const closingIndex = contentLines.findIndex(
      (line, index) => index > 0 && line.trim().startsWith(fence),
    );
    return closingIndex >= 0 ? closingIndex + 1 : contentLines.length;
  }

  if (/^(?:#{1,6}\s|!\[)/u.test(firstLine)) return 1;

  if (/^(?:>|\|)/u.test(firstLine)) {
    const blockPattern = firstLine.startsWith('>') ? /^>/u : /^\|/u;
    const firstNonBlock = contentLines.findIndex(
      (line, index) => index > 0 && !blockPattern.test(line.trim()),
    );
    return firstNonBlock >= 0 ? firstNonBlock : contentLines.length;
  }

  return 0;
}

function renderLabeledContent(label, contentLines) {
  if (contentLines.length === 0) return [];

  const blockEnd = leadingBlockEnd(contentLines);
  if (blockEnd > 0) {
    const leadingBlock = contentLines.slice(0, blockEnd);
    const remainingLines = trimBlankLines(contentLines.slice(blockEnd));
    const output = [
      '<div className="exercise-label-row">',
      `<strong>${label}：</strong>`,
      '<div className="exercise-label-body">',
      '',
      ...leadingBlock,
      '',
      '</div>',
      '</div>',
    ];

    if (remainingLines.length > 0) output.push('', ...remainingLines);
    return output;
  }

  const [firstLine, ...remainingLines] = contentLines;
  return [`**${label}：** ${firstLine}`, ...remainingLines];
}

function renderAnswerDetails(answerLines, analysisLines) {
  if (answerLines.length === 0 && analysisLines.length === 0) return '';

  const lines = ['<details>', '<summary>查看答案与解析</summary>'];

  if (answerLines.length > 0) {
    lines.push('', ...renderLabeledContent('答案', answerLines));
  }

  if (analysisLines.length > 0) {
    lines.push('', ...renderLabeledContent('解析', analysisLines));
  }

  lines.push('', '</details>');
  return lines.join('\n');
}

function ensureBlankLinesAroundBlocks(lines) {
  const output = [];
  let mathBlockOpen = false;
  let codeBlockOpen = false;

  for (const line of lines) {
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

  return trimBlankLines(output);
}

function renderQuestion(question) {
  const {number, rawLines} = question;
  const startMatch = rawLines[0].match(questionPattern);
  const bodyLines = [startMatch?.[2] ?? '', ...rawLines.slice(1)];
  // A question may itself begin with “证明：”; the stripped first line is
  // always part of the stem, never an answer/analysis marker.
  const answerMarkers = findMarkers(bodyLines, answerPattern, 1);
  const analysisMarkers = findMarkers(bodyLines, analysisPattern, 1);
  const answerMarker = answerMarkers[0] ?? null;
  const analysisMarker = answerMarker
    ? (analysisMarkers.find(
        (candidate) => candidate.index > answerMarker.index,
      ) ?? null)
    : (analysisMarkers[0] ?? null);
  const firstMarker =
    answerMarker?.index ??
    analysisMarker?.index ??
    Number.POSITIVE_INFINITY;
  let stemLines = cleanLines(
    bodyLines.slice(0, Number.isFinite(firstMarker) ? firstMarker : bodyLines.length),
  );
  let answerLines;
  let analysisLines;

  if (answerMarkers.length <= 1) {
    const answerEnd = analysisMarker?.index ?? bodyLines.length;
    answerLines = markerContent(bodyLines, answerMarker, answerEnd);
    analysisLines = markerContent(
      bodyLines,
      analysisMarker,
      bodyLines.length,
    );
  } else {
    const pairs = answerMarkers.map((answer, index) => {
      const nextAnswer = answerMarkers[index + 1]?.index ?? bodyLines.length;
      const analysis = analysisMarkers.find(
        (candidate) =>
          candidate.index > answer.index && candidate.index < nextAnswer,
      );
      const previousAnalysis =
        index === 0
          ? -1
          : analysisMarkers.findLast(
              (candidate) => candidate.index < answer.index,
            )?.index ?? -1;
      let promptStart = 0;
      for (
        let lineIndex = previousAnalysis + 1;
        lineIndex < answer.index;
        lineIndex += 1
      ) {
        if (subpartPattern.test(bodyLines[lineIndex])) promptStart = lineIndex;
      }
      return {answer, analysis, promptStart, nextAnswer};
    });

    const extraPrompts = pairs
      .slice(1)
      .flatMap((pair) =>
        cleanLines(bodyLines.slice(pair.promptStart, pair.answer.index)),
      );
    stemLines = cleanLines([...stemLines, ...extraPrompts]);

    answerLines = cleanLines(
      pairs.flatMap((pair) => {
        const label = bodyLines[pair.promptStart]?.match(subpartPattern)?.[1];
        const end = pair.analysis?.index ?? pair.nextAnswer;
        return [
          ...(label ? [`**${label}**`] : []),
          pair.answer.inline,
          ...bodyLines.slice(pair.answer.index + 1, end),
          '',
        ];
      }),
    );

    analysisLines = cleanLines(
      pairs.flatMap((pair, index) => {
        if (!pair.analysis) return [];
        const label = bodyLines[pair.promptStart]?.match(subpartPattern)?.[1];
        const nextPromptStart =
          pairs[index + 1]?.promptStart ?? bodyLines.length;
        return [
          ...(label ? [`**${label}**`] : []),
          pair.analysis.inline,
          ...bodyLines.slice(pair.analysis.index + 1, nextPromptStart),
          '',
        ];
      }),
    );
  }
  const parsedOptions = parseOptions(stemLines);
  const renderedStem = parsedOptions?.stem ?? stemLines;
  const firstStemLine = renderedStem[0] ?? '';
  const startsWithBlock =
    firstStemLine.trim() === '$$' ||
    firstStemLine.trim().startsWith('```');
  const parts = ensureBlankLinesAroundBlocks(
    startsWithBlock
      ? [`${number}. 题目如下：`, ...renderedStem]
      : [
          firstStemLine ? `${number}. ${firstStemLine}` : `${number}.`,
          ...renderedStem.slice(1),
        ],
  );

  if (parsedOptions) {
    parts.push('');
    parts.push(...formatChoiceOptionRows(parsedOptions.options));
  }

  const renderedDetails = renderAnswerDetails(answerLines, analysisLines);
  if (renderedDetails) parts.push(renderedDetails);

  return parts.join('\n');
}

function parseChapter(chapterLines) {
  const candidates = [];
  chapterLines.forEach((line, index) => {
    if (questionPattern.test(line)) candidates.push(index);
  });

  const markers = [];
  chapterLines.forEach((line, index) => {
    if (answerPattern.test(line)) markers.push({index, kind: 'answer'});
    else if (analysisPattern.test(line)) markers.push({index, kind: 'analysis'});
  });

  const records = [];
  let boundary = 0;
  let pendingAnswer = null;

  const lastCandidateBefore = (markerIndex) => {
    const available = candidates.filter(
      (candidate) => candidate >= boundary && candidate < markerIndex,
    );
    return available.at(-1);
  };

  for (const marker of markers) {
    if (marker.kind === 'answer') {
      const start = lastCandidateBefore(marker.index);
      if (start === undefined) continue;
      pendingAnswer = {start};
      records.push(pendingAnswer);
      continue;
    }

    if (pendingAnswer) {
      pendingAnswer.analysis = marker.index;
      pendingAnswer = null;
      boundary = marker.index + 1;
      continue;
    }

    const start = lastCandidateBefore(marker.index);
    if (start === undefined) continue;
    records.push({start, analysis: marker.index});
    boundary = marker.index + 1;
  }

  const actualStarts = [...new Set(records.map((record) => record.start))].sort(
    (left, right) => left - right,
  );
  const questions = [];
  for (let index = 0; index < actualStarts.length; index += 1) {
    const start = actualStarts[index];
    const nextStart = actualStarts[index + 1] ?? chapterLines.length;
    let end = nextStart;

    for (let lineIndex = start + 1; lineIndex < nextStart; lineIndex += 1) {
      if (/^##\s+/.test(chapterLines[lineIndex]) && !questionPattern.test(chapterLines[lineIndex])) {
        end = lineIndex;
        break;
      }
    }

    let section = '综合题';
    for (let lineIndex = start - 1; lineIndex >= 0; lineIndex -= 1) {
      const line = chapterLines[lineIndex];
      if (/^##\s+/.test(line) && !questionPattern.test(line)) {
        section = sectionLabel(line);
        break;
      }
    }

    const match = chapterLines[start].match(questionPattern);
    questions.push({
      number: match[1],
      section,
      rawLines: trimBlankLines(chapterLines.slice(start, end)),
    });
  }
  return questions;
}

function splitChapters(content) {
  const lines = normalizeNewlines(content).split('\n');
  const starts = [];
  lines.forEach((line, index) => {
    if (/^#\s+/.test(line)) starts.push(index);
  });

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? lines.length;
    return {
      title: lines[start].replace(/^#\s+/, '').trim(),
      lines: lines.slice(start + 1, end),
    };
  });
}

async function removeOldGeneratedFiles(directory) {
  try {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.mdx')) continue;
      const filePath = path.join(directory, entry.name);
      const content = await fs.readFile(filePath, 'utf8');
      if (content.includes(generatedMarker)) await fs.unlink(filePath);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function convertBook(book) {
  const outputDirectory = path.join(docsRoot, book.subject);
  const contents = await Promise.all(
    book.sourceFiles.map((sourceFile) =>
      fs.readFile(path.join(sourceRoot, sourceFile), 'utf8'),
    ),
  );
  const content = contents.join('\n\n');
  const chapters = splitChapters(content);

  await fs.mkdir(outputDirectory, {recursive: true});
  await removeOldGeneratedFiles(outputDirectory);
  await writeJson(path.join(outputDirectory, '_category_.json'), {
    label: book.subject,
    position: book.position,
    collapsible: true,
    collapsed: true,
  });

  let questionCount = 0;
  const files = [];
  for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex += 1) {
    const chapter = chapters[chapterIndex];
    const questions = parseChapter(chapter.lines);
    if (questions.length === 0) {
      throw new Error(`${book.subject}《${chapter.title}》未识别到题目`);
    }

    questionCount += questions.length;
    const grouped = new Map();
    for (const question of questions) {
      if (!grouped.has(question.section)) grouped.set(question.section, []);
      grouped.get(question.section).push(question);
    }

    const body = [
      '---',
      `sidebar_position: ${chapterIndex + 1}`,
      `title: ${chapter.title}`,
      '---',
      '',
      generatedMarker,
      '',
      `# ${chapter.title}`,
      '',
      ...[...grouped.entries()].flatMap(([section, sectionQuestions]) => [
        `## ${section}`,
        '',
        ...sectionQuestions.flatMap((question, questionIndex) => [
          renderQuestion(question),
          ...(questionIndex < sectionQuestions.length - 1
            ? ['', '---', '']
            : ['']),
        ]),
      ]),
    ].join('\n');

    const fileName = `${String(chapterIndex + 1).padStart(2, '0')}-${safeFilePart(chapter.title)}.mdx`;
    await fs.writeFile(path.join(outputDirectory, fileName), body, 'utf8');
    files.push(fileName);
  }

  return {subject: book.subject, chapters: chapters.length, questions: questionCount, files};
}

async function main() {
  await fs.mkdir(docsRoot, {recursive: true});
  await writeJson(path.join(docsRoot, '_category_.json'), {
    label: '李正元练习题',
    position: 3,
    collapsible: true,
    collapsed: true,
  });

  const results = [];
  for (const book of books) results.push(await convertBook(book));

  for (const result of results) {
    console.log(
      `${result.subject}: ${result.chapters} 章，${result.questions} 道题，生成 ${result.files.length} 个 MDX 文件`,
    );
  }
}

await main();
