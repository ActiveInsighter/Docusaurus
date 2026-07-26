const inlineRowWidth = 104;
const separator = ' &emsp;&emsp; ';

function displayWidth(value) {
  const normalized = value
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\\displaystyle\b/g, '')
    .replace(/\\(?:left|right|text|mathrm|mathbf|boldsymbol)\b/g, '')
    .replace(/[${}\\]/g, '');

  return [...normalized].reduce(
    (width, character) =>
      width + (character.codePointAt(0) > 0xff ? 2 : 1),
    0,
  );
}

function canRenderInline(option) {
  return (
    option.lines.length === 1 &&
    !/^(?:```|\$\$|!\[|\|)/u.test(option.lines[0].trim())
  );
}

function rowWidth(options) {
  return (
    options.reduce((width, option) => width + displayWidth(option.lines[0]), 0) +
    Math.max(0, options.length - 1) * 4
  );
}

export function formatChoiceOptionRows(options) {
  if (options.length === 0) return [];

  if (!options.every(canRenderInline)) {
    return options.flatMap((option, index) => [
      ...option.lines,
      ...(index < options.length - 1 ? [''] : []),
    ]);
  }

  let optionsPerRow = 1;
  if (rowWidth(options) <= inlineRowWidth) {
    optionsPerRow = options.length;
  } else {
    const pairRows = [];
    for (let index = 0; index < options.length; index += 2) {
      pairRows.push(options.slice(index, index + 2));
    }
    if (pairRows.every((row) => rowWidth(row) <= inlineRowWidth)) {
      optionsPerRow = 2;
    }
  }

  const rows = [];
  for (let index = 0; index < options.length; index += optionsPerRow) {
    rows.push(
      options
        .slice(index, index + optionsPerRow)
        .map((option) => option.lines[0])
        .join(separator),
    );
  }
  return rows;
}
