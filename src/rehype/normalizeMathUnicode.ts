type HastNode = {
  type?: string;
  value?: string;
  properties?: {
    className?: unknown;
  };
  children?: HastNode[];
};

type VFileLike = {
  path?: string;
  history?: string[];
};

const ROMAN_NUMERAL_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['Ⅲ', 'III'],
  ['Ⅱ', 'II'],
  ['Ⅰ', 'I'],
];

function normalizeValue(value: string): string {
  return ROMAN_NUMERAL_REPLACEMENTS.reduce(
    (result, [unicodeNumeral, asciiNumeral]) =>
      result.replaceAll(unicodeNumeral, asciiNumeral),
    value,
  );
}

function classNames(node: HastNode): string[] {
  const value = node.properties?.className;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(/\s+/u);
  return [];
}

function isMathElement(node: HastNode): boolean {
  const names = classNames(node);
  return names.some((name) =>
    ['language-math', 'math-inline', 'math-display'].includes(name),
  );
}

function textNodes(node: HastNode): HastNode[] {
  const result: HastNode[] = [];

  function collect(current: HastNode): void {
    if (current.type === 'text' && typeof current.value === 'string') {
      result.push(current);
    }
    current.children?.forEach(collect);
  }

  collect(node);
  return result;
}

function countDeclaredColumns(specification: string): number {
  return [...specification].filter((character) =>
    ['l', 'c', 'r'].includes(character),
  ).length;
}

function reportArrayColumnMismatch(value: string, file: VFileLike): void {
  const arrayPattern = /\\begin\{array\}\{([^}]*)\}([\s\S]*?)\\end\{array\}/gu;
  let match: RegExpExecArray | null;

  while ((match = arrayPattern.exec(value)) !== null) {
    const [, specification, body] = match;
    const declaredColumns = countDeclaredColumns(specification);
    if (declaredColumns === 0) continue;

    const rowColumnCounts = body
      .split(/\\\\/u)
      .map((row) => row.split(/(?<!\\)&/u).length)
      .filter((count) => count > 0);
    const largestRow = Math.max(...rowColumnCounts, 0);

    if (largestRow <= declaredColumns) continue;

    const filePath = file.path || file.history?.at(-1) || 'unknown file';
    const preview = match[0].replace(/\s+/gu, ' ').slice(0, 180);
    console.warn(
      `[math-array] ${filePath}: declared ${declaredColumns} column(s), ` +
        `but a row uses ${largestRow}: ${preview}`,
    );
  }
}

function visit(node: HastNode, file: VFileLike): void {
  if (isMathElement(node)) {
    const nodes = textNodes(node);
    const originalValue = nodes.map((textNode) => textNode.value || '').join('');

    nodes.forEach((textNode) => {
      if (typeof textNode.value === 'string') {
        textNode.value = normalizeValue(textNode.value);
      }
    });

    reportArrayColumnMismatch(normalizeValue(originalValue), file);
    return;
  }

  node.children?.forEach((child) => visit(child, file));
}

/** Normalize KaTeX input after Markdown has been converted to HAST. */
export default function normalizeMathUnicode() {
  return (tree: HastNode, file: VFileLike): void => visit(tree, file);
}
