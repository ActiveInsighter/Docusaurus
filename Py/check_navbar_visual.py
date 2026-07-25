from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from playwright.sync_api import Locator, Page, sync_playwright

DOC_PATH = (
    "/docs/数学真题/01-高数上/01-模块一极限的概念、性质及计算/"
    "01-一、函数极限的计算/"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Verify the transparent floating navbar, compact glass controls, "
            "and stable sidebar/TOC navigation states."
        )
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--output-dir", default="artifacts/docs-ui-visual")
    return parser.parse_args()


def rgba_alpha(value: str) -> float:
    normalized = value.strip().lower()
    if normalized == "transparent":
        return 0.0

    match = re.fullmatch(r"rgba?\((.+)\)", normalized)
    if match is None:
        return 1.0

    parts = [part.strip() for part in match.group(1).split(",")]
    if len(parts) < 4:
        return 1.0

    alpha = parts[-1]
    if alpha.endswith("%"):
        return float(alpha[:-1]) / 100.0
    return float(alpha)


def blur_radius(value: str) -> float:
    match = re.search(r"blur\(([\d.]+)px\)", value)
    if match is None:
        return 0.0
    return float(match.group(1))


def font_weight(value: str) -> float:
    aliases = {"normal": 400.0, "bold": 700.0}
    if value in aliases:
        return aliases[value]
    return float(value)


def assert_transparent(value: str, message: str) -> None:
    assert rgba_alpha(value) <= 0.001, f"{message}: {value}"


def read_ui_state(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        () => {
          const navbar = document.querySelector('.navbar');
          const inner = document.querySelector('.navbar__inner');
          const main = document.querySelector('.main-wrapper');
          const sidebar = document.querySelector('.theme-doc-sidebar-container');
          const toc = document.querySelector('.theme-doc-toc-desktop');
          const brand = document.querySelector('.navbar__brand');
          const navLink = document.querySelector('.navbar__link');
          const search = document.querySelector('.navbar .DocSearch-Button');
          const material = document.querySelector('[data-navbar-material="true"]');

          if (!(navbar instanceof HTMLElement)) throw new Error('navbar not found');
          if (!(inner instanceof HTMLElement)) throw new Error('navbar inner not found');
          if (!(main instanceof HTMLElement)) throw new Error('main wrapper not found');
          if (!(sidebar instanceof HTMLElement)) throw new Error('desktop sidebar not found');
          if (!(toc instanceof HTMLElement)) throw new Error('desktop toc not found');
          if (!(brand instanceof HTMLElement)) throw new Error('navbar brand not found');
          if (!(navLink instanceof HTMLElement)) throw new Error('navbar link not found');
          if (!(search instanceof HTMLElement)) throw new Error('DocSearch button not found');

          const sidebarLinks = [...sidebar.querySelectorAll('a.menu__link')];
          const exact =
            sidebar.querySelector('a.menu__link[aria-current="page"]') ??
            sidebarLinks.find(link => {
              try {
                return new URL(link.href).pathname === window.location.pathname;
              } catch (_) {
                return false;
              }
            });
          const inactiveSidebar = sidebarLinks.find(
            link =>
              link !== exact &&
              !link.classList.contains('menu__link--active') &&
              link.getClientRects().length > 0,
          );
          if (!(exact instanceof HTMLAnchorElement)) {
            throw new Error('exact current sidebar link not found');
          }
          if (!(inactiveSidebar instanceof HTMLAnchorElement)) {
            throw new Error('inactive sidebar link not found');
          }

          const tocLinks = [...toc.querySelectorAll('a.table-of-contents__link')];
          const activeToc = toc.querySelector('a.table-of-contents__link--active');
          const inactiveToc = tocLinks.find(link => link !== activeToc);
          if (!(activeToc instanceof HTMLAnchorElement)) {
            throw new Error('active toc link not found');
          }
          if (!(inactiveToc instanceof HTMLAnchorElement)) {
            throw new Error('inactive toc link not found');
          }

          const read = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
              position: style.position,
              pointerEvents: style.pointerEvents,
              background: style.backgroundColor,
              borderWidth: style.borderWidth,
              borderColor: style.borderColor,
              boxShadow: style.boxShadow,
              color: style.color,
              fontWeight: style.fontWeight,
              transform: style.transform,
              backdropFilter:
                style.backdropFilter || style.webkitBackdropFilter || '',
            };
          };

          const root = document.documentElement;
          return {
            viewportWidth: window.innerWidth,
            navbar: read(navbar),
            inner: read(inner),
            main: read(main),
            sidebarBox: read(sidebar),
            materialPresent: material instanceof HTMLElement,
            controls: {
              brand: read(brand),
              link: read(navLink),
              search: read(search),
            },
            sidebar: {
              exact: {
                ...read(exact),
                text: exact.textContent?.trim() ?? '',
                ariaCurrent: exact.getAttribute('aria-current') ?? '',
              },
              inactive: {
                ...read(inactiveSidebar),
                text: inactiveSidebar.textContent?.trim() ?? '',
              },
            },
            toc: {
              active: {
                ...read(activeToc),
                text: activeToc.textContent?.trim() ?? '',
              },
              inactive: {
                ...read(inactiveToc),
                text: inactiveToc.textContent?.trim() ?? '',
              },
            },
            document: {
              clientWidth: root.clientWidth,
              scrollWidth: root.scrollWidth,
              scrollY: window.scrollY,
            },
          };
        }
        """
    )


def assert_ui_state(state: dict[str, Any], theme: str) -> None:
    navbar = state["navbar"]
    main = state["main"]
    sidebar_box = state["sidebarBox"]
    controls = state["controls"]
    sidebar = state["sidebar"]
    toc = state["toc"]
    document = state["document"]
    viewport_width = float(state["viewportWidth"])

    assert navbar["position"] == "fixed", f"{theme}: navbar is not floating"
    assert abs(float(navbar["left"])) <= 1.0, f"{theme}: navbar is offset from the left"
    assert float(navbar["right"]) >= viewport_width - 1.0, (
        f"{theme}: navbar does not span the viewport"
    )
    assert abs(float(navbar["top"])) <= 1.0, f"{theme}: navbar is not pinned to the top"
    assert 40.0 <= float(navbar["height"]) <= 51.0, (
        f"{theme}: navbar is not compact: {navbar['height']}"
    )
    assert_transparent(navbar["background"], f"{theme}: navbar outer box is not transparent")
    assert navbar["boxShadow"] == "none", f"{theme}: navbar outer box has a shadow"
    assert navbar["borderWidth"] == "0px", f"{theme}: navbar outer box has a border"
    assert navbar["pointerEvents"] == "none", (
        f"{theme}: transparent navbar blocks the content below"
    )
    assert not state["materialPresent"], (
        f"{theme}: legacy layered navbar material is still rendered"
    )

    assert float(main["top"]) <= 2.0, (
        f"{theme}: main content still reserves a navbar row: {main['top']}"
    )
    assert float(sidebar_box["top"]) <= float(navbar["bottom"]) + 1.0, (
        f"{theme}: sidebar does not use the top viewport area"
    )

    for name, control in controls.items():
        assert control["pointerEvents"] == "auto", (
            f"{theme}: {name} control is not interactive"
        )
        assert control["borderWidth"] != "0px", (
            f"{theme}: {name} control lacks a glass boundary"
        )
        assert rgba_alpha(control["background"]) > 0.05, (
            f"{theme}: {name} control lacks a readable surface"
        )
        assert blur_radius(control["backdropFilter"]) >= 10.0, (
            f"{theme}: {name} control blur is missing: {control['backdropFilter']}"
        )
        assert control["transform"] == "none", (
            f"{theme}: {name} control uses a positional transform"
        )

    exact = sidebar["exact"]
    inactive = sidebar["inactive"]
    assert exact["ariaCurrent"] == "page", f"{theme}: current sidebar link lacks aria-current"
    assert rgba_alpha(exact["background"]) > 0.001, (
        f"{theme}: current sidebar background highlight is missing"
    )
    assert abs(font_weight(exact["fontWeight"]) - font_weight(inactive["fontWeight"])) <= 1.0, (
        f"{theme}: sidebar active state changes font weight"
    )
    assert exact["color"] != inactive["color"], (
        f"{theme}: sidebar active text color is not distinct"
    )

    active_toc = toc["active"]
    inactive_toc = toc["inactive"]
    assert abs(
        font_weight(active_toc["fontWeight"]) - font_weight(inactive_toc["fontWeight"])
    ) <= 1.0, f"{theme}: toc active state changes font weight"
    assert active_toc["color"] != inactive_toc["color"], (
        f"{theme}: active toc link is not distinguished by color"
    )

    assert float(document["scrollY"]) >= 500.0, f"{theme}: test document did not scroll"
    assert int(document["scrollWidth"]) <= int(document["clientWidth"]) + 1, (
        f"{theme}: horizontal overflow detected"
    )


def find_hover_target(page: Page) -> Locator:
    links = page.locator(
        ".theme-doc-sidebar-container "
        ".menu__list-item:not(:has(> .menu__list-item-collapsible)) "
        "> a.menu__link:not([aria-current='page'])"
    )
    for index in range(links.count()):
        candidate = links.nth(index)
        if candidate.is_visible():
            return candidate
    raise AssertionError("no visible inactive leaf sidebar link found")


def verify_hover_stability(page: Page, theme: str) -> dict[str, Any]:
    target = find_hover_target(page)
    target_text = target.inner_text().strip()

    def read_target() -> dict[str, Any]:
        return target.evaluate(
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
                background: style.backgroundColor,
                fontWeight: style.fontWeight,
                transform: style.transform,
              };
            }
            """
        )

    before = read_target()
    target.hover()
    page.wait_for_timeout(220)
    after = read_target()

    for key in ("left", "right", "top", "bottom", "width", "height"):
        assert abs(float(before[key]) - float(after[key])) <= 0.25, (
            f"{theme}: sidebar hover changed geometry ({key})"
        )
    assert before["fontWeight"] == after["fontWeight"], (
        f"{theme}: sidebar hover changed font weight"
    )
    assert after["transform"] == "none", f"{theme}: sidebar hover uses a transform"
    assert rgba_alpha(after["background"]) > 0.001, (
        f"{theme}: hovered sidebar link {target_text!r} lacks feedback"
    )

    return {"targetText": target_text, "before": before, "after": after}


def capture_theme(page: Page, output_dir: Path, theme: str) -> dict[str, Any]:
    page.evaluate(
        """theme => {
          document.documentElement.setAttribute('data-theme', theme);
          try { localStorage.setItem('theme', theme); } catch (_) {}
        }""",
        theme,
    )
    page.wait_for_timeout(600)
    page.evaluate("window.scrollTo(0, 620)")
    page.wait_for_timeout(650)

    state = read_ui_state(page)
    assert_ui_state(state, theme)
    page.screenshot(path=str(output_dir / f"docs-ui-{theme}.png"), full_page=False)

    hover = verify_hover_stability(page, theme)
    page.screenshot(
        path=str(output_dir / f"docs-ui-{theme}-sidebar-hover.png"),
        full_page=False,
    )
    page.mouse.move(900, 650)

    result = {"state": state, "hover": hover}
    (output_dir / f"docs-ui-{theme}-metrics.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return result


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
            page.goto(f"{args.base_url.rstrip('/')}{DOC_PATH}", wait_until="networkidle")
            page.wait_for_selector(".navbar")
            page.wait_for_selector(".theme-doc-sidebar-container")
            page.wait_for_selector(".theme-doc-toc-desktop")
            page.wait_for_selector("article")

            results["light"] = capture_theme(page, output_dir, "light")
            results["dark"] = capture_theme(page, output_dir, "dark")
            browser.close()
    except Exception as error:
        (output_dir / "failure.txt").write_text(
            f"{type(error).__name__}: {error}\n",
            encoding="utf-8",
        )
        raise
    finally:
        (output_dir / "docs-ui-metrics.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
