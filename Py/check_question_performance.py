import argparse
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
