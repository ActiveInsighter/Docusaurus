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
            "Verify stable color-only navigation states and the layered "
            "documentation navbar blur, then capture light/dark screenshots."
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


def numeric_z_index(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def assert_transparent(value: str, message: str) -> None:
    assert rgba_alpha(value) <= 0.001, f"{message}: {value}"


def read_ui_state(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        () => {
          const navbar = document.querySelector('.navbar');
          const inner = document.querySelector('.navbar__inner');
          const right = document.querySelector('.navbar__items--right');
          const material = document.querySelector('[data-navbar-material="true"]');
          const softGlass = document.querySelector(
            '[data-navbar-material-layer="soft"]',
          );
          const strongGlass = document.querySelector(
            '[data-navbar-material-layer="strong"]',
          );
          const tint = document.querySelector(
            '[data-navbar-material-layer="tint"]',
          );
          const sidebar = document.querySelector('.theme-doc-sidebar-container');
          const toc = document.querySelector('.theme-doc-toc-desktop');
          if (!(navbar instanceof HTMLElement)) throw new Error('navbar not found');
          if (!(inner instanceof HTMLElement)) throw new Error('navbar inner not found');
          if (!(right instanceof HTMLElement)) throw new Error('right navbar items not found');
          if (!(material instanceof HTMLElement)) throw new Error('navbar material not found');
          if (!(softGlass instanceof HTMLElement)) throw new Error('soft blur layer not found');
          if (!(strongGlass instanceof HTMLElement)) throw new Error('strong blur layer not found');
          if (!(tint instanceof HTMLElement)) throw new Error('tint layer not found');
          if (!(sidebar instanceof HTMLElement)) throw new Error('desktop sidebar not found');
          if (!(toc instanceof HTMLElement)) throw new Error('desktop toc not found');

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
            link => link !== exact && !link.classList.contains('menu__link--active') &&
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

          const readBox = element => {
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
              color: style.color,
              fontWeight: style.fontWeight,
              transform: style.transform,
            };
          };

          const readLayer = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
              backgroundImage: style.backgroundImage,
              backdropFilter:
                style.backdropFilter || style.webkitBackdropFilter || '',
              maskImage: style.maskImage || style.webkitMaskImage || '',
              borderTop: style.borderTopWidth,
              borderRight: style.borderRightWidth,
              borderBottom: style.borderBottomWidth,
              borderLeft: style.borderLeftWidth,
              display: style.display,
              pointerEvents: style.pointerEvents,
            };
          };

          const navRect = navbar.getBoundingClientRect();
          const innerRect = inner.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          const materialRect = material.getBoundingClientRect();
          const navStyle = getComputedStyle(navbar);
          const materialStyle = getComputedStyle(material);
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
              position: navStyle.position,
              zIndex: navStyle.zIndex,
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
              material: {
                left: materialRect.left,
                right: materialRect.right,
                top: materialRect.top,
                bottom: materialRect.bottom,
                width: materialRect.width,
                height: materialRect.height,
                position: materialStyle.position,
                pointerEvents: materialStyle.pointerEvents,
                overflowX: materialStyle.overflowX,
                overflowY: materialStyle.overflowY,
                zIndex: materialStyle.zIndex,
              },
              soft: readLayer(softGlass),
              strong: readLayer(strongGlass),
              tint: readLayer(tint),
            },
            sidebar: {
              exact: {
                ...readBox(exact),
                text: exact.textContent?.trim() ?? '',
                ariaCurrent: exact.getAttribute('aria-current') ?? '',
              },
              inactive: {
                ...readBox(inactiveSidebar),
                text: inactiveSidebar.textContent?.trim() ?? '',
              },
            },
            toc: {
              active: {
                ...readBox(activeToc),
                text: activeToc.textContent?.trim() ?? '',
              },
              inactive: {
                ...readBox(inactiveToc),
                text: inactiveToc.textContent?.trim() ?? '',
              },
            },
            document: {
              clientWidth: root.clientWidth,
              scrollWidth: root.scrollWidth,
              scrollY: window.scrollY,
              scrollHeight: root.scrollHeight,
            },
          };
        }
        """
    )


def assert_ui_state(state: dict[str, Any], theme: str) -> None:
    viewport_width = float(state["viewportWidth"])
    nav = state["nav"]
    inner = state["inner"]
    right = state["right"]
    material = state["glass"]["material"]
    soft_glass = state["glass"]["soft"]
    strong_glass = state["glass"]["strong"]
    tint = state["glass"]["tint"]
    sidebar = state["sidebar"]
    toc = state["toc"]
    document = state["document"]

    assert abs(float(nav["left"])) <= 1.0, f"{theme}: navbar does not start at viewport edge"
    assert float(nav["right"]) >= viewport_width - 1.0, f"{theme}: navbar does not fill viewport"
    assert float(inner["right"]) >= viewport_width - 1.0, f"{theme}: navbar inner leaves a right gap"
    assert float(right["right"]) >= viewport_width - 32.0, f"{theme}: right controls are too far from edge"
    assert 48.0 <= float(nav["height"]) <= 55.0, f"{theme}: navbar height is unbalanced"

    assert abs(float(material["left"])) <= 1.0, (
        f"{theme}: gradient material does not start at viewport edge"
    )
    assert float(material["right"]) >= viewport_width - 1.0, (
        f"{theme}: gradient material does not fill viewport"
    )
    assert abs(float(material["top"])) <= 1.0, (
        f"{theme}: gradient material is not pinned to the top"
    )
    assert float(material["height"]) >= float(nav["height"]) + 50.0, (
        f"{theme}: gradient material is too short for a soft lower fade"
    )
    assert float(material["height"]) <= 165.0, (
        f"{theme}: gradient material is excessively tall"
    )
    assert material["position"] == "fixed", (
        f"{theme}: gradient material must remain fixed while content scrolls"
    )
    assert material["pointerEvents"] == "none", (
        f"{theme}: gradient material blocks interactions"
    )
    assert material["overflowX"] in ("hidden", "clip"), (
        f"{theme}: gradient material is not paint-clipped"
    )

    for side in ("borderTop", "borderRight", "borderBottom", "borderLeft"):
        assert nav[side] == "0px", f"{theme}: navbar has an unexpected border"
        assert soft_glass[side] == "0px", f"{theme}: soft blur layer has a border"
        assert strong_glass[side] == "0px", f"{theme}: strong blur layer has a border"
        assert tint[side] == "0px", f"{theme}: tint layer has a border"

    assert nav["boxShadow"] == "none", f"{theme}: navbar still has a shadow"
    assert_transparent(nav["background"], f"{theme}: navbar background is not transparent")

    assert "linear-gradient" in soft_glass["backgroundImage"], (
        f"{theme}: soft blur gradient missing"
    )
    assert "linear-gradient" in strong_glass["backgroundImage"], (
        f"{theme}: strong blur gradient missing"
    )
    assert "linear-gradient" in tint["backgroundImage"], (
        f"{theme}: material tint gradient missing"
    )
    assert "radial-gradient" in tint["backgroundImage"], (
        f"{theme}: material top highlight missing"
    )
    assert "linear-gradient" in soft_glass["maskImage"], (
        f"{theme}: soft blur mask missing"
    )
    assert "linear-gradient" in strong_glass["maskImage"], (
        f"{theme}: strong blur mask missing"
    )

    soft_blur = blur_radius(soft_glass["backdropFilter"])
    strong_blur = blur_radius(strong_glass["backdropFilter"])
    assert soft_blur >= 10.0, f"{theme}: base blur is too weak ({soft_blur}px)"
    assert strong_blur >= soft_blur + 12.0, (
        f"{theme}: top blur is not sufficiently stronger than the lower blur "
        f"({strong_blur}px vs {soft_blur}px)"
    )
    assert float(strong_glass["height"]) <= float(material["height"]) * 0.8, (
        f"{theme}: expensive strong blur covers too much of the material"
    )

    nav_z_index = numeric_z_index(nav["zIndex"])
    material_z_index = numeric_z_index(material["zIndex"])
    if nav_z_index is not None and material_z_index is not None:
        assert material_z_index < nav_z_index, (
            f"{theme}: material must stay behind navbar controls"
        )

    exact = sidebar["exact"]
    inactive = sidebar["inactive"]
    assert exact["ariaCurrent"] == "page", f"{theme}: current link lacks aria-current=page"
    assert_transparent(exact["background"], f"{theme}: current sidebar link has a fill")
    assert abs(font_weight(exact["fontWeight"]) - font_weight(inactive["fontWeight"])) <= 1.0, (
        f"{theme}: sidebar active state changes font weight"
    )
    assert exact["color"] != inactive["color"], (
        f"{theme}: sidebar current page is not distinguished by color"
    )
    assert exact["transform"] == "none", f"{theme}: current sidebar link uses a transform"

    active_toc = toc["active"]
    inactive_toc = toc["inactive"]
    assert_transparent(active_toc["background"], f"{theme}: active toc link has a fill")
    assert abs(
        font_weight(active_toc["fontWeight"]) - font_weight(inactive_toc["fontWeight"])
    ) <= 1.0, f"{theme}: toc active state changes font weight"
    assert active_toc["color"] != inactive_toc["color"], (
        f"{theme}: active toc link is not distinguished by color"
    )
    assert active_toc["transform"] == "none", f"{theme}: active toc link uses a transform"

    assert float(document["scrollY"]) >= 500.0, f"{theme}: test document did not scroll"
    assert int(document["scrollWidth"]) <= int(document["clientWidth"]) + 1, (
        f"{theme}: horizontal overflow detected"
    )


def find_hover_target(page: Page) -> Locator:
    leaf_links = page.locator(
        ".theme-doc-sidebar-container "
        ".menu__list-item:not(:has(> .menu__list-item-collapsible)) "
        "> a.menu__link:not([aria-current='page'])"
    )
    for index in range(leaf_links.count()):
        candidate = leaf_links.nth(index)
        if candidate.is_visible():
            return candidate
    raise AssertionError("no visible inactive leaf sidebar link found")


def verify_hover_state(page: Page, theme: str) -> dict[str, Any]:
    target = find_hover_target(page)
    target_text = target.inner_text().strip()

    before = target.evaluate(
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
            transform: style.transform,
          };
        }
        """
    )
    exact_before = page.locator(
        ".theme-doc-sidebar-container a.menu__link[aria-current='page']"
    ).evaluate(
        """
        element => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            color: style.color,
            fontWeight: style.fontWeight,
          };
        }
        """
    )

    target.hover()
    page.wait_for_timeout(220)

    after = target.evaluate(
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
    exact_after = page.locator(
        ".theme-doc-sidebar-container a.menu__link[aria-current='page']"
    ).evaluate(
        """
        element => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            color: style.color,
            fontWeight: style.fontWeight,
          };
        }
        """
    )

    for key in ("left", "right", "top", "bottom", "width", "height"):
        assert abs(float(before[key]) - float(after[key])) <= 0.25, (
            f"{theme}: hovered sidebar link changed geometry ({key})"
        )
    assert before["fontWeight"] == after["fontWeight"], (
        f"{theme}: hovered sidebar link changed font weight"
    )
    assert after["transform"] == "none", f"{theme}: hovered sidebar link uses a transform"
    assert rgba_alpha(after["background"]) > 0.001, (
        f"{theme}: hovered sidebar link {target_text!r} lacks feedback"
    )
    assert_transparent(
        exact_after["background"],
        f"{theme}: current sidebar link gained a fill while another link was hovered",
    )
    assert exact_before["color"] == exact_after["color"], (
        f"{theme}: current sidebar color changed while another link was hovered"
    )
    assert exact_before["fontWeight"] == exact_after["fontWeight"], (
        f"{theme}: current sidebar weight changed while another link was hovered"
    )

    return {
        "targetText": target_text,
        "before": before,
        "after": after,
        "exactBefore": exact_before,
        "exactAfter": exact_after,
    }


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
    page.screenshot(path=str(output_dir / f"docs-ui-{theme}.png"), full_page=False)
    assert_ui_state(state, theme)

    hover_state = verify_hover_state(page, theme)
    page.screenshot(
        path=str(output_dir / f"docs-ui-{theme}-sidebar-hover.png"),
        full_page=False,
    )
    page.mouse.move(900, 650)

    result = {"state": state, "hover": hover_state}
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
            page.wait_for_selector('[data-navbar-material="true"]')
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
