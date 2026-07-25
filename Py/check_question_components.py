from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from playwright.sync_api import Locator, Page, sync_playwright

DOC_PATH = "/docs/question-components-demo/"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Verify Question answer controls, independent analyses, Markdown "
            "copying, accessibility, dark mode, and responsive layout."
        )
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--output-dir", default="artifacts/docs-ui-visual")
    return parser.parse_args()


def question(page: Page, index: int) -> Locator:
    return page.locator("[data-question]").nth(index)


def answer_state(item: Locator) -> str | None:
    return item.get_attribute("data-question-answer-visible")


def read_clipboard(page: Page) -> str:
    value = page.evaluate("navigator.clipboard.readText()")
    assert isinstance(value, str)
    return value


def copy_from_question(page: Page, item: Locator) -> str:
    marker = "__question_copy_pending__"
    page.evaluate(
        "value => navigator.clipboard.writeText(value)",
        marker,
    )
    trigger = item.locator("[data-question-copy-trigger]")
    trigger.click()
    page.wait_for_function(
        """
        marker => navigator.clipboard.readText().then(
          value => value !== marker
        )
        """,
        arg=marker,
    )
    return read_clipboard(page)


def assert_hover_stability(page: Page, item: Locator) -> dict[str, Any]:
    button = item.locator("[data-question-answer-trigger]")

    def read() -> dict[str, Any]:
        return button.evaluate(
            """
            element => {
              const rect = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                fontWeight: style.fontWeight,
                borderWidth: style.borderWidth,
              };
            }
            """
        )

    before = read()
    button.hover()
    page.wait_for_timeout(180)
    after = read()

    for key in ("left", "right", "top", "bottom", "width", "height"):
        assert abs(float(before[key]) - float(after[key])) <= 0.25, (
            f"answer button geometry changed on hover: {key}"
        )
    assert before["fontWeight"] == after["fontWeight"]
    assert before["borderWidth"] == after["borderWidth"]
    return {"before": before, "after": after}


def verify_initial_state(page: Page) -> None:
    questions = page.locator("[data-question]")
    assert questions.count() == 6

    for index in range(questions.count()):
        item = questions.nth(index)
        assert answer_state(item) == "false"
        answer_trigger = item.locator("[data-question-answer-trigger]")
        assert answer_trigger.get_attribute("aria-pressed") == "false"
        assert answer_trigger.get_attribute("aria-label") == "显示答案"
        assert answer_trigger.inner_text().strip() == ""
        analysis_trigger = item.locator("[data-question-analysis-trigger]")
        assert analysis_trigger.get_attribute("aria-expanded") == "false"
        assert analysis_trigger.inner_text().strip() == ""
        assert (
            item.locator("[data-question-analysis]").get_attribute(
                "aria-hidden"
            )
            == "true"
        )
        assert item.get_by_role("menu").count() == 0
        assert item.get_by_role("menuitem").count() == 0

    assert (
        question(page, 0)
        .locator(
            "[data-question-correct='true']"
            "[data-question-correct-visible='true']"
        )
        .count()
        == 0
    )
    assert (
        question(page, 1)
        .locator("[data-question-blank-answer]")
        .get_attribute("aria-hidden")
        == "true"
    )
    assert question(page, 3).locator("[data-question-answer]").is_hidden()
    assert question(page, 5).locator("[data-question-answer]").is_hidden()

    first_options = question(page, 0).locator("[data-question-option]")
    assert first_options.count() == 4
    assert all(
        first_options.nth(index).get_attribute("data-option-label") is None
        for index in range(first_options.count())
    )
    assert [
        first_options.nth(index).inner_text().strip()[0]
        for index in range(first_options.count())
    ] == ["A", "B", "C", "D"]

    first = question(page, 0)
    assert first.locator("[data-question-meta]").count() == 7
    assert first.locator("[data-question-meta='type']").inner_text() == "单选题"
    assert (
        first.locator("[data-question-meta='source']").inner_text()
        == "示例题库"
    )
    assert first.locator("[data-question-meta='year']").inner_text() == "2026 年"
    assert first.locator("[data-question-meta='score']").inner_text() == "5 分"
    assert (
        first.locator("[data-question-meta='difficulty']").inner_text()
        == "基础"
    )
    assert "第 1 题" not in first.locator("header").inner_text()


def verify_answer_and_analysis_controls(page: Page) -> dict[str, Any]:
    first = question(page, 0)
    correct_option = first.locator("[data-question-correct='true']")
    correct_style_before = correct_option.evaluate(
        """
        element => {
          const style = getComputedStyle(element);
          return {
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
          };
        }
        """
    )
    first.locator("[data-question-answer-trigger]").click()
    correct_style_after = correct_option.evaluate(
        """
        element => {
          const style = getComputedStyle(element);
          return {
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
          };
        }
        """
    )
    assert correct_style_after != correct_style_before
    assert answer_state(first) == "true"
    assert answer_state(question(page, 1)) == "false"
    assert (
        first.locator(
            "[data-question-correct='true']"
            "[data-question-correct-visible='true']"
        ).count()
        == 1
    )

    first_analysis = first.locator("[data-question-analysis-trigger]")
    analysis_region = first.locator("[data-question-analysis]")
    collapsed_height = analysis_region.evaluate(
        "element => element.getBoundingClientRect().height"
    )
    transition = analysis_region.evaluate(
        "element => getComputedStyle(element).transitionDuration"
    )
    assert transition != "0s"
    first_analysis.click()
    assert first_analysis.get_attribute("aria-expanded") == "true"
    assert analysis_region.get_attribute("aria-hidden") == "false"
    page.wait_for_timeout(260)
    expanded_height = analysis_region.evaluate(
        "element => element.getBoundingClientRect().height"
    )
    assert float(expanded_height) > float(collapsed_height) + 20

    global_toggle = page.locator(
        ".navbar [data-question-global-answer-toggle]:visible"
    )
    assert global_toggle.count() == 1
    assert global_toggle.get_attribute("aria-label") == "显示全部答案"
    global_toggle.click()

    total_questions = page.locator("[data-question]").count()
    for index in range(total_questions):
        assert answer_state(question(page, index)) == "true"
    assert first_analysis.get_attribute("aria-expanded") == "true"
    for index in range(1, total_questions):
        assert (
            question(page, index)
            .locator("[data-question-analysis-trigger]")
            .get_attribute("aria-expanded")
            == "false"
        )

    assert global_toggle.get_attribute("aria-label") == "隐藏全部答案"
    global_toggle.click()
    for index in range(total_questions):
        assert answer_state(question(page, index)) == "false"
    assert first_analysis.get_attribute("aria-expanded") == "true"

    analysis_stayed_expanded = (
        first_analysis.get_attribute("aria-expanded") == "true"
    )

    fill = question(page, 1)
    fill.locator("[data-question-answer-trigger]").click()
    assert (
        fill.locator("[data-question-blank-answer]").get_attribute("aria-hidden")
        == "false"
    )
    fill.locator("[data-question-answer-trigger]").click()

    judge = question(page, 2)
    judge.locator("[data-question-answer-trigger]").click()
    assert (
        judge.locator("[data-question-blank-answer]").get_attribute("aria-hidden")
        == "false"
    )
    assert "正确" in judge.locator("[data-question-blank-answer]").inner_text()
    judge.locator("[data-question-answer-trigger]").click()

    subjective = question(page, 3)
    subjective.locator("[data-question-answer-trigger]").click()
    assert subjective.locator("[data-question-answer]").is_visible()
    subjective.locator("[data-question-answer-trigger]").click()

    multiple = question(page, 4)
    multiple.locator("[data-question-answer-trigger]").click()
    visible_correct_options = multiple.locator(
        "[data-question-correct-visible='true']"
    )
    multiple_correct_count = visible_correct_options.count()
    assert multiple_correct_count == 2
    assert {
        visible_correct_options.nth(index).inner_text().strip()[0]
        for index in range(visible_correct_options.count())
    } == {"A", "C"}
    multiple.locator("[data-question-answer-trigger]").click()

    return {
        "allHiddenAfterGlobalReset": all(
            answer_state(question(page, index)) == "false"
            for index in range(total_questions)
        ),
        "analysisStayedExpanded": analysis_stayed_expanded,
        "analysisExpandedHeight": expanded_height,
        "correctOptionStyleBefore": correct_style_before,
        "correctOptionStyleAfter": correct_style_after,
        "multipleCorrectCount": multiple_correct_count,
    }


def verify_long_analysis_scroll(page: Page) -> dict[str, Any]:
    item = question(page, 5)
    trigger = item.locator("[data-question-analysis-trigger]")
    content = item.locator("[data-question-analysis-content]")

    trigger.click()
    page.wait_for_timeout(260)
    metrics = content.evaluate(
        """
        element => {
          const style = getComputedStyle(element);
          return {
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            overflowY: style.overflowY,
            tabIndex: element.tabIndex,
          };
        }
        """
    )
    assert float(metrics["scrollHeight"]) > float(metrics["clientHeight"]) + 20
    assert metrics["overflowY"] in ("auto", "scroll")
    assert int(metrics["tabIndex"]) == 0

    content.focus()
    content.evaluate("element => { element.scrollTop = element.scrollHeight; }")
    scroll_top = content.evaluate("element => element.scrollTop")
    assert float(scroll_top) > 0

    trigger.click()
    assert trigger.get_attribute("aria-expanded") == "false"
    assert content.get_attribute("tabindex") == "-1"
    return {**metrics, "scrollTopAtEnd": scroll_top}


def verify_official_sidebar_collapse(page: Page) -> dict[str, Any]:
    sidebar = page.locator(".theme-doc-sidebar-container")
    collapse = sidebar.locator(
        "button[class*='collapseSidebarButton']"
    )
    assert collapse.count() == 1
    width_before = sidebar.evaluate(
        "element => element.getBoundingClientRect().width"
    )

    collapse.click()
    page.wait_for_timeout(220)
    width_collapsed = sidebar.evaluate(
        "element => element.getBoundingClientRect().width"
    )
    assert float(width_collapsed) < float(width_before) / 2

    expand = sidebar.locator("[role='button'][class*='expandButton']")
    expand.wait_for(state="visible")
    expand.click()
    page.wait_for_timeout(220)
    width_restored = sidebar.evaluate(
        "element => element.getBoundingClientRect().width"
    )
    assert abs(float(width_restored) - float(width_before)) <= 2
    return {
        "widthBefore": width_before,
        "widthCollapsed": width_collapsed,
        "widthRestored": width_restored,
    }


def verify_sidebar_bottom_stability(page: Page) -> dict[str, Any]:
    viewport = page.locator(
        ".theme-doc-sidebar-container > div"
    ).first

    def read_box() -> dict[str, Any]:
        return viewport.evaluate(
            """
            element => {
              const rect = element.getBoundingClientRect();
              return {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                overscrollBehaviorY:
                  getComputedStyle(
                    element.querySelector('.menu') ?? element
                  ).overscrollBehaviorY,
              };
            }
            """
        )

    max_scroll = page.evaluate(
        "document.documentElement.scrollHeight - window.innerHeight"
    )
    page.evaluate(
        "value => window.scrollTo(0, Math.max(0, value - 2))",
        max_scroll,
    )
    page.wait_for_timeout(120)
    near_bottom = read_box()

    page.evaluate("value => window.scrollTo(0, value)", max_scroll)
    page.wait_for_timeout(120)
    at_bottom = read_box()

    for key in ("left", "width"):
        assert abs(float(near_bottom[key]) - float(at_bottom[key])) <= 0.5
    assert abs(float(near_bottom["top"]) - float(at_bottom["top"])) <= 2.0
    assert at_bottom["overscrollBehaviorY"] == "contain"
    page.evaluate("window.scrollTo(0, 0)")
    return {"nearBottom": near_bottom, "atBottom": at_bottom}


def verify_copying(page: Page) -> dict[str, Any]:
    first = question(page, 0)
    copy_trigger = first.locator("[data-question-copy-trigger]")
    assert copy_trigger.evaluate("element => element.tagName") == "BUTTON"
    assert copy_trigger.get_attribute("aria-haspopup") is None
    assert copy_trigger.get_attribute("aria-expanded") is None
    assert copy_trigger.get_attribute("aria-label") == "复制当前可见内容"
    assert copy_trigger.inner_text().strip() == ""

    first_analysis = first.locator("[data-question-analysis-trigger]")
    if first_analysis.get_attribute("aria-expanded") == "true":
        first_analysis.click()
    if answer_state(first) == "true":
        first.locator("[data-question-answer-trigger]").click()

    question_markdown = copy_from_question(page, first)
    assert "## 题目" in question_markdown
    assert "来源：示例题库" in question_markdown
    assert "**1.**" in question_markdown
    assert "$f(x)=x^2-2x+3$" in question_markdown
    assert "- A. $x=-1$" in question_markdown
    assert "- C. $x=1$" in question_markdown
    assert "### 答案" not in question_markdown
    assert "### 解析" not in question_markdown
    assert "f'(x)=2x-2" not in question_markdown
    assert "katex" not in question_markdown.lower()
    assert "<math" not in question_markdown.lower()

    global_toggle = page.locator(
        ".navbar [data-question-global-answer-toggle]:visible"
    )
    global_toggle.click()
    answer_markdown = copy_from_question(page, first)
    assert "### 答案" in answer_markdown
    assert re.search(r"### 答案\s+C\.\s*\$x=1\$", answer_markdown)
    assert "### 解析" not in answer_markdown
    global_toggle.click()

    first_analysis.click()
    analysis_markdown = copy_from_question(page, first)
    assert "### 答案" not in analysis_markdown
    assert "### 解析" in analysis_markdown
    assert "令 $f'(x)=0$" in analysis_markdown

    first.locator("[data-question-answer-trigger]").click()
    complete_markdown = copy_from_question(page, first)
    assert "### 答案" in complete_markdown
    assert "### 解析" in complete_markdown
    assert complete_markdown.index("### 答案") < complete_markdown.index(
        "### 解析"
    )
    first.locator("[data-question-answer-trigger]").click()
    first_analysis.click()

    fill = question(page, 1)
    fill.locator("[data-question-answer-trigger]").click()
    fill.locator("[data-question-analysis-trigger]").click()
    fill_solution = copy_from_question(page, fill)
    assert "### 答案" in fill_solution
    assert "$\\frac{1}{2}$" in fill_solution, (
        "fill answer LaTeX was not restored:\n" + fill_solution
    )
    assert "### 解析" in fill_solution
    assert "\\int_0^1 x\\,\\mathrm{d}x" in fill_solution
    assert "katex" not in fill_solution.lower()
    assert "<annotation" not in fill_solution.lower()
    fill.locator("[data-question-answer-trigger]").click()
    fill.locator("[data-question-analysis-trigger]").click()

    subjective = question(page, 3)
    subjective.locator("[data-question-answer-trigger]").click()
    subjective.locator("[data-question-analysis-trigger]").click()
    subjective_solution = copy_from_question(page, subjective)
    assert "```ts" in subjective_solution
    assert "function hasPairWithSum" in subjective_solution
    assert "  let left = 0;" in subjective_solution
    assert "    const sum = values[left] + values[right];" in subjective_solution
    assert "| 指标 | 复杂度 |" in subjective_solution
    assert "| --- | --- |" in subjective_solution
    assert "$O(n)$" in subjective_solution
    subjective.locator("[data-question-answer-trigger]").click()
    subjective.locator("[data-question-analysis-trigger]").click()

    multiple = question(page, 4)
    multiple.locator("[data-question-answer-trigger]").click()
    multiple_solution = copy_from_question(page, multiple)
    assert "### 答案" in multiple_solution
    assert "A. 题干、选项、答案和解析都可以直接包含 Markdown 与公式。" in (
        multiple_solution
    )
    assert "C. 子内容可以继续嵌套其他已经注册的 MDX 组件。" in multiple_solution
    assert "### 解析" not in multiple_solution
    multiple.locator("[data-question-answer-trigger]").click()

    long_analysis = question(page, 5)
    long_analysis.locator("[data-question-answer-trigger]").click()
    long_analysis.locator("[data-question-analysis-trigger]").click()
    long_solution = copy_from_question(page, long_analysis)
    assert "### 答案" in long_solution
    assert "### 解析" in long_solution
    assert "16. 在窄屏上最大高度会进一步降低" in long_solution
    long_analysis.locator("[data-question-answer-trigger]").click()
    long_analysis.locator("[data-question-analysis-trigger]").click()

    return {
        "questionCopyLength": len(question_markdown),
        "answerCopyLength": len(answer_markdown),
        "analysisCopyLength": len(analysis_markdown),
        "completeCopyLength": len(complete_markdown),
        "fillSolutionLength": len(fill_solution),
        "subjectiveCopyLength": len(subjective_solution),
        "multipleCopyLength": len(multiple_solution),
        "longAnalysisCopyLength": len(long_solution),
        "latexRestored": "$\\frac{1}{2}$" in fill_solution,
    }


def verify_responsive_dark_mode(page: Page, output_dir: Path) -> dict[str, Any]:
    desktop_options = question(page, 0).locator("[data-question-options]")
    page.wait_for_function(
        """
        element => element.dataset.questionOptionsColumns === '4'
        """,
        arg=desktop_options.element_handle(),
    )
    desktop_option_rows = desktop_options.evaluate(
        """
        element => new Set(
          [...element.querySelectorAll(':scope > [data-question-option]')]
            .map(option => Math.round(option.getBoundingClientRect().top))
        ).size
        """
    )
    assert int(desktop_option_rows) == 1

    judge = question(page, 2)
    judge.locator("[data-question-analysis-trigger]").click()
    subjective = question(page, 3)
    subjective.locator("[data-question-answer-trigger]").click()
    subjective.locator("[data-question-analysis-trigger]").click()

    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate(
        """
        () => {
          document.documentElement.setAttribute('data-theme', 'dark');
          document.documentElement.setAttribute('data-theme-choice', 'dark');
          try { localStorage.setItem('theme', 'dark'); } catch (_) {}
          window.scrollTo(0, 0);
        }
        """
    )
    page.wait_for_timeout(350)

    layout = page.evaluate(
        """
        () => {
          const root = document.documentElement;
          const questions = [...document.querySelectorAll('[data-question]')];
          const firstQuestion = questions[0];
          const firstOptions = firstQuestion?.querySelector(
            '[data-question-options]'
          );
          const firstHeader = firstQuestion?.querySelector('header');
          const firstActions = firstQuestion?.querySelector(
            '[data-question-copy-trigger]'
          )?.parentElement;
          return {
            clientWidth: root.clientWidth,
            scrollWidth: root.scrollWidth,
            optionRows: firstOptions
              ? new Set(
                  [...firstOptions.querySelectorAll(
                    ':scope > [data-question-option]'
                  )].map(
                    option => Math.round(option.getBoundingClientRect().top)
                  )
                ).size
              : 0,
            headerTop: firstHeader?.getBoundingClientRect().top ?? 0,
            actionsTop: firstActions?.getBoundingClientRect().top ?? 0,
            questionBoxes: questions.map(question => {
              const rect = question.getBoundingClientRect();
              return {left: rect.left, right: rect.right, width: rect.width};
            }),
          };
        }
        """
    )
    assert int(layout["scrollWidth"]) <= int(layout["clientWidth"]) + 1
    for box in layout["questionBoxes"]:
        assert float(box["left"]) >= -1.0
        assert float(box["right"]) <= float(layout["clientWidth"]) + 1.0
    assert int(layout["optionRows"]) in (2, 4)
    assert abs(float(layout["actionsTop"]) - float(layout["headerTop"])) < 12

    page.screenshot(
        path=str(output_dir / "question-components-mobile-dark.png"),
        full_page=True,
    )

    assert (
        page.locator(
            ".navbar [data-question-global-answer-toggle]:visible"
        ).count()
        == 0
    )
    page.locator(".navbar__toggle").click()
    mobile_toggle = page.locator(
        ".theme-layout-navbar-sidebar "
        "[data-question-global-answer-toggle]:visible"
    )
    mobile_toggle.wait_for(state="visible")
    assert re.search("全部答案", mobile_toggle.inner_text())

    page.screenshot(
        path=str(output_dir / "question-components-mobile-menu-dark.png"),
        full_page=False,
    )
    return {
        **layout,
        "desktopOptionRows": desktop_option_rows,
    }


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, Any] = {}
    browser_messages: list[str] = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            context = browser.new_context(
                viewport={"width": 1440, "height": 1000},
                device_scale_factor=1,
                permissions=["clipboard-read", "clipboard-write"],
            )
            page = context.new_page()
            page.on(
                "console",
                lambda message: (
                    browser_messages.append(f"console: {message.text}")
                    if message.type == "error"
                    else None
                ),
            )
            page.on(
                "pageerror",
                lambda error: browser_messages.append(f"pageerror: {error}"),
            )
            page.goto(
                f"{args.base_url.rstrip('/')}{DOC_PATH}",
                wait_until="networkidle",
            )
            page.wait_for_selector("[data-question]")

            verify_initial_state(page)
            results["hover"] = assert_hover_stability(page, question(page, 0))
            results["controls"] = verify_answer_and_analysis_controls(page)
            results["longAnalysis"] = verify_long_analysis_scroll(page)
            results["copy"] = verify_copying(page)
            results["sidebarCollapse"] = verify_official_sidebar_collapse(page)
            results["sidebarBottom"] = verify_sidebar_bottom_stability(page)
            page.screenshot(
                path=str(output_dir / "question-components-desktop-light.png"),
                full_page=True,
            )
            results["responsive"] = verify_responsive_dark_mode(page, output_dir)

            hydration_messages = [
                message
                for message in browser_messages
                if re.search(
                    r"hydration|hydrating|did not match|validateDOMNesting",
                    message,
                    re.IGNORECASE,
                )
            ]
            assert not hydration_messages, (
                "hydration or DOM nesting errors detected: "
                + " | ".join(hydration_messages)
            )
            results["browserMessages"] = browser_messages
            context.close()
            browser.close()
    except Exception as error:
        (output_dir / "question-components-failure.txt").write_text(
            f"{type(error).__name__}: {error}\n",
            encoding="utf-8",
        )
        raise
    finally:
        (output_dir / "question-components-metrics.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
