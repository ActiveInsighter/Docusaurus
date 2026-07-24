type MarkdownNode = {
  type?: string;
  value?: string;
  children?: MarkdownNode[];
};

const ROMAN_NUMERAL_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ['Ⅲ', 'III'],
  ['Ⅱ', 'II'],
  ['Ⅰ', 'I'],
];

function normalizeMathValue(value: string): string {
  return ROMAN_NUMERAL_REPLACEMENTS.reduce(
    (result, [unicodeNumeral, asciiNumeral]) =>
      result.replaceAll(unicodeNumeral, asciiNumeral),
    value,
  );
}

function visit(node: MarkdownNode): void {
  if (
    (node.type === 'math' || node.type === 'inlineMath') &&
    typeof node.value === 'string'
  ) {
    node.value = normalizeMathValue(node.value);
  }

  node.children?.forEach(visit);
}

/**
 * Normalize Unicode Roman numerals only inside Markdown math nodes.
 *
 * KaTeX does not provide metrics for characters such as Ⅰ/Ⅱ/Ⅲ in math mode,
 * while their ASCII equivalents render consistently in both normal formulas
 * and \text{...} sections.
 */
export default function normalizeMathUnicode() {
  return (tree: MarkdownNode): void => visit(tree);
}
