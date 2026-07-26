import {promises as fs} from 'node:fs';

async function read(path) {
  return fs.readFile(path, 'utf8');
}

async function write(path, content) {
  await fs.writeFile(path, content, 'utf8');
}

function replaceOnce(content, search, replacement, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  return content.replace(search, replacement);
}

function replaceRegexOnce(content, pattern, replacement, label) {
  let count = 0;
  const result = content.replace(pattern, (...args) => {
    count += 1;
    return typeof replacement === 'function' ? replacement(...args) : replacement;
  });
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  return result;
}

let component = await read('src/components/Question/index.tsx');
component = replaceOnce(
  component,
  '  useLayoutEffect,\n',
  '',
  'remove useLayoutEffect import',
);
component = replaceRegexOnce(
  component,
  /function measureNaturalOptionWidth\(option: HTMLElement\): number \{[\s\S]*?\n\}\n\nexport function QuestionOptions\(\{[\s\S]*?\n\}\n\ntype QuestionOptionProps = \{/,
  `export function QuestionOptions({
  children,
  className,
  columns = 'auto',
  copyText,
}: QuestionOptionsProps): ReactNode {
  const optionCount = Children.toArray(children).filter(
    (child) =>
      isValidElement<QuestionOptionProps>(child) &&
      child.type === QuestionOption,
  ).length;
  const maximumColumns: 1 | 2 | 4 =
    columns === 'auto'
      ? optionCount >= 4
        ? 4
        : optionCount >= 2
          ? 2
          : 1
      : columns === 4 && optionCount < 4
        ? optionCount >= 2
          ? 2
          : 1
        : columns === 2 && optionCount < 2
          ? 1
          : columns;

  return (
    <div
      className={clsx(
        styles.options,
        maximumColumns === 2 && styles.optionsTwoColumns,
        maximumColumns === 4 && styles.optionsFourColumns,
        className,
      )}
      role="list"
      data-question-options
      data-question-options-columns={maximumColumns}
      data-question-copy-text={copyText}>
      {children}
    </div>
  );
}

type QuestionOptionProps = {`,
  'replace JavaScript option measurement',
);
component = replaceRegexOnce(
  component,
  /export function QuestionAnalysis\(\{[\s\S]*$/,
  `export function QuestionAnalysis({
  children,
  className,
  copyText,
}: QuestionContentProps): ReactNode {
  const {analysisContentId, analysisExpanded} = useQuestionContext(
    'QuestionAnalysis',
  );
  const [hasRenderedAnalysis, setHasRenderedAnalysis] = useState(
    analysisExpanded,
  );

  useEffect(() => {
    if (analysisExpanded) {
      setHasRenderedAnalysis(true);
    }
  }, [analysisExpanded]);

  const shouldRenderAnalysis = analysisExpanded || hasRenderedAnalysis;

  return (
    <section
      className={clsx(styles.analysis, className)}
      data-question-analysis
      data-expanded={analysisExpanded ? 'true' : 'false'}
      aria-label="详细解答"
      aria-hidden={!analysisExpanded}
      hidden={!analysisExpanded}
      inert={!analysisExpanded}>
      {shouldRenderAnalysis && (
        <div className={styles.analysisMotion}>
          <div className={styles.analysisPanel}>
            <div
              id={analysisContentId}
              className={styles.analysisContent}
              tabIndex={analysisExpanded ? 0 : -1}
              data-question-analysis-content
              data-question-copy-text={copyText}>
              {children}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
`,
  'replace analysis renderer',
);
await write('src/components/Question/index.tsx', component);

let styles = await read('src/components/Question/styles.module.css');
styles = replaceOnce(
  styles,
  "  color: var(--ifm-color-content);\n}\n\n:global([data-theme='dark']) .question {",
  "  color: var(--ifm-color-content);\n  content-visibility: auto;\n  contain-intrinsic-size: auto 22rem;\n}\n\n:global([data-theme='dark']) .question {",
  'add question rendering containment',
);
styles = replaceOnce(
  styles,
  `.optionsTwoColumns {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.optionsFourColumns {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
`,
  `.optionsTwoColumns,
.optionsFourColumns {
  grid-template-columns: minmax(0, 1fr);
}
`,
  'replace eager option columns',
);
styles = replaceOnce(
  styles,
  `.optionsFourColumns .option {
  padding-inline: 0.5rem;
}

`,
  '',
  'remove unconditional four-column padding',
);
styles = replaceRegexOnce(
  styles,
  /\.analysis \{[\s\S]*?\n\}\n\n\.analysisContent \{/,
  `.analysis {
  min-width: 0;
  margin-top: 0.62rem;
}

.analysis[hidden] {
  display: none;
}

.analysisMotion {
  min-height: 0;
}

.analysisPanel {
  overflow: hidden;
  border: 1px solid
    color-mix(in srgb, var(--question-accent) 10%, var(--question-border));
  border-left: 2px solid
    color-mix(in srgb, var(--question-accent) 36%, var(--question-border));
  border-radius: 6px;
  background: color-mix(
    in srgb,
    var(--md-surface-elevated) 58%,
    transparent
  );
  animation: question-analysis-enter 140ms cubic-bezier(0.2, 0.75, 0.2, 1);
}

@keyframes question-analysis-enter {
  from {
    opacity: 0;
    transform: translateY(-0.18rem);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.analysisContent {`,
  'replace layout-heavy analysis animation',
);
styles = replaceOnce(
  styles,
  '  scrollbar-gutter: stable;\n}\n\n.analysisContent:focus-visible {',
  '  scrollbar-gutter: stable;\n  contain: paint;\n}\n\n.analysisContent:focus-visible {',
  'contain analysis paint',
);
styles = replaceRegexOnce(
  styles,
  /@container question-body \(max-width: 32rem\) \{[\s\S]*?\n\}\n\n@container question-body \(max-width: 20rem\) \{[\s\S]*?\n\}/,
  `@container question-body (min-width: 30rem) {
  .optionsTwoColumns,
  .optionsFourColumns {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container question-body (min-width: 48rem) {
  .optionsFourColumns {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .optionsFourColumns .option {
    padding-inline: 0.5rem;
  }
}`,
  'replace option container query breakpoints',
);
styles = replaceOnce(
  styles,
  `@media (prefers-reduced-motion: reduce) {
  .iconButton,
  .analysis,
  .analysisPanel {
    transition: none;
  }
}
`,
  `@media (prefers-reduced-motion: reduce) {
  .iconButton {
    transition: none;
  }

  .analysisPanel {
    animation: none;
  }
}
`,
  'update reduced-motion handling',
);
await write('src/components/Question/styles.module.css', styles);

let globalStyles = await read('src/css/custom.css');
if (globalStyles.includes('Keep the desktop docs sidebar independent')) {
  throw new Error('desktop sidebar stability block already exists');
}
globalStyles = `${globalStyles.trimEnd()}

/* Keep the desktop docs sidebar independent from the document's bottom
 * boundary. The outer column still reserves layout width; only its viewport
 * is fixed, so reaching the footer cannot nudge the menu vertically. */
@media (min-width: 997px) {
  .theme-doc-sidebar-container {
    position: relative;
    min-width: var(--doc-sidebar-width, 300px);
    overflow-x: hidden;
  }

  .theme-doc-sidebar-container:not([class*='sidebarHidden'])
    > :first-child {
    position: fixed !important;
    inset: 0 auto 0 0;
    width: var(--doc-sidebar-width, 300px);
    height: 100dvh !important;
    max-height: 100dvh !important;
    overflow-x: hidden;
  }

  .theme-doc-sidebar-container:not([class*='sidebarHidden'])
    > :first-child
    .menu {
    height: 100%;
    max-height: 100dvh;
    padding-top: calc(var(--ifm-navbar-height) + 0.75rem);
    padding-bottom: 1rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
`;
await write('src/css/custom.css', globalStyles);

let packageJson = await read('package.json');
packageJson = replaceOnce(
  packageJson,
  '"check": "npm run typecheck && npm run test:workflow-runs && npm run build",',
  '"check": "npm run typecheck && npm run check:lzy && npm run check:question-performance && npm run test:workflow-runs && npm run build",',
  'extend project check command',
);
packageJson = replaceOnce(
  packageJson,
  '    "check:lzy": "node scripts/check-lizhengyuan-mdx.mjs",\n',
  '    "check:lzy": "node scripts/check-lizhengyuan-mdx.mjs",\n    "check:question-performance": "node scripts/check-question-performance.mjs",\n',
  'add performance guard script',
);
await write('package.json', packageJson);

await write(
  'scripts/check-question-performance.mjs',
  `import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFile(path.join(root, relativePath), 'utf8');
const [component, styles, globalStyles] = await Promise.all([
  read('src/components/Question/index.tsx'),
  read('src/components/Question/styles.module.css'),
  read('src/css/custom.css'),
]);

for (const [label, pattern] of [
  ['DOM cloning', 'cloneNode('],
  ['per-question ResizeObserver', 'new ResizeObserver'],
  ['synchronous layout effect', 'useLayoutEffect'],
  ['forced option geometry measurement', 'getBoundingClientRect().width'],
]) {
  if (component.includes(pattern)) {
    throw new Error(\`Question component still uses \${label}: \${pattern}\`);
  }
}

for (const required of [
  'hasRenderedAnalysis',
  'shouldRenderAnalysis',
  'data-question-options-columns={maximumColumns}',
]) {
  if (!component.includes(required)) {
    throw new Error(\`Question component performance guard missing: \${required}\`);
  }
}

if (!styles.includes('content-visibility: auto')) {
  throw new Error('Question cards do not use content-visibility');
}
if (!styles.includes('@container question-body (min-width: 48rem)')) {
  throw new Error('Question options are not driven by container queries');
}
if (styles.includes('grid-template-rows')) {
  throw new Error('Analysis still animates layout through grid-template-rows');
}
if (!globalStyles.includes('Keep the desktop docs sidebar independent')) {
  throw new Error('Stable desktop sidebar override is missing');
}

console.log('题目组件性能守卫通过：解析延迟挂载、CSS 分栏、无同步 DOM 测量、侧栏固定视口');
`,
);

let demo = await read('docs/question-components-demo.mdx');
demo = replaceOnce(
  demo,
  '为解析区设置视口相关的最大高度，仅在内容超过阈值时出现内部滚动；保留完整 DOM 内容，并让滚动区域可以通过键盘获得焦点。',
  '解析内容在第一次展开时才挂载，之后保持缓存；解析区使用视口相关的最大高度，仅在内容超过阈值时出现内部滚动，并允许键盘聚焦。',
  'update long analysis behavior documentation',
);
demo = replaceOnce(
  demo,
  '- `QuestionAnalysis`：内容超过 `min(30rem, 68vh)` 后在解析区内部滚动；可通过 `--question-analysis-max-height` 覆盖阈值。',
  '- `QuestionAnalysis`：首次展开时才挂载解析 DOM，后续展开复用已挂载内容；内容超过 `min(30rem, 68vh)` 后在解析区内部滚动，可通过 `--question-analysis-max-height` 覆盖阈值。',
  'update QuestionAnalysis API documentation',
);
await write('docs/question-components-demo.mdx', demo);

let ci = await read('.github/workflows/ci.yaml');
ci = replaceOnce(
  ci,
  `      - name: Test workflow run index
        run: npm run test:workflow-runs

      - name: Build site
`,
  `      - name: Test workflow run index
        run: npm run test:workflow-runs

      - name: Validate Li Zhengyuan question bank
        run: npm run check:lzy

      - name: Check question performance guards
        run: npm run check:question-performance

      - name: Build site
`,
  'extend CI checks',
);
await write('.github/workflows/ci.yaml', ci);

let visual = await read('.github/workflows/navbar-visual.yml');
const navbarPath = '      - "src/theme/Navbar/**"\n';
const navbarPathCount = visual.split(navbarPath).length - 1;
if (navbarPathCount !== 2) {
  throw new Error(`visual workflow navbar path count changed: ${navbarPathCount}`);
}
visual = visual.replaceAll(
  navbarPath,
  `${navbarPath}      - "src/components/Question/**"\n      - "docs/李正元练习题/**"\n`,
);
const docsearchPath = '      - "Py/check_docsearch_visual.py"\n';
const docsearchPathCount = visual.split(docsearchPath).length - 1;
if (docsearchPathCount !== 2) {
  throw new Error(`visual workflow test path count changed: ${docsearchPathCount}`);
}
visual = visual.replaceAll(
  docsearchPath,
  `${docsearchPath}      - "Py/check_question_performance.py"\n`,
);
visual = replaceOnce(
  visual,
  `      - name: Capture and assert DocSearch UI
        run: >-
          python Py/check_docsearch_visual.py
          --base-url http://127.0.0.1:3000
          --output-dir artifacts/docs-ui-visual

      - name: Upload screenshots and metrics
`,
  `      - name: Capture and assert DocSearch UI
        run: >-
          python Py/check_docsearch_visual.py
          --base-url http://127.0.0.1:3000
          --output-dir artifacts/docs-ui-visual

      - name: Check real question-page rendering performance
        run: >-
          python Py/check_question_performance.py
          --base-url http://127.0.0.1:3000
          --output-dir artifacts/docs-ui-visual

      - name: Upload screenshots and metrics
`,
  'add browser question performance check',
);
await write('.github/workflows/navbar-visual.yml', visual);

let navbarTest = await read('Py/check_navbar_visual.py');
navbarTest = replaceOnce(
  navbarTest,
  '\n\ndef capture_theme(page: Page, output_dir: Path, theme: str) -> dict[str, Any]:',
  `

def verify_sidebar_bottom_stability(page: Page, theme: str) -> dict[str, Any]:
    before = read_ui_state(page)
    page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    page.wait_for_timeout(450)
    after = read_ui_state(page)

    for key in ("top", "bottom", "height"):
        assert abs(
            float(before["sidebarViewport"][key])
            - float(after["sidebarViewport"][key])
        ) <= 0.5, f"{theme}: sidebar viewport moved at document bottom ({key})"

    page.evaluate("window.scrollTo(0, 620)")
    page.wait_for_timeout(300)
    return {"before": before["sidebarViewport"], "after": after["sidebarViewport"]}


def capture_theme(page: Page, output_dir: Path, theme: str) -> dict[str, Any]:`,
  'add sidebar bottom stability test',
);
navbarTest = replaceOnce(
  navbarTest,
  '    page.mouse.move(900, 650)\n\n    result = {"state": state, "hover": hover}\n',
  '    page.mouse.move(900, 650)\n    sidebar_bottom = verify_sidebar_bottom_stability(page, theme)\n\n    result = {"state": state, "hover": hover, "sidebarBottom": sidebar_bottom}\n',
  'run sidebar bottom stability test',
);
await write('Py/check_navbar_visual.py', navbarTest);

await write(
  'Py/check_question_performance.py',
  `import argparse
import json
import statistics
from pathlib import Path
from time import perf_counter
from urllib.parse import quote

from playwright.sync_api import sync_playwright

DOC_PATH = "/docs/" + quote(
    "李正元练习题/高等数学/01-第一章-函数极限与连续"
) + "/"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify lazy question analysis rendering on a real long chapter."
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--output-dir", default="artifacts/docs-ui-visual")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(
            viewport={"width": 1600, "height": 1000},
            device_scale_factor=1,
        )
        page.goto(
            f"{args.base_url.rstrip('/')}{DOC_PATH}",
            wait_until="networkidle",
        )
        page.wait_for_selector("[data-question]")

        questions = page.locator("[data-question]")
        triggers = page.locator("[data-question-analysis-trigger]")
        question_count = questions.count()
        trigger_count = triggers.count()
        initial_analysis_nodes = page.locator(
            "[data-question-analysis-content]"
        ).count()

        assert question_count >= 10, (
            f"real chapter contains too few rendered questions: {question_count}"
        )
        assert trigger_count >= 10, (
            f"real chapter contains too few analysis triggers: {trigger_count}"
        )
        assert initial_analysis_nodes == 0, (
            "collapsed analyses were mounted during initial page render: "
            f"{initial_analysis_nodes}"
        )

        sample_count = min(10, trigger_count)
        durations_ms: list[float] = []
        for index in range(sample_count):
            trigger = triggers.nth(index)
            started = perf_counter()
            trigger.click()
            page.wait_for_function(
                "element => element.getAttribute('aria-expanded') === 'true'",
                arg=trigger.element_handle(),
            )
            page.evaluate(
                "() => new Promise(resolve => requestAnimationFrame(() => "
                "requestAnimationFrame(resolve)))"
            )
            durations_ms.append((perf_counter() - started) * 1000)

        mounted_after_open = page.locator(
            "[data-question-analysis-content]"
        ).count()
        assert mounted_after_open == sample_count, (
            "analysis lazy-mount count mismatch: "
            f"expected {sample_count}, got {mounted_after_open}"
        )

        median_ms = statistics.median(durations_ms)
        maximum_ms = max(durations_ms)
        assert median_ms < 500, (
            f"median analysis expansion is too slow: {median_ms:.1f} ms"
        )
        assert maximum_ms < 2000, (
            f"single analysis expansion stalled too long: {maximum_ms:.1f} ms"
        )

        metrics = {
            "url": page.url,
            "questionCount": question_count,
            "analysisTriggerCount": trigger_count,
            "initialAnalysisContentNodes": initial_analysis_nodes,
            "mountedAfterOpen": mounted_after_open,
            "sampleCount": sample_count,
            "durationsMs": [round(value, 2) for value in durations_ms],
            "medianMs": round(median_ms, 2),
            "maximumMs": round(maximum_ms, 2),
        }
        (output_dir / "question-performance.json").write_text(
            json.dumps(metrics, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        page.screenshot(
            path=str(output_dir / "question-performance.png"),
            full_page=False,
        )
        browser.close()


if __name__ == "__main__":
    main()
`,
);

console.log('Applied question rendering, sidebar stability, and regression-test updates.');
