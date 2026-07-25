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
            "Verify the documentation navbar and sidebar states, then capture "
            "light/dark screenshots."
        )
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--output-dir", default="artifacts/docs-ui-visual")
    return parser.parse_args()


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
          if (!(navbar instanceof HTMLElement)) throw new Error('navbar not found');
          if (!(inner instanceof HTMLElement)) throw new Error('navbar inner not found');
          if (!(right instanceof HTMLElement)) throw new Error('right navbar items not found');
          if (!(material instanceof HTMLElement)) {
            throw new Error('navbar gradient material not found');
          }
          if (!(softGlass instanceof HTMLElement)) {
            throw new Error('soft navbar blur layer not found');
          }
          if (!(strongGlass instanceof HTMLElement)) {
            throw new Error('strong navbar blur layer not found');
          }
          if (!(tint instanceof HTMLElement)) {
            throw new Error('navbar tint layer not found');
          }
          if (!(sidebar instanceof HTMLElement)) throw new Error('desktop sidebar not found');

          const links = [...sidebar.querySelectorAll('a.menu__link')];
          const exact =
            sidebar.querySelector('a.menu__link[aria-current="page"]') ??
            links.find(link => {
              try {
                return new URL(link.href).pathname === window.location.pathname;
              } catch (_) {
                return false;
              }
            });
          if (!(exact instanceof HTMLAnchorElement)) {
            throw new Error('exact current sidebar link not found');
          }

          const navRect = navbar.getBoundingClientRect();
          const innerRect = inner.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          const materialRect = material.getBoundingClientRect();
          const navStyle = getComputedStyle(navbar);
          const materialStyle = getComputedStyle(material);
          const softGlassStyle = getComputedStyle(softGlass);
          const strongGlassStyle = getComputedStyle(strongGlass);
          const tintStyle = getComputedStyle(tint);
          const exactStyle = getComputedStyle(exact);
          const root = document.documentElement;

          const activeAncestorLinks = links
            .filter(link => link !== exact && link.classList.contains('menu__link--active'))
            .map(link => {
              const style = getComputedStyle(link);
              return {
                text: link.textContent?.trim() ?? '',
                background: style.backgroundColor,
                color: style.color,
                fontWeight: style.fontWeight,
              };
            });

          const activeAncestorRows = [
            ...sidebar.querySelectorAll('.menu__list-item-collapsible'),
          ].flatMap(row => {
            const directLink = row.querySelector(
              ':scope > a.menu__link.menu__link--active',
            );
            if (!(directLink instanceof HTMLAnchorElement) || directLink === exact) {
              return [];
            }
            const rowStyle = getComputedStyle(row);
            const linkStyle = getComputedStyle(directLink);
            return [{
              text: directLink.textContent?.trim() ?? '',
              background: rowStyle.backgroundColor,
              linkBackground: linkStyle.backgroundColor,
              linkColor: linkStyle.color,
              linkFontWeight: linkStyle.fontWeight,
            }];
          });

          const readLayer = (element, style) => ({
            backgroundImage: style.backgroundImage,
            backdropFilter:
              style.backdropFilter ||
              style.webkitBackdropFilter ||
              '',
            maskImage: style.maskImage || style.webkitMaskImage || '',
            borderTop: style.borderTopWidth,
            borderRight: style.borderRightWidth,
            borderBottom: style.borderBottomWidth,
            borderLeft: style.borderLeftWidth,
            display: style.display,
            pointerEvents: style.pointerEvents,
            top: element.getBoundingClientRect().top,
            bottom: element.getBoundingClientRect().bottom,
          });

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
              soft: readLayer(softGlass, softGlassStyle),
              strong: readLayer(strongGlass, strongGlassStyle),
              tint: readLayer(tint, tintStyle),
            },
            sidebar: {
              exact: {
                text: exact.textContent?.trim() ?? '',
                href: exact.getAttribute('href') ?? '',
                ariaCurrent: exact.getAttribute('aria-current') ?? '',
                background: exactStyle.backgroundColor,
                color: exactStyle.color,
                fontWeight: exactStyle.fontWeight,
              },
              activeAncestorLinks,
              activeAncestorRows,
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
    assert float(material["height"]) >= float(nav["height"]) + 48.0, (
        f"{theme}: gradient material is too short to create a soft lower fade"
    )
    assert float(material["height"]) <= 160.0, (
        f"{theme}: gradient material is excessively tall"
    )
    assert material["position"] == "fixed", (
        f"{theme}: gradient material must remain fixed while content scrolls"
    )
    assert material["pointerEvents"] == "none", (
        f"{theme}: gradient material blocks navbar or page interactions"
    )

    for side in ("borderTop", "borderRight", "borderBottom", "borderLeft"):
        assert nav[side] == "0px", f"{theme}: navbar has an unexpected border"
        assert soft_glass[side] == "0px", f"{theme}: soft glass layer has a border"
        assert strong_glass[side] == "0px", f"{theme}: strong glass layer has a border"
        assert tint[side] == "0px", f"{theme}: tint layer has a border"

    assert nav["boxShadow"] == "none", f"{theme}: navbar still has a shadow"
    assert_transparent(nav["background"], f"{theme}: navbar background is not transparent")

    assert "linear-gradient" in soft_glass["backgroundImage"], (
        f"{theme}: soft glass gradient missing"
    )
    assert "linear-gradient" in strong_glass["backgroundImage"], (
        f"{theme}: strong glass gradient missing"
    )
    assert "linear-gradient" in tint["backgroundImage"], (
        f"{theme}: material tint gradient missing"
    )
    assert "linear-gradient" in soft_glass["maskImage"], (
        f"{theme}: soft blur mask missing"
    )
    assert "linear-gradient" in strong_glass["maskImage"], (
        f"{theme}: strong blur mask missing"
    )

    soft_blur = blur_radius(soft_glass["backdropFilter"])
    strong_blur = blur_radius(strong_glass["backdropFilter"])
    assert soft_blur >= 8.0, f"{theme}: base blur is too weak ({soft_blur}px)"
    assert strong_blur >= soft_blur + 8.0, (
        f"{theme}: top blur is not stronger than the lower blur "
        f"({strong_blur}px vs {soft_blur}px)"
    )

    nav_z_index = numeric_z_index(nav["zIndex"])
    material_z_index = numeric_z_index(material["zIndex"])
    if nav_z_index is not None and material_z_index is not None:
        assert material_z_index < nav_z_index, (
            f"{theme}: material must stay behind navbar controls "
            f"({material_z_index} vs {nav_z_index})"
        )

    exact = sidebar["exact"]
    assert exact["ariaCurrent"] == "page", f"{theme}: current link lacks aria-current=page"
    assert rgba_alpha(exact["background"]) > 0.001, (
        f"{theme}: exact current sidebar link is not highlighted"
    )
    assert font_weight(exact["fontWeight"]) >= 700.0, (
        f"{theme}: exact current sidebar link is not emphasized"
    )

    for link in sidebar["activeAncestorLinks"]:
        assert_transparent(
            link["background"],
            f"{theme}: ancestor sidebar link {link['text']!r} is highlighted",
        )
        assert font_weight(link["fontWeight"]) <= 650.0, (
            f"{theme}: ancestor sidebar link {link['text']!r} is over-emphasized"
        )

    for row in sidebar["activeAncestorRows"]:
        assert_transparent(
            row["background"],
            f"{theme}: ancestor sidebar row {row['text']!r} is highlighted",
        )
        assert_transparent(
            row["linkBackground"],
            f"{theme}: ancestor sidebar row link {row['text']!r} is highlighted",
        )
        assert font_weight(row["linkFontWeight"]) <= 650.0, (
            f"{theme}: ancestor sidebar row {row['text']!r} is over-emphasized"
        )

    assert float(document["scrollY"]) >= 500.0, f"{theme}: test document did not scroll beneath navbar"
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
    raise AssertionError("no visible inactive leaf sidebar link found for hover verification")


def verify_hover_state(page: Page, theme: str) -> dict[str, Any]:
    target = find_hover_target(page)
    target_text = target.inner_text().strip()
    target.hover()
    page.wait_for_timeout(180)

    state = page.evaluate(
        """
        target => {
          const sidebar = document.querySelector('.theme-doc-sidebar-container');
          const exact = sidebar?.querySelector('a.menu__link[aria-current="page"]');
          if (!(target instanceof HTMLAnchorElement)) throw new Error('hover target missing');
          if (!(exact instanceof HTMLAnchorElement)) throw new Error('current link missing');
          const targetStyle = getComputedStyle(target);
          const exactStyle = getComputedStyle(exact);
          return {
            targetBackground: targetStyle.backgroundColor,
            exactBackground: exactStyle.backgroundColor,
          };
        }
        """,
        target.element_handle(),
    )

    assert rgba_alpha(state["targetBackground"]) > 0.001, (
        f"{theme}: hovered sidebar link {target_text!r} did not receive hover feedback"
    )
    assert rgba_alpha(state["exactBackground"]) > 0.001, (
        f"{theme}: current sidebar link lost its active state while another link was hovered"
    )
    return {"targetText": target_text, **state}


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
    page.wait_for_timeout(500)

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
