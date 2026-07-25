export type QuestionCopyMode = 'question' | 'solution';

export type QuestionCopyState = {
  answerVisible: boolean;
  analysisExpanded: boolean;
};

export type QuestionCopyText =
  | string
  | {
      question?: string;
      answer?: string;
      analysis?: string;
      solution?: string;
    };

const blockElements = new Set([
  'article',
  'aside',
  'div',
  'figure',
  'figcaption',
  'footer',
  'header',
  'main',
  'section',
]);

function normalizeMarkdown(value: string): string {
  const lines = value
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const output: string[] = [];
  let fence: {character: string; length: number} | null = null;
  let consecutiveBlankLines = 0;

  for (const sourceLine of lines) {
    if (fence) {
      output.push(sourceLine);
      const closingFence = sourceLine.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (
        closingFence &&
        closingFence[1][0] === fence.character &&
        closingFence[1].length >= fence.length
      ) {
        fence = null;
      }
      continue;
    }

    const line = sourceLine.replace(/[ \t]+$/g, '');
    const openingFence = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (openingFence) {
      fence = {
        character: openingFence[1][0],
        length: openingFence[1].length,
      };
      output.push(line);
      consecutiveBlankLines = 0;
      continue;
    }

    if (line.trim().length === 0) {
      consecutiveBlankLines += 1;
      if (output.length > 0 && consecutiveBlankLines <= 2) {
        output.push('');
      }
      continue;
    }

    output.push(line);
    consecutiveBlankLines = 0;
  }

  return output.join('\n').replace(/^\n+|\n+$/g, '');
}

function serializeChildren(element: Element): string {
  return Array.from(element.childNodes).map(serializeNode).join('');
}

function serializeMath(element: Element, display: boolean): string {
  const annotation = element.querySelector(
    'annotation[encoding="application/x-tex"]',
  );
  const latex = annotation?.textContent?.trim();

  if (!latex) {
    return '';
  }

  return display ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`;
}

function serializeCodeBlock(element: Element): string {
  const pre = element.tagName.toLowerCase() === 'pre'
    ? element
    : element.querySelector('pre');

  if (!pre) {
    return '';
  }

  const code = pre.querySelector('code') ?? pre;
  const languageClass = Array.from(code.classList)
    .concat(Array.from(pre.classList))
    .find((className) => className.startsWith('language-'));
  const language = languageClass?.slice('language-'.length) ?? '';
  const content = (code.textContent ?? '').replace(/\n$/, '');
  const longestBacktickRun = Math.max(
    0,
    ...(content.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));

  return `\n\n${fence}${language}\n${content}\n${fence}\n\n`;
}

function serializeList(element: Element, ordered: boolean): string {
  const items = Array.from(element.children).filter(
    (child) => child.tagName.toLowerCase() === 'li',
  );

  return `\n${items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : '-';
      const content = normalizeMarkdown(serializeChildren(item)).replace(
        /\n/g,
        '\n  ',
      );
      return `${marker} ${content}`;
    })
    .join('\n')}\n\n`;
}

function serializeTable(element: Element): string {
  const rows = Array.from(element.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) =>
      normalizeMarkdown(serializeChildren(cell))
        .replace(/\|/g, '\\|')
        .replace(/\n+/g, ' '),
    ),
  );

  if (rows.length === 0) {
    return '';
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array.from({length: columnCount - row.length}, () => ''),
  ]);
  const header = normalizedRows[0];
  const divider = Array.from({length: columnCount}, () => '---');
  const body = normalizedRows.slice(1);
  const renderRow = (row: string[]) => `| ${row.join(' | ')} |`;

  return `\n\n${[header, divider, ...body].map(renderRow).join('\n')}\n\n`;
}

function serializeImage(element: Element): string {
  const alt = element.getAttribute('alt') ?? '';
  const source = element.getAttribute('src') ?? '';
  const title = element.getAttribute('title');
  const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : '';

  return source ? `![${alt}](${source}${titlePart})` : '';
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }

  if (!(node instanceof Element)) {
    return '';
  }

  if (node.hasAttribute('data-question-copy-ignore')) {
    return '';
  }

  const copyOverride = node.getAttribute('data-question-copy-text');
  if (copyOverride !== null) {
    return copyOverride;
  }

  if (node.hasAttribute('data-question-blank')) {
    return node.getAttribute('data-question-blank-placeholder') ?? '____';
  }

  if (node.classList.contains('katex-display')) {
    return serializeMath(node, true);
  }

  if (node.classList.contains('katex')) {
    return serializeMath(node, false);
  }

  if (
    node.classList.contains('theme-code-block') ||
    node.tagName.toLowerCase() === 'pre'
  ) {
    return serializeCodeBlock(node);
  }

  const tagName = node.tagName.toLowerCase();

  if (
    ['button', 'input', 'script', 'style', 'svg', 'textarea'].includes(tagName)
  ) {
    return '';
  }

  if (tagName === 'img') {
    return serializeImage(node);
  }

  if (tagName === 'table') {
    return serializeTable(node);
  }

  if (tagName === 'ul' || tagName === 'ol') {
    return serializeList(node, tagName === 'ol');
  }

  if (tagName === 'br') {
    return '  \n';
  }

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName.slice(1));
    return `\n\n${'#'.repeat(level)} ${normalizeMarkdown(
      serializeChildren(node),
    )}\n\n`;
  }

  if (tagName === 'p') {
    return `\n\n${normalizeMarkdown(serializeChildren(node))}\n\n`;
  }

  if (tagName === 'blockquote') {
    const content = normalizeMarkdown(serializeChildren(node))
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    return `\n\n${content}\n\n`;
  }

  if (tagName === 'a') {
    const content = normalizeMarkdown(serializeChildren(node));
    const href = node.getAttribute('href');
    return href ? `[${content}](${href})` : content;
  }

  if (tagName === 'strong' || tagName === 'b') {
    return `**${normalizeMarkdown(serializeChildren(node))}**`;
  }

  if (tagName === 'em' || tagName === 'i') {
    return `*${normalizeMarkdown(serializeChildren(node))}*`;
  }

  if (tagName === 'del' || tagName === 's') {
    return `~~${normalizeMarkdown(serializeChildren(node))}~~`;
  }

  if (tagName === 'code') {
    const content = node.textContent ?? '';
    const longestBacktickRun = Math.max(
      0,
      ...(content.match(/`+/g) ?? []).map((run) => run.length),
    );
    const delimiter = '`'.repeat(longestBacktickRun + 1);
    const padding = /^[\s`]|[\s`]$/.test(content) ? ' ' : '';
    return `${delimiter}${padding}${content}${padding}${delimiter}`;
  }

  const content = serializeChildren(node);
  return blockElements.has(tagName) ? `\n${content}\n` : content;
}

function readDataset(root: HTMLElement, key: string): string | undefined {
  const value = root.dataset[key];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function buildHeading(root: HTMLElement): string {
  return `## ${readDataset(root, 'questionNumber') ?? '题目'}`;
}

function buildMetadata(root: HTMLElement): string {
  const metadata = [
    readDataset(root, 'questionTypeLabel'),
    readDataset(root, 'questionSource'),
    readDataset(root, 'questionYear'),
    readDataset(root, 'questionScore'),
    readDataset(root, 'questionDifficulty'),
    readDataset(root, 'questionTags'),
  ].filter((value): value is string => Boolean(value));

  return metadata.length > 0 ? `> ${metadata.join(' · ')}` : '';
}

function buildOptions(root: HTMLElement): string {
  const optionsRoot = root.querySelector<HTMLElement>('[data-question-options]');
  const optionsOverride = optionsRoot?.getAttribute('data-question-copy-text');
  if (optionsOverride) {
    return `### 选项\n\n${optionsOverride}`;
  }

  const options = Array.from(
    root.querySelectorAll<HTMLElement>('[data-question-option]'),
  );

  if (options.length === 0) {
    return '';
  }

  const rows = options.map((option) => {
    const contentElement =
      option.querySelector<HTMLElement>('[data-question-option-content]') ??
      option;
    const content = normalizeMarkdown(serializeNode(contentElement));
    const hasBlockContent =
      content.includes('\n') ||
      /^(?:`{3,}|~{3,}|[-+*] |\d+\. |> |#{1,6} |\$\$|\| )/.test(
        content,
      );
    const marker = '-';

    if (hasBlockContent) {
      const indentedContent = content
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n');
      return `${marker}\n\n${indentedContent}`;
    }

    return `${marker}${content ? ` ${content}` : ''}`;
  });

  return `### 选项\n\n${rows.join('\n')}`;
}

function buildStructuredAnswer(root: HTMLElement): string {
  const type = readDataset(root, 'questionType');
  const correctOptions = Array.from(
    root.querySelectorAll<HTMLElement>(
      '[data-question-option][data-question-correct="true"]',
    ),
  )
    .map((option) => {
      const contentElement =
        option.querySelector<HTMLElement>(
          '[data-question-option-content]',
        ) ?? option;
      return normalizeMarkdown(serializeNode(contentElement));
    })
    .filter(Boolean);
  const blanks = Array.from(
    root.querySelectorAll<HTMLElement>('[data-question-blank]'),
  ).map((blank) => {
    const answer = blank.querySelector<HTMLElement>(
      '[data-question-blank-answer]',
    );
    return answer ? normalizeMarkdown(serializeNode(answer)) : '';
  }).filter(Boolean);
  const authoredAnswers = Array.from(
    root.querySelectorAll<HTMLElement>('[data-question-answer-content]'),
  )
    .map((answer) => normalizeMarkdown(serializeNode(answer)))
    .filter(Boolean);
  const parts: string[] = [];

  if (correctOptions.length > 0) {
    parts.push(correctOptions.join('、'));
  }

  if (blanks.length > 0) {
    if (type === 'judge') {
      parts.push(blanks[0]);
    } else if (blanks.length === 1) {
      parts.push(blanks[0]);
    } else {
      parts.push(blanks.map((answer, index) => `${index + 1}. ${answer}`).join('\n'));
    }
  }

  parts.push(...authoredAnswers);

  return parts.join('\n\n');
}

function readOverride(
  copyText: QuestionCopyText | undefined,
  state: QuestionCopyState,
): string | undefined {
  if (typeof copyText === 'string') {
    return copyText;
  }

  if (state.answerVisible && state.analysisExpanded) {
    return copyText?.solution;
  }

  if (state.answerVisible) {
    return copyText?.answer;
  }

  if (state.analysisExpanded) {
    return copyText?.analysis;
  }

  return copyText?.question;
}

export function buildQuestionMarkdown(
  root: HTMLElement,
  selection: QuestionCopyMode | QuestionCopyState,
  copyText?: QuestionCopyText,
): string {
  const state: QuestionCopyState =
    typeof selection === 'string'
      ? {
          answerVisible: selection === 'solution',
          analysisExpanded: selection === 'solution',
        }
      : selection;
  const override = readOverride(copyText, state);
  if (override) {
    return normalizeMarkdown(override);
  }

  const stem = root.querySelector<HTMLElement>('[data-question-stem]');
  const analysis = root.querySelector<HTMLElement>(
    '[data-question-analysis-content]',
  );
  const questionParts = [
    buildHeading(root),
    buildMetadata(root),
    stem ? normalizeMarkdown(serializeNode(stem)) : '',
    buildOptions(root),
  ].filter(Boolean);

  const answer = state.answerVisible ? buildStructuredAnswer(root) : '';
  const solutionParts = [
    ...questionParts,
    answer ? `### 答案\n\n${answer}` : '',
    state.analysisExpanded && analysis
      ? `### 解析\n\n${normalizeMarkdown(serializeNode(analysis))}`
      : '',
  ].filter(Boolean);

  return normalizeMarkdown(solutionParts.join('\n\n'));
}

export async function writeClipboardText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back to the selection-based API for restricted browser contexts.
    }
  }

  const textarea = document.createElement('textarea');
  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.inset = '0 auto auto -9999px';
  document.body.appendChild(textarea);

  try {
    textarea.select();
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('The browser rejected the clipboard operation.');
    }
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}
