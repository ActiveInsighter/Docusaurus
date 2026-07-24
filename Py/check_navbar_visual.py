from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify the deployed Docusaurus navbar layout and capture screenshots."
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--output-dir", default="artifacts/navbar-visual")
    return parser.parse_args()


def read_navbar_state(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        () => {
          const navbar = document.querySelector('.navbar');
          const inner = document.querySelector('.navbar__inner');
          const right = document.querySelector('.navbar__items--right');
          if (!(navbar instanceof HTMLElement)) throw new Error('navbar not found');
          if (!(inner instanceof HTMLElement)) throw new Error('navbar inner not found');
          if (!(right instanceof HTMLElement)) throw new Error('right navbar items not found');

          const navRect = navbar.getBoundingClientRect();
          const innerRect = inner.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          const navStyle = getComputedStyle(navbar);
          const glassStyle = getComputedStyle(navbar, '::before');
          const root = document.documentElement;

          return {
            viewportWidth: window.innerWidth,
            nav: {
              left: navRect.left,
              right: navRect.right,
              width: navRect.width,
              height: navRect.height,
              borderTop: navStyle.borderTopWidth,
              borderRight: navStyle.borderRightWidth,
              borderBottom: navStyle.borderBottomWidth,
              borderLeft: navStyle.borderLeftWidth,
              boxShadow: navStyle.boxShadow,
              background: navStyle.backgroundColor,
            },
            inner: {
              left: innerRect.left,
              right: innerRect.right,
              width: innerRect.width,
            },
            right: {
              left: rightRect.left,
              right: rightRect.right,
              width: rightRect.width,
            },
            glass: {
              backgroundImage: glassStyle.backgroundImage,
              backdropFilter:
                glassStyle.backdropFilter || glassStyle.webkitBackdropFilter || '',
              borderTop: glassStyle.borderTopWidth,
              borderRight: glassStyle.borderRightWidth,
              borderBottom: glassStyle.borderBottomWidth,
              borderLeft: glassStyle.borderLeftWidth,
            },
            document: {
              clientWidth: root.clientWidth,
              scrollWidth: root.scrollWidth,
            },
          };
        }
        """
    )


def assert_layout(state: dict[str, Any], theme: str) -> None:
    viewport_width = float(state["viewportWidth"])
    nav = state["nav"]
    inner = state["inner"]
    right = state["right"]
    glass = state["glass"]
    document = state["document"]

    assert abs(float(nav["left"])) <= 1.0, f"{theme}: navbar does not start at viewport edge"
    assert float(nav["right"]) >= viewport_width - 1.0, f"{theme}: navbar does not fill viewport"
    assert float(inner["right"]) >= viewport_width - 1.0, f"{theme}: navbar inner leaves a right gap"
    assert float(right["right"]) >= viewport_width - 32.0, f"{theme}: right controls are too far from edge"
    assert 48.0 <= float(nav["height"]) <= 55.0, f"{theme}: navbar height is unbalanced"

    for side in ("borderTop", "borderRight", "borderBottom", "borderLeft"):
        assert nav[side] == "0px", f"{theme}: navbar has an unexpected border"
        assert glass[side] == "0px", f"{theme}: glass layer has an unexpected border"

    assert nav["boxShadow"] == "none", f"{theme}: navbar still has a shadow"
    assert "linear-gradient" in glass["backgroundImage"], f"{theme}: glass gradient missing"
    assert "blur(24px)" in glass["backdropFilter"], f"{theme}: 24px backdrop blur missing"
    assert int(document["scrollWidth"]) <= int(document["clientWidth"]) + 1, (
        f"{theme}: horizontal overflow detected"
    )


def capture_theme(page: Page, output_dir: Path, theme: str) -> dict[str, Any]:
    page.evaluate(
        """theme => {
          document.documentElement.setAttribute('data-theme', theme);
          try { localStorage.setItem('theme', theme); } catch (_) {}
        }""",
        theme,
    )
    page.wait_for_timeout(600)
    page.evaluate("window.scrollTo(0, 260)")
    page.wait_for_timeout(400)

    state = read_navbar_state(page)
    page.screenshot(path=str(output_dir / f"navbar-{theme}.png"), full_page=False)
    (output_dir / f"navbar-{theme}-metrics.json").write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    assert_layout(state, theme)
    return state


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    results: dict[str, Any] = {}

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch()
            page = browser.new_page(
                viewport={"width": 1600, "height": 1000},
                device_scale_factor=1,
            )
            page.goto(f"{args.base_url.rstrip('/')}/docs/overview/", wait_until="networkidle")
            page.wait_for_selector(".navbar")

            results["light"] = capture_theme(page, output_dir, "light")
            results["dark"] = capture_theme(page, output_dir, "dark")
            browser.close()
    except Exception as error:
        (output_dir / "failure.txt").write_text(f"{type(error).__name__}: {error}\n", encoding="utf-8")
        raise
    finally:
        (output_dir / "navbar-metrics.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
