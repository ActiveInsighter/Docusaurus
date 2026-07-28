import {readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {compile} from '@mdx-js/mdx';
import remarkMath from 'remark-math';

const root = path.resolve('docs/数学真题');
const reportPath = path.resolve('mdx-validation.txt');

async function walk(dir) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.mdx')) files.push(full);
  }
  return files;
}

function stripFrontmatter(source) {
  if (!source.startsWith('---\n')) return source;
  const end = source.indexOf('\n---\n', 4);
  if (end === -1) return source;
  const removed = source.slice(0, end + 5);
  const linePadding = '\n'.repeat((removed.match(/\n/g) ?? []).length);
  return linePadding + source.slice(end + 5);
}

const files = (await walk(root)).sort();
const report = [];
let failures = 0;

for (const file of files) {
  const source = stripFrontmatter(await readFile(file, 'utf8'));
  try {
    await compile(source, {
      format: 'mdx',
      outputFormat: 'program',
      remarkPlugins: [remarkMath],
    });
  } catch (error) {
    failures += 1;
    const relative = path.relative(process.cwd(), file);
    const line = error?.line ?? error?.position?.start?.line ?? 'unknown';
    const column = error?.column ?? error?.position?.start?.column ?? 'unknown';
    const reason = error?.reason ?? error?.message ?? String(error);
    report.push(`INVALID_MDX file=${relative} line=${line} column=${column}`);
    report.push(reason);
  }
}

report.push(`MDX_VALIDATION files=${files.length} failures=${failures}`);
await writeFile(reportPath, `${report.join('\n')}\n`, 'utf8');
console.log(report.join('\n'));
if (failures > 0) process.exitCode = 1;
