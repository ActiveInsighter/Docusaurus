from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Verify stable DocSearch trigger interactions and the unified "
            "light/dark search panel styling."
        )
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--output-dir", default="artifacts/docs-ui-visual")
    return parser.parse_args()


def px(value: str) -> float:
    match = re.search(r"-?[\d.]+", value)
    if match is None:
        return 0.0
    return float(match.group(0))


def blur_radius(value: str) -> float:
    match = re.search(r"blur\(([\d.]+)px\)", value)
    if match is None:
        return 0.0
    return float(match.group(1))


def set_theme(page: Page, theme: str) -> None:
    page.evaluate(
        """
        theme => {
          document.documentElement.setAttribute('data-theme', theme);
          document.documentElement.setAttribute('data-theme-choice', theme);
          try { localStorage.setItem('theme', theme); } catch (_) {}
        }
        """,
        theme,
    )
    page.wait_for_timeout(350)


def read_button_state(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        () => {
          const button = document.querySelector('.navbar .DocSearch-Button');
          if (!(button instanceof HTMLElement)) throw new Error('DocSearch button missing');
          const rect = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
            transform: style.transform,
            fontWeight: style.fontWeight,
            borderColor: style.borderColor,
            background: style.backgroundColor,
            boxShadow: style.boxShadow,
            backdropFilter:
              style.backdropFilter || style.webkitBackdropFilter || '',
          };
        }
        """
    )


def read_modal_state(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """
        () => {
          const button = document.querySelector('.DocSearch-Button');
          const container = document.querySelector('.DocSearch-Container');
          const modal = document.querySelector('.DocSearch-Modal');
          const form = document.querySelector('.DocSearch-Form');
          const input = document.querySelector('.DocSearch-Input');
          const dropdown = document.querySelector('.DocSearch-Dropdown');
          const footer = document.querySelector('.DocSearch-Footer');
          if (!(button instanceof HTMLElement)) throw new Error('DocSearch button missing');
          if (!(container instanceof HTMLElement)) throw new Error('DocSearch container missing');
          if (!(modal instanceof HTMLElement)) throw new Error('DocSearch modal missing');
          if (!(form instanceof HTMLElement)) throw new Error('DocSearch form missing');
          if (!(input instanceof HTMLInputElement)) throw new Error('DocSearch input missing');
          if (!(dropdown instanceof HTMLElement)) throw new Error('DocSearch dropdown missing');

          const read = element => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return {
              width: rect.width,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              borderRadius: style.borderRadius,
              borderWidth: style.borderWidth,
              borderColor: style.borderColor,
              background: style.backgroundColor,
              boxShadow: style.boxShadow,
              transform: style.transform,
              backdropFilter:
                style.backdropFilter || style.webkitBackdropFilter || '',
            };
          };

          return {
            viewport: {width: window.innerWidth, height: window.innerHeight},
            button: read(button),
            container: read(container),
            modal: read(modal),
            form: read(form),
            dropdown: read(dropdown),
            footer: footer instanceof HTMLElement ? read(footer) : null,
            input: {
              placeholder: input.placeholder,
              fontSize: getComputedStyle(input).fontSize,
              fontWeight: getComputedStyle(input).fontWeight,
            },
          };
        }
        """
    )


def assert_hover_stability(
    before: dict[str, Any], after: dict[str, Any], theme: str
) -> None:
    for key in ("left", "right", "top", "bottom", "width", "height"):
        delta = abs(float(before[key]) - float(after[key]))
        assert delta <= 0.25, (
            f"{theme}: search button geometry changed on hover "
            f"({key}: {before[key]} -> {after[key]})"
        )

    assert before["fontWeight"] == after["fontWeight"], (
        f"{theme}: search button font weight changed on hover"
    )
    assert after["transform"] == "none", (
        f"{theme}: search button uses a hover transform: {after['transform']}"
    )


def assert_modal_state(state: dict[str, Any], theme: str) -> None:
    button = state["button"]
    container = state["container"]
    modal = state["modal"]
    form = state["form"]
    dropdown = state["dropdown"]
    footer = state["footer"]
    viewport = state["viewport"]

    assert 36.0 <= float(button["height"]) <= 45.0, (
        f"{theme}: search button height is unbalanced: {button['height']}"
    )
    assert float(button["width"]) >= 130.0, (
        f"{theme}: desktop search button is too narrow: {button['width']}"
    )
    assert px(button["borderRadius"]) >= 17.0, (
        f"{theme}: search button is not pill shaped: {button['borderRadius']}"
    )
    assert button["borderWidth"] != "0px", f"{theme}: search button border missing"
    assert button["transform"] == "none", f"{theme}: search button transform is not stable"
    assert blur_radius(button["backdropFilter"]) >= 10.0, (
        f"{theme}: search button glass blur missing: {button['backdropFilter']}"
    )

    assert blur_radius(container["backdropFilter"]) >= 12.0, (
        f"{theme}: modal overlay blur missing: {container['backdropFilter']}"
    )
    assert 620.0 <= float(modal["width"]) <= 760.0, (
        f"{theme}: DocSearch modal width is unbalanced: {modal['width']}"
    )
    modal_center = (float(modal["left"]) + float(modal["right"])) / 2.0
    viewport_center = float(viewport["width"]) / 2.0
    assert abs(modal_center - viewport_center) <= 2.0, (
        f"{theme}: DocSearch modal is not horizontally centered"
    )
    assert 40.0 <= float(modal["top"]) <= 130.0, (
        f"{theme}: DocSearch modal vertical placement is unbalanced: {modal['top']}"
    )
    assert px(modal["borderRadius"]) >= 22.0, (
        f"{theme}: DocSearch modal radius missing: {modal['borderRadius']}"
    )
    assert modal["borderWidth"] != "0px", f"{theme}: DocSearch modal border missing"
    assert modal["transform"] == "none", f"{theme}: DocSearch modal uses a transform"
    assert blur_radius(modal["backdropFilter"]) >= 20.0, (
        f"{theme}: DocSearch modal glass blur missing: {modal['backdropFilter']}"
    )

    assert 49.0 <= float(form["height"]) <= 60.0, (
        f"{theme}: DocSearch form height is unbalanced: {form['height']}"
    )
    assert px(form["borderRadius"]) >= 14.0, (
        f"{theme}: DocSearch form radius missing: {form['borderRadius']}"
    )
    assert dropdown["background"] in ("rgba(0, 0, 0, 0)", "transparent"), (
        f"{theme}: dropdown breaks the unified modal surface"
    )
    if footer is not None:
        assert blur_radius(footer["backdropFilter"]) == 0.0, (
            f"{theme}: footer adds an unnecessary backdrop blur"
        )

    assert state["input"]["placeholder"] == "搜索文档", (
        f"{theme}: localized search placeholder changed"
    )


def capture_theme(page: Page, output_dir: Path, theme: str) -> dict[str, Any]:
    set_theme(page, theme)
    button = page.locator(".navbar .DocSearch-Button")
    button.wait_for(state="visible")

    before_hover = read_button_state(page)
    button.hover()
    page.wait_for_timeout(220)
    after_hover = read_button_state(page)
    assert_hover_stability(before_hover, after_hover, theme)

    button.click()
    page.locator(".DocSearch-Modal").wait_for(state="visible")
    page.locator(".DocSearch-Input").wait_for(state="visible")
    page.wait_for_timeout(450)

    modal_state = read_modal_state(page)
    page.screenshot(
        path=str(output_dir / f"docsearch-{theme}.png"),
        full_page=False,
    )
    result = {
        "beforeHover": before_hover,
        "afterHover": after_hover,
        "modal": modal_state,
    }
    (output_dir / f"docsearch-{theme}-metrics.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    assert_modal_state(modal_state, theme)

    page.keyboard.press("Escape")
    page.locator(".DocSearch-Container").wait_for(state="hidden")
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
            page.goto(
                f"{args.base_url.rstrip('/')}/docs/overview/",
                wait_until="networkidle",
            )
            page.wait_for_selector(".navbar")
            results["light"] = capture_theme(page, output_dir, "light")
            results["dark"] = capture_theme(page, output_dir, "dark")
            browser.close()
    except Exception as error:
        (output_dir / "docsearch-failure.txt").write_text(
            f"{type(error).__name__}: {error}\n",
            encoding="utf-8",
        )
        raise
    finally:
        (output_dir / "docsearch-metrics.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
