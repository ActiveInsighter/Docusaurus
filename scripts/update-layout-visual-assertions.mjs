import {promises as fs} from 'node:fs';

const path = 'Py/check_navbar_visual.py';
const source = await fs.readFile(path, 'utf8');
const pattern = /def assert_ui_state\(state: dict\[str, Any\], theme: str\) -> None:[\s\S]*?\n\ndef find_hover_target/;
const matches = source.match(pattern);
if (!matches || matches.length !== 1) {
  throw new Error('Could not uniquely locate assert_ui_state in navbar visual test');
}

const replacement = `def assert_ui_state(state: dict[str, Any], theme: str) -> None:
    viewport = state["viewport"]
    navbar = state["navbar"]
    sidebar_box = state["sidebarBox"]
    sidebar_viewport = state["sidebarViewport"]
    toc_box = state["tocBox"]
    controls = state["controls"]
    sidebar = state["sidebar"]
    toc = state["toc"]
    title = state["title"]
    document = state["document"]

    rendered_width = float(document["scrollWidth"])
    assert navbar["position"] == "sticky", f"{theme}: navbar is not sticky"
    assert abs(float(navbar["left"])) <= 1.0, f"{theme}: navbar is offset from the left"
    assert float(navbar["right"]) >= rendered_width - 1.0, (
        f"{theme}: navbar does not span the rendered document width"
    )
    assert abs(float(navbar["top"])) <= 1.0, f"{theme}: navbar is not pinned to top"
    assert 48.0 <= float(navbar["height"]) <= 80.0, (
        f"{theme}: navbar height is outside the supported default range: "
        f"{navbar['height']}"
    )
    assert navbar["pointerEvents"] == "auto", f"{theme}: navbar is not interactive"
    assert navbar["transform"] == "none", f"{theme}: navbar uses a transform"
    assert state["brandText"] == "首页", (
        f"{theme}: navbar brand is not localized: {state['brandText']!r}"
    )

    assert sidebar_viewport["position"] == "fixed", (
        f"{theme}: left sidebar viewport is not fixed"
    )
    assert float(sidebar_viewport["top"]) <= 1.0, (
        f"{theme}: left sidebar viewport does not start at top: "
        f"{sidebar_viewport['top']}"
    )
    assert float(sidebar_viewport["height"]) >= float(viewport["height"]) - 2.0, (
        f"{theme}: left sidebar viewport is not full height: "
        f"{sidebar_viewport['height']}"
    )
    assert sidebar_box["overflowX"] == "hidden", (
        f"{theme}: left sidebar does not suppress horizontal overflow"
    )
    assert sidebar_viewport["overflowX"] == "hidden", (
        f"{theme}: left sidebar viewport can show a horizontal scrollbar"
    )
    assert float(sidebar["first"]["top"]) >= float(navbar["bottom"]) + 4.0, (
        f"{theme}: left sidebar content overlaps the navbar: "
        f"{sidebar['first']['top']}"
    )

    assert float(toc_box["top"]) >= float(navbar["bottom"]) + 8.0, (
        f"{theme}: right TOC overlaps the navbar: {toc_box['top']}"
    )
    assert float(toc_box["bottom"]) <= float(viewport["height"]) + 1.0, (
        f"{theme}: right TOC exceeds the viewport: {toc_box['bottom']}"
    )

    for name, control in controls.items():
        assert control["pointerEvents"] == "auto", f"{theme}: {name} is not interactive"
        assert control["transform"] == "none", f"{theme}: {name} uses a transform"
        assert 24.0 <= float(control["height"]) <= 64.0, (
            f"{theme}: {name} height is unbalanced: {control['height']}"
        )

    assert 24.0 <= px(title["fontSize"]) <= 64.0, (
        f"{theme}: document title size is outside the supported range: "
        f"{title['fontSize']}"
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


def find_hover_target`;

await fs.writeFile(path, source.replace(pattern, replacement), 'utf8');
console.log('Updated documentation layout assertions for the current default navbar.');
