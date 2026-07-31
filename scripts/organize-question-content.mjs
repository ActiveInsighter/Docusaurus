import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const source408 = process.argv[2] ?? 'D:/考研/KaoYan/408-真题/img';
const sourceMath =
  process.argv[3] ?? 'D:/考研/KaoYan/math/真题/0000/高数真题图片';

const docs408 = path.join(projectRoot, 'docs', '408真题');
const docsMath = path.join(projectRoot, 'docs', '数学真题');
const target408 = path.join(projectRoot, 'static', 'img', 'questions', '408');
const targetMath = path.join(projectRoot, 'static', 'img', 'questions', 'math');

function walk(directory) {
  return fs.readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function replaceFile(file, transform) {
  const current = fs.readFileSync(file, 'utf8');
  const next = transform(current);
  if (next !== current) {
    fs.writeFileSync(file, next, 'utf8');
  }
}

function imageName408(originalName) {
  return originalName
    .replace(/^操作系统_/, 'operating-system-')
    .replace(/^计网_计算机网络-/, 'computer-network-')
    .replace(/^计组_/, 'computer-organization-')
    .replace(/^数据结构_/, 'data-structure-')
    .replace(/[-_]第(\d+)题/g, '-q$1')
    .replace(/_img(\d+)/g, '-$1')
    .replace(/_/g, '-')
    .replace(/IP/g, 'ip')
    .replace(/TCP/g, 'tcp')
    .replace(/CLOCK/g, 'clock')
    .replace(/以太网与ip结构/g, 'ethernet-ip-header')
    .replace(/ip分组头结构/g, 'ip-header')
    .replace(/tcp段结构/g, 'tcp-segment');
}

function imageNameMath(originalName) {
  return originalName
    .replace(/^gs_up_/, 'calculus-upper-')
    .replace(/^gs_down_/, 'calculus-lower-')
    .replace(/_/g, '-');
}

function collectReferencedBasenames(directory) {
  const names = new Set();
  const imagePattern =
    /(?:!\[[^\]]*\]\(([^)]+\.(?:png|jpe?g|svg|webp))\)|<img[^>]+src=["']([^"']+\.(?:png|jpe?g|svg|webp))["'][^>]*>)/gi;

  for (const file of walk(directory).filter((file) => /\.mdx?$/.test(file))) {
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(imagePattern)) {
      names.add(path.basename(match[1] ?? match[2]));
    }
  }
  return names;
}

function importImages({docsDirectory, sourceDirectory, targetDirectory, webRoot, rename}) {
  if (!fs.existsSync(sourceDirectory)) {
    throw new Error(`图片源目录不存在：${sourceDirectory}`);
  }

  const referenced = collectReferencedBasenames(docsDirectory);
  const sourceFiles = walk(sourceDirectory);
  const sourceByName = new Map();
  for (const file of sourceFiles) {
    const originalName = path.basename(file);
    sourceByName.set(originalName, file);
    sourceByName.set(rename(originalName), file);
    // 兼容第一版脚本生成的“computer-network-...-第N题”名称。
    sourceByName.set(
      originalName
        .replace(/^计网_计算机网络-/, 'computer-network-')
        .replace(/_/g, '-')
        .replace(/IP/g, 'ip')
        .replace(/TCP/g, 'tcp')
        .replace(/以太网与ip结构/g, 'ethernet-ip-header')
        .replace(/ip分组头结构/g, 'ip-header')
        .replace(/tcp段结构/g, 'tcp-segment'),
      file,
    );
  }
  const missing = [...referenced].filter((name) => !sourceByName.has(name));
  if (missing.length > 0) {
    throw new Error(`找不到 ${missing.length} 张引用图片：\n${missing.join('\n')}`);
  }

  fs.rmSync(targetDirectory, {recursive: true, force: true});
  fs.mkdirSync(targetDirectory, {recursive: true});
  const replacements = new Map();
  for (const referencedName of referenced) {
    const sourceFile = sourceByName.get(referencedName);
    const normalizedName = rename(path.basename(sourceFile));
    const targetFile = path.join(targetDirectory, normalizedName);
    fs.copyFileSync(sourceFile, targetFile);
    if (path.extname(targetFile).toLowerCase() === '.svg') {
      const svg = fs.readFileSync(targetFile, 'utf8');
      fs.writeFileSync(targetFile, `${svg.trimEnd()}\n`, 'utf8');
    }
    replacements.set(referencedName, `${webRoot}/${normalizedName}`);
  }

  for (const file of walk(docsDirectory).filter((file) => /\.mdx?$/.test(file))) {
    replaceFile(file, (content) => {
      let next = content;
      for (const [originalName, targetPath] of replacements) {
        next = next.replaceAll(
          new RegExp(`(?:[^()"'\\s]+/)*${escapeRegExp(originalName)}`, 'g'),
          targetPath,
        );
      }
      return next;
    });
  }

  return referenced.size;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize408Documents() {
  let renamed = 0;
  for (const file of walk(docs408).filter(
    (file) => file.endsWith('.md') && path.basename(file) !== '修订说明.md',
  )) {
    replaceFile(file, (content) => {
      const headingMatch = content.match(
        /^# 408 真题做题本·[^\r\n]+\r?\n\r?\n## ([^\r\n]+)\r?\n/,
      );
      if (!headingMatch) return content;

      const chapterTitle = headingMatch[1];
      const body = content.slice(headingMatch[0].length).replace(
        /^(#{3,6})(?= )/gm,
        (heading) => heading.slice(1),
      );
      return `# ${chapterTitle}\n\n${body}`;
    });

    const basename = path.basename(file);
    const compactName = basename.replace(/^(\d+)-第\d+章-/, '$1-');
    if (compactName !== basename) {
      fs.renameSync(file, path.join(path.dirname(file), compactName));
      renamed += 1;
    }
  }
  return renamed;
}

function normalizeMathTitles() {
  let changed = 0;
  for (const file of walk(docsMath).filter((file) => file.endsWith('.mdx'))) {
    const current = fs.readFileSync(file, 'utf8');
    const titleMatch = current.match(/^title:\s*"([^"]+｜[^"]+)"\r?$/m);
    if (!titleMatch) continue;

    const compactTitle = titleMatch[1].split('｜').at(-1).trim();
    const next = current
      .replace(titleMatch[0], `title: "${compactTitle}"`)
      .replace(/^# [^\r\n]+｜([^\r\n]+)$/m, '# $1');
    if (next !== current) {
      fs.writeFileSync(file, next, 'utf8');
      changed += 1;
    }
  }
  return changed;
}

const imported408 = importImages({
  docsDirectory: docs408,
  sourceDirectory: source408,
  targetDirectory: target408,
  webRoot: '/img/questions/408',
  rename: imageName408,
});
const importedMath = importImages({
  docsDirectory: docsMath,
  sourceDirectory: sourceMath,
  targetDirectory: targetMath,
  webRoot: '/img/questions/math',
  rename: imageNameMath,
});
const renamed408 = normalize408Documents();
const normalizedMath = normalizeMathTitles();

console.log(
  `已导入 408 图片 ${imported408} 张、数学图片 ${importedMath} 张；` +
    `重命名 408 文档 ${renamed408} 篇，精简数学标题 ${normalizedMath} 篇。`,
);
