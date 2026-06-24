"""Group generated multi-language code sections into Docusaurus Tabs.

The HTML converter intentionally produces plain Markdown first. This script is
the post-processing step that turns sections such as "其他语言版本" into compact
MDX tab groups that Docusaurus can render directly.

Usage:
  python Py/code_tabs.py --docs-dir docs/algorithm/programmercarl
  python Py/code_tabs.py --docs-dir docs/algorithm/programmercarl --check
"""

from __future__ import annotations

import argparse
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_DOCS_DIR = SCRIPT_DIR.parent / "docs" / "algorithm" / "programmercarl"

TABS_IMPORT = "import Tabs from '@theme/Tabs';"
TAB_ITEM_IMPORT = "import TabItem from '@theme/TabItem';"

HEADING_RE = re.compile(r"^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+[ \t]*)?$")
FENCE_RE = re.compile(r"^[ \t]{0,3}(`{3,}|~{3,})")

OTHER_LANGUAGE_TITLES = {
    "其他语言",
    "其他语言版本",
    "其他语言补充",
}

CODE_FENCE_LANGUAGE_ALIASES = {
    "c#": "csharp",
    "cs": "csharp",
    "c-sharp": "csharp",
    "golang": "go",
    "js": "javascript",
    "py": "python",
    "python3": "python",
    "sh": "bash",
    "shell": "bash",
    "ts": "typescript",
    "txt": "text",
}


@dataclass(frozen=True)
class Heading:
    line: int
    level: int
    title: str


@dataclass(frozen=True)
class LanguageInfo:
    value: str
    label: str


@dataclass
class TabContent:
    info: LanguageInfo
    chunks: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SectionReplacement:
    start: int
    end: int
    lines: list[str]
    tab_count: int


@dataclass(frozen=True)
class TransformResult:
    text: str
    section_count: int
    tab_count: int


LANGUAGE_PATTERNS: tuple[tuple[re.Pattern[str], LanguageInfo], ...] = (
    (re.compile(r"^(?:javascript|js)", re.IGNORECASE), LanguageInfo("javascript", "JavaScript")),
    (re.compile(r"^(?:typescript|ts)", re.IGNORECASE), LanguageInfo("typescript", "TypeScript")),
    (re.compile(r"^(?:python\s*3|python3|python|py)", re.IGNORECASE), LanguageInfo("python", "Python")),
    (re.compile(r"^(?:c\+\+|cpp)", re.IGNORECASE), LanguageInfo("cpp", "C++")),
    (re.compile(r"^(?:c#|csharp|c-sharp|cs)", re.IGNORECASE), LanguageInfo("csharp", "C#")),
    (re.compile(r"^java", re.IGNORECASE), LanguageInfo("java", "Java")),
    (re.compile(r"^(?:golang|go)", re.IGNORECASE), LanguageInfo("go", "Go")),
    (re.compile(r"^rust", re.IGNORECASE), LanguageInfo("rust", "Rust")),
    (re.compile(r"^scala", re.IGNORECASE), LanguageInfo("scala", "Scala")),
    (re.compile(r"^swift", re.IGNORECASE), LanguageInfo("swift", "Swift")),
    (re.compile(r"^php", re.IGNORECASE), LanguageInfo("php", "PHP")),
    (re.compile(r"^kotlin", re.IGNORECASE), LanguageInfo("kotlin", "Kotlin")),
    (re.compile(r"^ruby#?", re.IGNORECASE), LanguageInfo("ruby", "Ruby")),
    (re.compile(r"^dart", re.IGNORECASE), LanguageInfo("dart", "Dart")),
    (re.compile(r"^bash", re.IGNORECASE), LanguageInfo("bash", "Bash")),
    (re.compile(r"^shell", re.IGNORECASE), LanguageInfo("bash", "Shell")),
    (re.compile(r"^c(?:\s*语言)?", re.IGNORECASE), LanguageInfo("c", "C")),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert generated language sections into Docusaurus Tabs.")
    parser.add_argument("--docs-dir", type=Path, default=DEFAULT_DOCS_DIR)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Do not write files. Exit with code 1 when any file would change.",
    )
    parser.add_argument(
        "--min-tabs",
        type=int,
        default=2,
        help="Only convert sections with at least this many language tabs.",
    )
    return parser.parse_args()


def resolve_path(path_value: Path) -> Path:
    path = path_value.expanduser()
    return path.resolve() if path.is_absolute() else path.resolve()


def split_lines(text: str) -> list[str]:
    return text.replace("\r\n", "\n").replace("\r", "\n").split("\n")


def join_lines(lines: list[str]) -> str:
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines) + "\n"


def iter_markdown_files(path: Path) -> Iterable[Path]:
    if path.is_file():
        if path.suffix.lower() in {".md", ".mdx"}:
            yield path
        return

    yield from sorted(
        candidate
        for candidate in path.rglob("*")
        if candidate.is_file() and candidate.suffix.lower() in {".md", ".mdx"}
    )


def clean_heading_title(title: str) -> str:
    title = title.strip()
    title = re.sub(r"^[`*_]+|[`*_]+$", "", title)
    return title.strip()


def compact_title(title: str) -> str:
    title = clean_heading_title(title)
    title = title.replace("：", ":")
    title = re.sub(r"[\s:：]+$", "", title)
    return re.sub(r"\s+", "", title)


def is_other_language_title(title: str) -> bool:
    normalized = compact_title(title)
    return normalized in OTHER_LANGUAGE_TITLES or normalized.startswith("其他语言")


def normalize_language_title(title: str) -> str:
    title = clean_heading_title(title)
    title = title.replace("：", ":")
    title = title.strip(" \t:-")
    title = re.sub(r"\s+", " ", title)
    return title


def is_plain_language_suffix(suffix: str) -> bool:
    suffix = suffix.strip(" \t:-")
    if not suffix:
        return True
    return bool(re.fullmatch(r"(?:代码|版本|解法|实现|答案|题解|\d+|[一二三四五六七八九十]+)*", suffix))


def detect_language(title: str) -> LanguageInfo | None:
    normalized = normalize_language_title(title)
    for pattern, info in LANGUAGE_PATTERNS:
        match = pattern.match(normalized)
        if match and is_plain_language_suffix(normalized[match.end() :]):
            return info
    return None


def iter_headings(lines: list[str]) -> list[Heading]:
    headings: list[Heading] = []
    in_fence = False
    fence_char = ""
    fence_length = 0

    for index, line in enumerate(lines):
        fence_match = FENCE_RE.match(line)
        if fence_match:
            marker = fence_match.group(1)
            marker_char = marker[0]
            marker_length = len(marker)
            if not in_fence:
                in_fence = True
                fence_char = marker_char
                fence_length = marker_length
                continue
            if marker_char == fence_char and marker_length >= fence_length:
                in_fence = False
                fence_char = ""
                fence_length = 0
                continue

        if in_fence:
            continue

        heading_match = HEADING_RE.match(line)
        if not heading_match:
            continue

        headings.append(
            Heading(
                line=index,
                level=len(heading_match.group(1)),
                title=clean_heading_title(heading_match.group(2)),
            )
        )

    return headings


def section_end_line(headings: list[Heading], section_index: int, line_count: int) -> int:
    section = headings[section_index]
    for heading in headings[section_index + 1 :]:
        if heading.level < section.level:
            return heading.line
        if heading.level == section.level and is_other_language_title(heading.title):
            return heading.line
        if heading.level == section.level and detect_language(heading.title) is None:
            return heading.line
    return line_count


def normalized_code_fence_line(line: str) -> str:
    match = re.match(r"^([ \t]{0,3})(`{3,}|~{3,})([A-Za-z0-9+#._-]+)(.*)$", line)
    if not match:
        return line

    language = match.group(3)
    normalized = CODE_FENCE_LANGUAGE_ALIASES.get(language.lower())
    if normalized is None:
        return line
    return f"{match.group(1)}{match.group(2)}{normalized}{match.group(4)}"


def normalize_code_fences(lines: list[str]) -> list[str]:
    return [normalized_code_fence_line(line) for line in lines]


def trim_blank_edges(lines: list[str]) -> list[str]:
    start = 0
    end = len(lines)
    while start < end and not lines[start].strip():
        start += 1
    while end > start and not lines[end - 1].strip():
        end -= 1
    return lines[start:end]


def collapse_blank_lines(lines: list[str]) -> list[str]:
    collapsed: list[str] = []
    previous_blank = False
    for line in lines:
        is_blank = not line.strip()
        if is_blank and previous_blank:
            continue
        collapsed.append(line)
        previous_blank = is_blank
    return collapsed


def add_chunk(tab: TabContent, lines: list[str]) -> None:
    chunk_lines = collapse_blank_lines(trim_blank_edges(normalize_code_fences(lines)))
    if not chunk_lines:
        return
    tab.chunks.append("\n".join(chunk_lines))


def build_tabs_lines(tabs: list[TabContent]) -> list[str]:
    lines: list[str] = ["<Tabs>"]
    for index, tab in enumerate(tabs):
        lines.extend(build_tab_item_lines(tab, default=index == 0))
    lines.append("</Tabs>")
    return lines


def build_tab_item_lines(tab: TabContent, default: bool = False) -> list[str]:
    default_flag = " default" if default else ""
    lines = [f'<TabItem value="{tab.info.value}" label="{tab.info.label}"{default_flag}>', ""]
    lines.extend("\n\n".join(tab.chunks).split("\n"))
    lines.append("")
    lines.append("</TabItem>")
    return lines


def build_section_replacement(
    lines: list[str],
    headings: list[Heading],
    section_index: int,
    min_tabs: int,
) -> SectionReplacement | None:
    section = headings[section_index]
    section_end = section_end_line(headings, section_index, len(lines))

    language_headings: list[tuple[Heading, LanguageInfo]] = []
    for heading in headings[section_index + 1 :]:
        if heading.line >= section_end:
            break
        if heading.level < section.level:
            break
        if heading.level == section.level and is_other_language_title(heading.title):
            break
        language = detect_language(heading.title)
        if language is not None:
            language_headings.append((heading, language))

    if not language_headings:
        return None

    tab_order: list[str] = []
    tabs_by_value: dict[str, TabContent] = {}
    for item_index, (heading, language) in enumerate(language_headings):
        next_heading_line = (
            language_headings[item_index + 1][0].line if item_index + 1 < len(language_headings) else section_end
        )
        if language.value not in tabs_by_value:
            tab_order.append(language.value)
            tabs_by_value[language.value] = TabContent(language)
        add_chunk(tabs_by_value[language.value], lines[heading.line + 1 : next_heading_line])

    tabs = [tabs_by_value[value] for value in tab_order if tabs_by_value[value].chunks]
    if len(tabs) < min_tabs:
        return None

    first_language_line = language_headings[0][0].line
    intro_lines = collapse_blank_lines(trim_blank_edges(lines[section.line + 1 : first_language_line]))
    if any(line.strip().startswith(("<Tabs", "<TabItem")) for line in intro_lines):
        return None

    replacement_lines = [lines[section.line]]
    if intro_lines:
        replacement_lines.append("")
        replacement_lines.extend(intro_lines)
    replacement_lines.append("")
    replacement_lines.extend(build_tabs_lines(tabs))

    return SectionReplacement(
        start=section.line,
        end=section_end,
        lines=replacement_lines,
        tab_count=len(tabs),
    )


def ensure_tabs_imports(lines: list[str]) -> list[str]:
    has_tabs_import = any(line.strip() == TABS_IMPORT for line in lines)
    has_tab_item_import = any(line.strip() == TAB_ITEM_IMPORT for line in lines)
    imports = []
    if not has_tabs_import:
        imports.append(TABS_IMPORT)
    if not has_tab_item_import:
        imports.append(TAB_ITEM_IMPORT)
    if not imports:
        return lines

    insert_at = 0
    if lines and lines[0].strip() == "---":
        for index in range(1, len(lines)):
            if lines[index].strip() == "---":
                insert_at = index + 1
                break

    while insert_at < len(lines) and not lines[insert_at].strip():
        insert_at += 1

    insertion: list[str] = []
    if insert_at > 0 and lines[insert_at - 1].strip():
        insertion.append("")
    insertion.extend(imports)
    insertion.append("")

    return [*lines[:insert_at], *insertion, *lines[insert_at:]]


def existing_tab_values(lines: list[str], tabs_start: int, tabs_end: int) -> set[str]:
    values: set[str] = set()
    for line in lines[tabs_start:tabs_end]:
        match = re.search(r'<TabItem\s+[^>]*value="([^"]+)"', line)
        if match:
            values.add(match.group(1))
    return values


def previous_tabs_start(lines: list[str], tabs_end: int) -> int | None:
    for index in range(tabs_end - 1, -1, -1):
        if re.match(r"^<Tabs(?:\s|>)", lines[index].strip()):
            return index
    return None


def unique_language_info(info: LanguageInfo, used_values: set[str]) -> LanguageInfo:
    if info.value not in used_values:
        return info

    suffix = 2
    while f"{info.value}-{suffix}" in used_values:
        suffix += 1
    return LanguageInfo(value=f"{info.value}-{suffix}", label=f"{info.label} {suffix}")


def split_after_last_code_fence(lines: list[str]) -> tuple[list[str], list[str]]:
    in_fence = False
    fence_char = ""
    fence_length = 0
    last_closing_fence: int | None = None

    for index, line in enumerate(lines):
        fence_match = FENCE_RE.match(line)
        if not fence_match:
            continue

        marker = fence_match.group(1)
        marker_char = marker[0]
        marker_length = len(marker)
        if not in_fence:
            in_fence = True
            fence_char = marker_char
            fence_length = marker_length
            continue

        if marker_char == fence_char and marker_length >= fence_length:
            in_fence = False
            fence_char = ""
            fence_length = 0
            last_closing_fence = index

    if last_closing_fence is None:
        return lines, []

    trailing = lines[last_closing_fence + 1 :]
    if not any(line.strip() for line in trailing):
        return lines, []
    return lines[: last_closing_fence + 1], trailing


def next_sibling_heading_line(headings: list[Heading], heading_index: int) -> int | None:
    heading = headings[heading_index]
    for next_heading in headings[heading_index + 1 :]:
        if next_heading.level <= heading.level:
            return next_heading.line
    return None


def build_trailing_language_repairs(lines: list[str]) -> list[SectionReplacement]:
    headings = iter_headings(lines)
    heading_by_line = {heading.line: heading for heading in headings}
    heading_index_by_line = {heading.line: index for index, heading in enumerate(headings)}
    repairs: list[SectionReplacement] = []

    for index, line in enumerate(lines):
        if line.strip() != "</Tabs>":
            continue

        tabs_start = previous_tabs_start(lines, index)
        if tabs_start is None:
            continue

        cursor = index + 1
        while cursor < len(lines) and not lines[cursor].strip():
            cursor += 1

        first_heading = heading_by_line.get(cursor)
        if first_heading is None or detect_language(first_heading.title) is None:
            continue

        used_values = existing_tab_values(lines, tabs_start, index)
        remove_start = cursor
        remove_end = cursor
        tabs: list[TabContent] = []
        preserved_after_lines: list[str] = []

        while cursor < len(lines):
            heading = heading_by_line.get(cursor)
            if heading is None:
                break

            language = detect_language(heading.title)
            if language is None:
                break

            unique_language = unique_language_info(language, used_values)
            used_values.add(unique_language.value)

            heading_index = heading_index_by_line[heading.line]
            block_end = next_sibling_heading_line(headings, heading_index) or len(lines)
            next_heading = heading_by_line.get(block_end)
            block_lines = lines[heading.line + 1 : block_end]
            if next_heading is not None and detect_language(next_heading.title) is None:
                block_lines, preserved_after_lines = split_after_last_code_fence(block_lines)

            tab = TabContent(unique_language)
            add_chunk(tab, block_lines)
            if tab.chunks:
                tabs.append(tab)

            remove_end = block_end
            cursor = block_end
            while cursor < len(lines) and not lines[cursor].strip():
                cursor += 1

            next_heading = heading_by_line.get(cursor)
            if next_heading is None or detect_language(next_heading.title) is None:
                break

        if not tabs:
            continue

        replacement_lines: list[str] = []
        for tab in tabs:
            replacement_lines.extend(build_tab_item_lines(tab))
        replacement_lines.append(lines[index])
        outside_lines = trim_blank_edges(preserved_after_lines)
        if outside_lines:
            replacement_lines.append("")
            replacement_lines.extend(outside_lines)
        if remove_end < len(lines) and lines[remove_end].strip():
            replacement_lines.append("")

        repairs.append(
            SectionReplacement(
                start=index,
                end=remove_end,
                lines=replacement_lines,
                tab_count=len(tabs),
            )
        )

    return repairs


def merge_consecutive_tabs(lines: list[str]) -> tuple[list[str], int]:
    merged = 0
    index = 0
    while index < len(lines):
        if lines[index].strip() != "</Tabs>":
            index += 1
            continue

        cursor = index + 1
        while cursor < len(lines) and not lines[cursor].strip():
            cursor += 1

        if cursor >= len(lines) or not re.match(r"^<Tabs(?:\s|>)", lines[cursor].strip()):
            index += 1
            continue

        first_tab_item = cursor + 1
        while first_tab_item < len(lines) and not lines[first_tab_item].strip():
            first_tab_item += 1
        if first_tab_item < len(lines):
            lines[first_tab_item] = re.sub(r"\s+default(?=>)", "", lines[first_tab_item])

        del lines[index : cursor + 1]
        merged += 1

    return lines, merged


def transform_markdown(text: str, min_tabs: int = 2) -> TransformResult:
    lines = split_lines(text)
    headings = iter_headings(lines)
    replacements: list[SectionReplacement] = []

    for index, heading in enumerate(headings):
        if not is_other_language_title(heading.title):
            continue
        replacement = build_section_replacement(lines, headings, index, min_tabs)
        if replacement is not None:
            replacements.append(replacement)

    for replacement in reversed(replacements):
        lines[replacement.start : replacement.end] = replacement.lines

    lines, merged_tabs = merge_consecutive_tabs(lines)

    repairs = build_trailing_language_repairs(lines)
    for repair in reversed(repairs):
        lines[repair.start : repair.end] = repair.lines

    if not replacements and not repairs and merged_tabs == 0:
        return TransformResult(text=join_lines(lines), section_count=0, tab_count=0)

    lines = ensure_tabs_imports(lines)
    return TransformResult(
        text=join_lines(lines),
        section_count=len(replacements) + len(repairs) + merged_tabs,
        tab_count=sum(replacement.tab_count for replacement in replacements)
        + sum(repair.tab_count for repair in repairs),
    )


def main() -> int:
    args = parse_args()
    docs_dir = resolve_path(args.docs_dir)
    if not docs_dir.exists():
        raise FileNotFoundError(f"docs path does not exist: {docs_dir}")

    changed_files: list[Path] = []
    section_count = 0
    tab_count = 0

    for markdown_file in iter_markdown_files(docs_dir):
        original = markdown_file.read_text(encoding="utf-8")
        result = transform_markdown(original, min_tabs=args.min_tabs)
        if result.text == original:
            continue
        changed_files.append(markdown_file)
        section_count += result.section_count
        tab_count += result.tab_count
        if not args.check:
            markdown_file.write_text(result.text, encoding="utf-8")

    action = "would update" if args.check else "updated"
    print(
        f"[tabs] {action} {len(changed_files)} file(s), "
        f"{section_count} section(s), {tab_count} tab(s)"
    )

    if args.check and changed_files:
        for markdown_file in changed_files:
            print(f"[tabs] pending: {markdown_file.relative_to(docs_dir)}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
