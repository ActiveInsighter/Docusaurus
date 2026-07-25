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
            "Verify the unified glass navbar, restored Docusaurus sidebars, "
            "stable controls, and overflow-safe desktop/mobile layouts."
        )
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--output-dir", default="artifacts/docs-ui-visual")
    return parser.parse_args()


def rgba_alpha(value: str) -> float:
    normalized = value.strip().lower()
    if normalized == "transparent":
        return 0.0

    color_match = re.fullmatch(r"color\(srgb\s+.+\s+/\s+([\d.]+)\)", normalized)
    if color_match is not None:
        return float(color_match.group(1))

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


def px(value: str) -> float:
    match = re.search(r"-?[\d.]+", value)
    return float(match.group(0)) if match is not None else 0.0


def blur_radius(value: str) -> float:
    match = re.search(r"blur\(([\d.]+)px\)", value)
    return float(match.group(1)) if match is not None else 0.0


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
          const sidebarViewport = sidebar?.firstElementChild;
          const sidebarMenu = sidebar?.querySelector('.menu');
          const toc = document.querySelector('.theme-doc-toc-desktop');
          const tocContent = toc?.firstElementChild;
          const brand = document.querySelector('.navbar__brand');
          const brandTitle = document.querySelector('.navbar__title');
          const navLink = document.querySelector('.navbar__link');
          const search = document.querySelector('.navbar .DocSearch-Button');
          const title = document.querySelector('article h1');
          for (const [name, element] of Object.entries({
            navbar,
            inner,
            main,
            sidebar,
            sidebarViewport,
            sidebarMenu,
            toc,
            tocContent,
            brand,
            brandTitle,
            navLink,
            search,
            title,
          })) {
            if (!(element instanceof HTMLElement)) throw new Error(`${name} not found`);
          }

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
          const firstSidebar = sidebarLinks.find(link => link.getClientRects().length > 0);
          if (!(exact instanceof HTMLAnchorElement)) throw new Error('current sidebar link missing');
          if (!(inactiveSidebar instanceof HTMLAnchorElement)) throw new Error('inactive sidebar link missing');
          if (!(firstSidebar instanceof HTMLAnchorElement)) throw new Error('first sidebar link missing');

          const tocLinks = [...toc.querySelectorAll('a.table-of-contents__link')];
          const activeToc = toc.querySelector('a.table-of-contents__link--active');
          const inactiveToc = tocLinks.find(link => link !== activeToc);
          const firstToc = tocLinks.find(link => link.getClientRects().length > 0);
          if (!(activeToc instanceof HTMLAnchorElement)) throw new Error('active toc link missing');
          if (!(inactiveToc instanceof HTMLAnchorElement)) throw new Error('inactive toc link missing');
          if (!(firstToc instanceof HTMLAnchorElement)) throw new Error('first toc link missing');

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
              backgroundImage: style.backgroundImage,
              borderWidth: style.borderWidth,
              borderColor: style.borderColor,
              boxShadow: style.boxShadow,
              color: style.color,
              fontSize: style.fontSize,
              fontWeight: style.fontWeight,
              transform: style.transform,
              overflowX: style.overflowX,
              overflowY: style.overflowY,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
              backdropFilter:
                style.backdropFilter || style.webkitBackdropFilter || '',
            };
          };
          const materialStyle = getComputedStyle(navbar, '::before');

          const root = document.documentElement;
          return {
            viewport: {width: window.innerWidth, height: window.innerHeight},
            navbar: read(navbar),
            inner: read(inner),
            main: read(main),
            sidebarBox: read(sidebar),
            sidebarViewport: read(sidebarViewport),
            sidebarMenu: read(sidebarMenu),
            tocBox: read(toc),
            tocContent: read(tocContent),
            navbarMaterial: {
              background: materialStyle.backgroundColor,
              borderBottomWidth: materialStyle.borderBottomWidth,
              boxShadow: materialStyle.boxShadow,
              backdropFilter:
                materialStyle.backdropFilter ||
                materialStyle.webkitBackdropFilter ||
                '',
            },
            brandText: brandTitle.textContent?.trim() ?? '',
            title: {...read(title), text: title.textContent?.trim() ?? ''},
            controls: {
              brand: read(brand),
              link: read(navLink),
              search: read(search),
            },
            sidebar: {
              first: {...read(firstSidebar), text: firstSidebar.textContent?.trim() ?? ''},
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
              first: {...read(firstToc), text: firstToc.textContent?.trim() ?? ''},
              active: {...read(activeToc), text: activeToc.textContent?.trim() ?? ''},
              inactive: {...read(inactiveToc), text: inactiveToc.textContent?.trim() ?? ''},
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
    viewport = state["viewport"]
    navbar = state["navbar"]
    material = state["navbarMaterial"]
    main = state["main"]
    sidebar_box = state["sidebarBox"]
    sidebar_viewport = state["sidebarViewport"]
    sidebar_menu = state["sidebarMenu"]
    toc_box = state["tocBox"]
    controls = state["controls"]
    sidebar = state["sidebar"]
    toc = state["toc"]
    title = state["title"]
    document = state["document"]

    assert navbar["position"] == "sticky", f"{theme}: navbar is not sticky"
    assert abs(float(navbar["left"])) <= 1.0, f"{theme}: navbar is offset from the left"
    assert float(navbar["right"]) >= float(viewport["width"]) - 1.0, (
        f"{theme}: navbar does not span the viewport"
    )
    assert abs(float(navbar["top"])) <= 1.0, f"{theme}: navbar is not pinned to top"
    assert 44.0 <= float(navbar["height"]) <= 54.0, (
        f"{theme}: navbar is not compact: {navbar['height']}"
    )
    assert_transparent(navbar["background"], f"{theme}: navbar shell is not transparent")
    assert navbar["boxShadow"] == "none", f"{theme}: navbar shell has a shadow"
    assert navbar["borderWidth"] == "0px", f"{theme}: navbar shell has a border"
    assert navbar["pointerEvents"] == "auto", f"{theme}: navbar is not interactive"
    assert blur_radius(navbar["backdropFilter"]) == 0.0, (
        f"{theme}: navbar shell creates an extra blur layer"
    )
    assert 0.55 <= rgba_alpha(material["background"]) <= 0.92, (
        f"{theme}: navbar material opacity is unbalanced: {material['background']}"
    )
    assert blur_radius(material["backdropFilter"]) >= 16.0, (
        f"{theme}: unified navbar blur is missing: {material['backdropFilter']}"
    )
    assert px(material["borderBottomWidth"]) >= 1.0, (
        f"{theme}: navbar material divider is missing"
    )
    assert material["boxShadow"] != "none", (
        f"{theme}: navbar material lacks depth"
    )
    assert state["brandText"] == "首页", (
        f"{theme}: navbar brand is not localized: {state['brandText']!r}"
    )

    assert float(sidebar_viewport["top"]) <= 1.0, (
        f"{theme}: left sidebar viewport does not start at top: {sidebar_viewport['top']}"
    )
    assert float(sidebar_viewport["height"]) >= float(viewport["height"]) - 2.0, (
        f"{theme}: left sidebar viewport is not full height: {sidebar_viewport['height']}"
    )
    assert float(sidebar["first"]["top"]) >= float(navbar["bottom"]) + 4.0, (
        f"{theme}: left sidebar content overlaps the navbar: {sidebar['first']['top']}"
    )
    assert (
        abs(px(sidebar_menu["paddingLeft"]) - px(sidebar_menu["paddingRight"]))
        <= 2.0
    ), (
        f"{theme}: restored sidebar padding is unbalanced: "
        f"{sidebar_menu['paddingLeft']} / {sidebar_menu['paddingRight']}"
    )
    assert sidebar_box["overflowX"] == "hidden", (
        f"{theme}: left sidebar does not suppress horizontal overflow"
    )
    assert sidebar_viewport["overflowX"] == "hidden", (
        f"{theme}: left sidebar viewport can show a horizontal scrollbar"
    )

    assert float(toc_box["top"]) >= float(navbar["bottom"]) + 8.0, (
        f"{theme}: right TOC overlaps the navbar: {toc_box['top']}"
    )
    assert float(toc_box["bottom"]) <= float(viewport["height"]) + 1.0, (
        f"{theme}: right TOC exceeds the viewport: {toc_box['bottom']}"
    )
    control_heights = []
    for name, control in controls.items():
        alpha = rgba_alpha(control["background"])
        assert control["pointerEvents"] == "auto", f"{theme}: {name} is not interactive"
        assert control["borderWidth"] != "0px", f"{theme}: {name} lacks a glass boundary"
        assert 0.12 <= alpha <= 0.68, (
            f"{theme}: {name} surface is not visibly translucent: {control['background']}"
        )
        assert blur_radius(control["backdropFilter"]) == 0.0, (
            f"{theme}: {name} adds a redundant blur: {control['backdropFilter']}"
        )
        assert "gradient" in control["backgroundImage"], (
            f"{theme}: {name} lacks the glass highlight layer"
        )
        assert control["transform"] == "none", f"{theme}: {name} uses a transform"
        control_heights.append(float(control["height"]))

    assert max(control_heights) - min(control_heights) <= 1.5, (
        f"{theme}: navbar controls are vertically misaligned: {control_heights}"
    )

    assert 26.0 <= px(title["fontSize"]) <= 37.0, (
        f"{theme}: document title size is unbalanced: {title['fontSize']}"
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

    active_toc = toc["active"]
    inactive_toc = toc["inactive"]
    assert abs(
        font_weight(active_toc["fontWeight"]) - font_weight(inactive_toc["fontWeight"])
    ) <= 1.0, f"{theme}: TOC active state changes font weight"
    assert active_toc["color"] != inactive_toc["color"], (
        f"{theme}: active TOC link is not distinguished by color"
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
    navbar_box = page.locator(".navbar").bounding_box()
    minimum_top = 54.0
    if navbar_box is not None:
        minimum_top = float(navbar_box["y"]) + float(navbar_box["height"]) + 8.0

    viewport_height = float(page.viewport_size["height"] if page.viewport_size else 1000)
    for index in range(links.count()):
        candidate = links.nth(index)
        box = candidate.bounding_box()
        if (
            candidate.is_visible()
            and box is not None
            and float(box["y"]) >= minimum_top
            and float(box["y"]) + float(box["height"]) <= viewport_height - 8.0
        ):
            return candidate
    raise AssertionError("no unobstructed inactive sidebar leaf found")


def verify_hover_stability(page: Page, theme: str) -> dict[str, Any]:
    target = find_hover_target(page)

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
    assert rgba_alpha(after["background"]) > 0.001, f"{theme}: sidebar hover feedback missing"

    return {"targetText": target.inner_text().strip(), "before": before, "after": after}


def capture_theme(page: Page, output_dir: Path, theme: str) -> dict[str, Any]:
    page.evaluate(
        """theme => {
          document.documentElement.setAttribute('data-theme', theme);
          try { localStorage.setItem('theme', theme); } catch (_) {}
        }""",
        theme,
    )
    page.wait_for_timeout(500)
    page.evaluate("window.scrollTo(0, 620)")
    page.wait_for_timeout(650)

    state = read_ui_state(page)
    diagnostics_path = output_dir / f"docs-ui-{theme}-metrics.json"
    diagnostics_path.write_text(
        json.dumps({"state": state}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    page.screenshot(path=str(output_dir / f"docs-ui-{theme}.png"), full_page=False)

    assert_ui_state(state, theme)
    hover = verify_hover_stability(page, theme)
    page.screenshot(
        path=str(output_dir / f"docs-ui-{theme}-sidebar-hover.png"),
        full_page=False,
    )
    page.mouse.move(900, 650)

    result = {"state": state, "hover": hover}
    diagnostics_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return result


def verify_mobile_sidebar(page: Page, output_dir: Path) -> dict[str, Any]:
    page.set_viewport_size({"width": 390, "height": 844})
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(350)

    toggle = page.locator(".navbar__toggle")
    assert toggle.count() == 1
    toggle.click()

    sidebar = page.locator(".navbar-sidebar")
    backdrop = page.locator(".navbar-sidebar__backdrop")
    sidebar.wait_for(state="visible")
    backdrop.wait_for(state="visible")

    state = page.evaluate(
        """
        () => {
          const sidebar = document.querySelector('.navbar-sidebar');
          const backdrop = document.querySelector('.navbar-sidebar__backdrop');
          const root = document.documentElement;
          if (!(sidebar instanceof HTMLElement)) throw new Error('mobile sidebar missing');
          if (!(backdrop instanceof HTMLElement)) throw new Error('mobile backdrop missing');
          const read = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
              width: rect.width,
              height: rect.height,
              position: style.position,
            };
          };
          const topElement = document.elementFromPoint(20, 20);
          return {
            viewport: {width: innerWidth, height: innerHeight},
            sidebar: read(sidebar),
            backdrop: read(backdrop),
            topPointInsideSidebar:
              topElement instanceof Element && sidebar.contains(topElement),
            document: {
              clientWidth: root.clientWidth,
              scrollWidth: root.scrollWidth,
            },
          };
        }
        """
    )

    for name in ("sidebar", "backdrop"):
        box = state[name]
        assert box["position"] == "fixed", f"mobile {name} is not fixed"
        assert abs(float(box["top"])) <= 1.0, f"mobile {name} does not start at top"
        assert float(box["bottom"]) >= float(state["viewport"]["height"]) - 1.0, (
            f"mobile {name} does not cover the viewport"
        )
    assert state["topPointInsideSidebar"], (
        "navbar controls are painted above the open mobile sidebar"
    )
    assert int(state["document"]["scrollWidth"]) <= int(
        state["document"]["clientWidth"]
    ) + 1, "mobile page has horizontal overflow"

    page.screenshot(
        path=str(output_dir / "docs-ui-mobile-sidebar.png"),
        full_page=False,
    )
    close = page.locator(".navbar-sidebar__close")
    assert close.count() == 1
    close.click()
    sidebar.wait_for(state="hidden")
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
            page.goto(f"{args.base_url.rstrip('/')}{DOC_PATH}", wait_until="networkidle")
            page.wait_for_selector(".navbar")
            page.wait_for_selector(".theme-doc-sidebar-container")
            page.wait_for_selector(".theme-doc-toc-desktop")
            page.wait_for_selector("article h1")

            results["light"] = capture_theme(page, output_dir, "light")
            results["dark"] = capture_theme(page, output_dir, "dark")
            results["mobile"] = verify_mobile_sidebar(page, output_dir)
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
