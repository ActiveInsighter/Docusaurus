import {readFile, writeFile} from 'node:fs/promises';
import {compile} from '@mdx-js/mdx';
import remarkMath from 'remark-math';

const report = await readFile('mdx-validation.txt', 'utf8');
const entries = [...report.matchAll(/INVALID_MDX file=(.+?) line=.*?\n(.+?)(?=\nINVALID_MDX|\nMDX_VALIDATION|$)/gs)];
const output = [];

async function isValid(source) {
  try {
    await compile(source, {format: 'mdx', outputFormat: 'program', remarkPlugins: [remarkMath]});
    return true;
  } catch {
    return false;
  }
}

for (const match of entries) {
  const file = match[1];
  const reason = match[2].trim();
  if (!reason.includes('Expected a closing tag for `<details>`')) continue;
  const source = await readFile(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const openingMatch = reason.match(/\((\d+):\d+-/);
  const opening = openingMatch ? Number(openingMatch[1]) : null;
  output.push(`FILE ${file}`);
  output.push(`REPORTED_OPENING ${opening ?? 'unknown'}`);
  if (!opening) continue;

  let closing = -1;
  for (let index = opening; index < lines.length; index += 1) {
    if (lines[index].trim() === '</details>') {
      closing = index + 1;
      break;
    }
  }
  output.push(`CLOSING ${closing}`);
  if (closing < 0) continue;

  const block = lines.slice(opening - 1, closing).join('\n') + '\n';
  const blockValid = await isValid(block);
  output.push(`BLOCK_ALONE_VALID ${blockValid}`);

  if (!blockValid) {
    for (let end = opening + 1; end <= closing; end += 1) {
      let candidate = lines.slice(opening - 1, end).join('\n') + '\n';
      if (!candidate.includes('</details>')) candidate += '</details>\n';
      if (!(await isValid(candidate))) {
        output.push(`FIRST_FAILING_BLOCK_LINE ${end}`);
        output.push(`CONTENT ${lines[end - 1]}`);
        break;
      }
    }
  } else {
    const before = lines.slice(0, opening - 1).join('\n') + '\n';
    output.push(`PREFIX_BEFORE_VALID ${await isValid(before)}`);
    const windowStart = Math.max(1, opening - 12);
    for (let line = windowStart; line < opening; line += 1) {
      output.push(`PREV ${line}: ${lines[line - 1]}`);
    }
  }
}

await writeFile('mdx-details-diagnostic.txt', output.join('\n') + '\n');
console.log(output.join('\n'));
