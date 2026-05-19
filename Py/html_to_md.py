"""Convert rendered programming-note HTML pages into Docusaurus-friendly Markdown.

The converter uses ``Py/URL.txt`` as the source of truth by default. This keeps
old HTML files in ``HTML`` from being converted accidentally, which also makes
numbering deterministic when pages are split into module directories.

Usage:
  python html_to_md.py --input-dir ./HTML --output-dir ./docs/algorithm/programmercarl

Dependencies:
  pip install beautifulsoup4 lxml
"""

from __future__ import annotations

import argparse
import hashlib
import html
import os
import re
import shutil
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from functools import partial
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qsl, unquote, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup, FeatureNotFound, NavigableString, Tag
from url_plan import TargetEntry, load_target_entries


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_INPUT_DIR = SCRIPT_DIR.parent / "HTML"
DEFAULT_OUTPUT_DIR = SCRIPT_DIR.parent / "docs" / "algorithm" / "programmercarl"
DEFAULT_TARGETS_FILE = SCRIPT_DIR / "URL.txt"
TOC_FILENAME = "index.md"

TRACKING_QUERY_KEYS = {
    "from",
    "spm",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "share",
}

REMOVABLE_TAGS = {
    "script",
    "style",
    "noscript",
    "svg",
    "iframe",
    "canvas",
    "object",
    "embed",
    "form",
    "button",
    "input",
    "textarea",
}

IGNORED_CLASS_PATTERNS = (
    "second-nav",
    "doc-header",
    "doc-header-main",
    "doc-header-box",
    "doc-header-bread",
    "anchor-list",
    "right-collapse",
    "left-side",
    "sidebar",
    "nav",
    "breadcrumb",
    "devices_box",
    "device-list",
    "device-version-list",
    "support-device-item",
    "anchor-icon",
    "handle-button",
    "handle-hover-tips",
    "expand-box",
    "expand-btn",
    "copy-button",
    "line-button",
    "line-numbers-wrapper",
    "theme-button",
    "ai-button",
    "document-right-menu",
    "feedback",
    "copyright",
    "footer",
    "header",
    "comment",
    "right-menu",
    "doc-right",
    "doc-left",
    "top-nav",
    "second-nav",
    "video-box",
    "screen-link-div",
    "highlight-div-header",
    "scrollbar",
    "page-nav",
    "page-edit",
    "page-sidebar",
    "page-side-toolbar",
    "option-box",
    "global-ui",
    "go-to-top",
    "adsbygoogle",
    "advertisement",
    "adtraffic",
    "giscus",
    "login-btn",
    "comment-form",
    "comment-input",
    "comment-submit",
    "comment-wrapper",
    "kama-read-more",
    "read-more",
    "overlay-wrapper",
    "gradient",
    "btn-wrap",
    "copy",
    "lang-switch",
    "social",
    "toolbar",
    "toc-container",
    "pos-box",
    "show-txt",
    "nozoom",
)

IGNORED_ID_PATTERNS = (
    "kama-read-more-component",
    "comments",
    "comment",
    "sidebar",
    "nav",
    "footer",
    "copyright",
    "google_esf",
    "aswift",
    "breadcrumb",
)

BLOCK_TAGS = {
    "article",
    "aside",
    "blockquote",
    "div",
    "dl",
    "dt",
    "dd",
    "figure",
    "figcaption",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "li",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "tbody",
    "td",
    "tfoot",
    "th",
    "thead",
    "tr",
    "ul",
}

CALL_OUT_TYPES = (
    "note",
    "info",
    "tip",
    "important",
    "warning",
    "caution",
    "example",
    "question",
    "success",
    "failure",
    "danger",
    "error",
)

DOCUSAURUS_ADMONITION_TYPES = {
    "note": "note",
    "info": "info",
    "tip": "tip",
    "important": "info",
    "warning": "warning",
    "caution": "caution",
    "example": "tip",
    "question": "tip",
    "success": "tip",
    "failure": "danger",
    "danger": "danger",
    "error": "danger",
}

PROMOTIONAL_LINK_SNIPPETS = (
    "/other/kstar.html",
    "/xunlian/",
    "jianli.kamacoder.com",
    "notes.kamacoder.com",
    "toudi.kamacoder.com",
)

PROMOTIONAL_IMAGE_SNIPPETS = (
    "2026-03-05_15-58-00.jpg",
    "2026-03-02_19-14-37.jpg",
    "2025-08-14kamajianli.jpg",
    "2025-08-14kamabij.jpg",
    "卡码投递表",
)

PROMOTIONAL_TEXT_SNIPPETS = (
    "代码随想录知识星球",
    "4W+录友的选择",
    "20+项目教程",
    "核心服务",
    "卡码简历",
    "最强八股文",
    "卡码投递表",
)

SECTION_TITLES_TO_SKIP = {
    "算法公开课",
}

GENERIC_TITLE_SNIPPETS = (
    "文档中心",
    "代码随想录-全网最全算法数据结构刷题学习路线",
)

TITLE_PREFIX_PATTERNS = (
    re.compile(r"^\s*第\s*\d+\s*题\s*[.、:：]?\s*"),
    re.compile(r"^\s*\d+\s*[.、]\s*"),
    re.compile(r"^\s*面试题\s*\d+(?:\.\d+)*\s*[.、]?\s*"),
    re.compile(r"^\s*剑指\s*Offer(?:\s*II)?\s*\d+(?:\.\d+)*\s*[.、]?\s*", re.IGNORECASE),
)


@dataclass(frozen=True)
class MarkdownDocument:
    html_path: Path
    module_name: str | None
    source_title: str
    file_title: str
    markdown: str


@dataclass(frozen=True)
class ParsedPage:
    html_path: Path
    document: MarkdownDocument | None = None
    skipped_reason: str | None = None


@dataclass(frozen=True)
class HtmlSource:
    html_path: Path
    module_name: str | None
    planned_relative_path: Path


@dataclass(frozen=True)
class ConvertResult:
    html_path: Path
    md_path: Path
    module_name: str | None
    local_index: int
    title: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert rendered HTML pages to Markdown.")
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--targets-file", type=Path, default=DEFAULT_TARGETS_FILE)
    parser.add_argument(
        "--single",
        type=Path,
        default=None,
        help="Convert only one HTML file instead of scanning a directory.",
    )
    parser.add_argument(
        "--include-extra-html",
        action="store_true",
        help="Also convert HTML files that are not listed in --targets-file.",
    )
    parser.add_argument(
        "--sync-html-layout",
        action="store_true",
        help="Copy legacy flat HTML files into the category folders planned from --targets-file.",
    )
    parser.add_argument(
        "--clean-stale-html",
        action="store_true",
        help="Delete stale HTML files after --sync-html-layout. Only .html or extensionless files are removed.",
    )
    parser.add_argument(
        "--keep-empty",
        action="store_true",
        help="Write pages that contain no body content after cleanup.",
    )
    parser.add_argument(
        "--jobs",
        type=int,
        default=0,
        help="Parallel parser workers. Defaults to CPU count.",
    )
    parser.add_argument(
        "--plain-links",
        action="store_true",
        help="Render links as plain text instead of Markdown links.",
    )
    parser.add_argument(
        "--preserve-output-file",
        action="append",
        default=[],
        help="Relative Markdown file to keep when cleaning --output-dir. Repeat for multiple files.",
    )
    return parser.parse_args()


def resolve_path(path_value: Path, use_script_dir_for_relative: bool = False) -> Path:
    path = path_value.expanduser()
    if path.is_absolute():
        return path.resolve()
    if use_script_dir_for_relative:
        return (SCRIPT_DIR / path).resolve()
    return path.resolve()


def output_relative_path(path_value: str) -> Path:
    relative_path = Path(path_value)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise ValueError(f"preserved output file must be relative to --output-dir: {path_value}")
    return relative_path


def prepare_output_dir(output_dir: Path, preserve_files: Iterable[Path] | None = None) -> None:
    preserved = set(preserve_files or ())
    output_dir.mkdir(parents=True, exist_ok=True)
    for markdown_file in output_dir.rglob("*.md"):
        if markdown_file.relative_to(output_dir) in preserved:
            continue
        markdown_file.unlink()


def normalize_whitespace(text: str) -> str:
    text = html.unescape(text)
    return normalize_rendered_markdown(text)


def normalize_rendered_markdown(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"[\t\r\f\v]+", " ", text)
    text = re.sub(r"[ ]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def escape_mdx_text(text: str) -> str:
    return (
        text.replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("{", "&#123;")
        .replace("}", "&#125;")
    )


def normalize_mdx_text(text: str) -> str:
    return escape_mdx_text(normalize_whitespace(text))


def sanitize_filename(value: str, fallback: str) -> str:
    value = normalize_whitespace(value) or fallback
    value = re.sub(r'[<>:"/\\|?*!\x00-\x1f]', "-", value)
    value = value.strip(" .")
    return value or fallback


def strip_problem_prefix(title: str) -> str:
    cleaned = normalize_whitespace(title)
    previous = None
    while cleaned and cleaned != previous:
        previous = cleaned
        for pattern in TITLE_PREFIX_PATTERNS:
            cleaned = pattern.sub("", cleaned).strip()
    return cleaned or normalize_whitespace(title)


def sanitize_segment(segment: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", segment.strip())
    cleaned = cleaned.rstrip(". ")
    return cleaned or "_"


def canonicalize_url(raw_url: str, base_url: str | None = None) -> str | None:
    candidate = raw_url.strip()
    if not candidate:
        return None

    candidate = urljoin(base_url, candidate) if base_url else candidate
    parsed = urlparse(candidate)
    if parsed.scheme not in {"http", "https"}:
        return None

    query_items = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in TRACKING_QUERY_KEYS
    ]
    normalized_path = re.sub(r"/{2,}", "/", parsed.path or "/")
    if normalized_path != "/" and normalized_path.endswith("/"):
        normalized_path = normalized_path.rstrip("/")

    normalized = parsed._replace(
        path=normalized_path,
        params="",
        query=urlencode(query_items, doseq=True),
        fragment="",
    )
    return urlunparse(normalized)


def output_relative_path_for_url(url: str) -> Path:
    parsed = urlparse(url)
    relative_path = unquote(parsed.path.lstrip("/"))
    if not relative_path or relative_path.endswith("/"):
        relative_path = f"{relative_path.rstrip('/')}/index.html" if relative_path else "index.html"

    parts = [sanitize_segment(part) for part in Path(relative_path).parts if part not in {".", ".."}]
    file_path = Path(*parts)
    if not file_path.suffix:
        file_path = file_path.with_suffix(".html")

    if parsed.query:
        query_token = hashlib.sha1(parsed.query.encode("utf-8")).hexdigest()[:8]
        file_path = file_path.with_name(f"{file_path.stem}__q{query_token}{file_path.suffix}")

    return file_path


def source_for_entry(entry: TargetEntry, input_dir: Path) -> tuple[HtmlSource | None, Path]:
    planned_path = input_dir / entry.planned_relative_path
    if planned_path.exists():
        return HtmlSource(planned_path, entry.module_name, entry.planned_relative_path), planned_path

    legacy_path = input_dir / entry.legacy_relative_path
    if legacy_path.exists():
        return HtmlSource(legacy_path, entry.module_name, entry.planned_relative_path), planned_path

    return None, planned_path


def load_target_html_sources(targets_file: Path, input_dir: Path) -> tuple[list[HtmlSource], list[Path], list[TargetEntry]]:
    if not targets_file.exists():
        return [], [], []

    entries = load_target_entries(targets_file)
    sources: list[HtmlSource] = []
    missing_paths: list[Path] = []
    for entry in entries:
        source, planned_path = source_for_entry(entry, input_dir)
        if source is None:
            missing_paths.append(planned_path)
            continue
        sources.append(source)

    return sources, missing_paths, entries


def sync_html_layout(input_dir: Path, entries: list[TargetEntry], clean_stale: bool) -> None:
    copied_count = 0
    expected_paths = {(input_dir / entry.planned_relative_path).resolve() for entry in entries}

    for entry in entries:
        source, _ = source_for_entry(entry, input_dir)
        if source is None:
            continue

        destination = input_dir / entry.planned_relative_path
        if source.html_path.resolve() == destination.resolve():
            continue

        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source.html_path, destination)
        copied_count += 1

    if copied_count:
        print(f"[html] synced {copied_count} file(s) into category folders")

    if not clean_stale:
        return

    removed_count = 0
    for html_file in input_dir.rglob("*"):
        if not html_file.is_file() or html_file.suffix.lower() not in {"", ".html"}:
            continue
        if html_file.resolve() in expected_paths:
            continue
        html_file.unlink()
        removed_count += 1

    if removed_count:
        print(f"[html] removed {removed_count} stale HTML file(s)")


def iter_html_files(
    input_dir: Path,
    targets_file: Path,
    single: Path | None,
    include_extra_html: bool,
) -> tuple[list[HtmlSource], list[Path], list[TargetEntry]]:
    if single is not None:
        return [HtmlSource(single, None, Path(single.name))], [], []

    html_files = sorted(input_dir.rglob("*.html"))
    target_sources, missing_paths, entries = load_target_html_sources(targets_file, input_dir)
    if target_sources:
        if not include_extra_html:
            return target_sources, missing_paths, entries
        target_set = {source.html_path.resolve() for source in target_sources}
        extras = [HtmlSource(path, None, path.relative_to(input_dir)) for path in html_files if path.resolve() not in target_set]
        return [*target_sources, *extras], missing_paths, entries

    return [HtmlSource(path, None, path.relative_to(input_dir)) for path in html_files], missing_paths, entries


def make_soup(raw_html: str) -> BeautifulSoup:
    try:
        return BeautifulSoup(raw_html, "lxml")
    except FeatureNotFound:
        return BeautifulSoup(raw_html, "html.parser")


def extract_module_name(soup: BeautifulSoup) -> str | None:
    selectors = [
        "aside.sidebar .sidebar-group.depth-0 > .sidebar-heading.open > span:first-of-type",
        "aside.sidebar .sidebar-heading.open > span:first-of-type",
        "aside.sidebar .sidebar-group.depth-0 > .sidebar-heading > span:first-of-type",
    ]
    for selector in selectors:
        el = soup.select_one(selector)
        if el:
            text = normalize_whitespace(el.get_text(" ", strip=True))
            if text:
                return text
    return None


def is_ignored_node(node: Tag) -> bool:
    class_values = node.get("class") or []
    class_text = " ".join(class_values).lower()
    if any(pattern in class_text for pattern in IGNORED_CLASS_PATTERNS):
        return True
    node_id = str(node.get("id") or "").lower()
    return any(pattern in node_id for pattern in IGNORED_ID_PATTERNS)


def extract_base_url(soup: BeautifulSoup) -> str | None:
    canonical = soup.select_one('link[rel="canonical"]')
    if canonical and canonical.get("href"):
        return canonical.get("href")

    meta_selectors = [
        'meta[property="og:url"]',
        'meta[name="twitter:url"]',
        'meta[property="article:url"]',
    ]
    for selector in meta_selectors:
        meta = soup.select_one(selector)
        if meta and meta.get("content"):
            return meta.get("content")
    return None


def extract_better_title(soup: BeautifulSoup, fallback: str) -> str:
    def is_useful_title(text: str) -> bool:
        text = normalize_whitespace(text)
        return bool(text) and not any(snippet in text for snippet in GENERIC_TITLE_SNIPPETS)

    selectors = [
        "main h1",
        "article h1",
        "h1",
        ".doc-title",
        ".document-title",
    ]
    for selector in selectors:
        el = soup.select_one(selector)
        if el:
            text = render_inline_children(el, preserve_links=False, base_url=None)
            if is_useful_title(text):
                return text

    meta_selectors = [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
        'meta[name="title"]',
    ]
    for selector in meta_selectors:
        meta = soup.select_one(selector)
        if meta and meta.get("content"):
            text = normalize_whitespace(meta.get("content", "").split("|", 1)[0])
            if is_useful_title(text):
                return text

    if soup.title:
        text = normalize_whitespace(soup.title.get_text(" ", strip=True).split("|", 1)[0])
        if is_useful_title(text):
            return text
    return fallback


def extract_main_container(soup: BeautifulSoup) -> Tag:
    candidates = [
        soup.select_one("main .theme-default-content.content__default"),
        soup.select_one("main .theme-default-content"),
        soup.select_one("main.page .theme-default-content"),
        soup.select_one("main article"),
        soup.select_one("article"),
        soup.select_one("main"),
        soup.select_one("app-document-text"),
        soup.select_one(".document-content-html"),
        soup.select_one(".markdown-body"),
        soup.body,
    ]
    for candidate in candidates:
        if candidate is not None:
            return candidate
    raise ValueError("No document body found")


def clean_dom(container: Tag) -> None:
    nodes_to_remove: list[Tag] = []
    for node in container.find_all(True):
        if not isinstance(node, Tag):
            continue
        if node.find_parent(["pre", "code"]) is not None:
            continue
        if node.name in REMOVABLE_TAGS:
            nodes_to_remove.append(node)
            continue
        if node.name == "app-anchor-list":
            nodes_to_remove.append(node)
            continue
        if is_ignored_node(node):
            nodes_to_remove.append(node)

    for node in reversed(nodes_to_remove):
        if getattr(node, "parent", None) is not None:
            node.decompose()


def gather_blocks(container: Tag, preserve_links: bool, base_url: str | None) -> list[str]:
    blocks: list[str] = []
    skip_section_level: int | None = None

    for child in container.children:
        if isinstance(child, NavigableString):
            text = normalize_mdx_text(str(child))
            if text:
                blocks.append(text)
            continue
        if not isinstance(child, Tag):
            continue

        if skip_section_level is not None:
            if child.name in {"h1", "h2", "h3", "h4", "h5", "h6"} and int(child.name[1]) <= skip_section_level:
                skip_section_level = None
            else:
                continue

        if should_skip_promotional_block(child, base_url):
            continue

        if child.name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            heading_text = render_inline_children(child, preserve_links=False, base_url=None)
            if heading_text in SECTION_TITLES_TO_SKIP:
                skip_section_level = int(child.name[1])
                continue

        rendered = render_node(child, preserve_links, base_url)
        if rendered:
            blocks.append(rendered)
    return blocks


def should_skip_promotional_block(node: Tag, base_url: str | None) -> bool:
    class_text = " ".join(node.get("class") or []).lower()
    if any(marker in class_text for marker in {"advert", "promotion", "sponsor"}):
        return True

    text = normalize_whitespace(node.get_text(" ", strip=True))
    if any(snippet in text for snippet in PROMOTIONAL_TEXT_SNIPPETS):
        return True

    for anchor in node.find_all("a", href=True):
        href = anchor.get("href", "")
        absolute_href = urljoin(base_url, href) if base_url else href
        if any(snippet in absolute_href for snippet in PROMOTIONAL_LINK_SNIPPETS):
            return True

    images = node.find_all("img", src=True)
    for image in images:
        src = image.get("src", "")
        absolute_src = urljoin(base_url, src) if base_url else src
        if any(snippet in absolute_src for snippet in PROMOTIONAL_IMAGE_SNIPPETS):
            return True

    if images and len(text) < 12:
        image_sources = " ".join(urljoin(base_url, image.get("src", "")) if base_url else image.get("src", "") for image in images)
        if "/i/web/" in image_sources:
            return True

    return False


def render_node(node: Tag | NavigableString, preserve_links: bool, base_url: str | None) -> str:
    if isinstance(node, NavigableString):
        return normalize_mdx_text(str(node))

    if not isinstance(node, Tag):
        return ""

    if node.name in REMOVABLE_TAGS:
        return ""

    if node.name == "br":
        return "\n"

    if node.name in {"strong", "b"}:
        inner = render_inline_children(node, preserve_links, base_url)
        return f"**{inner}**" if inner else ""

    if node.name in {"em", "i"}:
        inner = render_inline_children(node, preserve_links, base_url)
        return f"*{inner}*" if inner else ""

    if node.name in {"s", "strike", "del"}:
        inner = render_inline_children(node, preserve_links, base_url)
        return f"~~{inner}~~" if inner else ""

    if node.name == "code":
        text = normalize_whitespace(node.get_text(" ", strip=True))
        return render_inline_code(text) if text else ""

    if node.name == "a":
        text = render_inline_children(node, preserve_links, base_url)
        href = node.get("href", "").strip()
        class_text = " ".join(node.get("class") or []).lower()
        if href.startswith("#") and ("header-anchor" in class_text or text in {"#", "¶"}):
            return ""
        if not preserve_links or not href:
            return text
        absolute_href = urljoin(base_url, href) if base_url else href
        if text and text != absolute_href:
            return f"[{escape_markdown_link_text(text)}]({escape_markdown_url(absolute_href)})"
        return absolute_href

    if node.name == "img":
        alt = normalize_whitespace(node.get("alt", ""))
        src = node.get("src", "").strip()
        if not src:
            return alt
        absolute_src = urljoin(base_url, src) if base_url else src
        escaped_alt = alt.replace("[", "\\[").replace("]", "\\]")
        return f"![{escaped_alt}]({escape_markdown_url(absolute_src)})" if alt else f"![]({escape_markdown_url(absolute_src)})"

    if node.name == "pre":
        return render_pre(node)

    if node.name == "table":
        return render_table(node, preserve_links, base_url)

    if node.name in {"ul", "ol"}:
        return render_list(node, preserve_links, base_url)

    if node.name == "li":
        return render_list_item(node, preserve_links, base_url)

    if node.name in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        level = int(node.name[1])
        text = render_inline_children(node, preserve_links, base_url)
        return f"{'#' * level} {text}".strip() if text else ""

    if node.name == "blockquote":
        callout = render_callout(node, preserve_links, base_url)
        if callout:
            return callout
        inner = render_block(node, preserve_links, base_url)
        if not inner:
            return ""
        lines = [f"> {line}" if line.strip() else ">" for line in inner.splitlines()]
        return "\n".join(lines)

    if node.name == "hr":
        return "---"

    if node.name in {"div", "section", "article", "main", "aside", "figure", "figcaption"}:
        class_text = " ".join(node.get("class") or []).lower()
        if any(callout_type in class_text for callout_type in CALL_OUT_TYPES):
            callout = render_callout(node, preserve_links, base_url)
            if callout:
                return callout
        if "highlight-scroll-div" in class_text:
            pre = node.find("pre")
            return render_pre(pre) if pre else ""
        if has_block_children(node):
            return render_block(node, preserve_links, base_url)
        return render_inline_children(node, preserve_links, base_url)

    return render_inline_children(node, preserve_links, base_url)


def render_inline_children(node: Tag, preserve_links: bool, base_url: str | None) -> str:
    pieces: list[str] = []
    for child in node.children:
        if isinstance(child, NavigableString):
            pieces.append(normalize_mdx_text(str(child)))
            continue

        class_text = " ".join(child.get("class") or []).lower()
        if "header-anchor" in class_text:
            continue
        if any(marker in class_text for marker in {"sr-only", "screen-reader", "visually-hidden"}):
            continue
        if child.get("aria-hidden") == "true":
            continue
        if child.name == "span" and ("icon" in class_text or "outbound" in class_text):
            continue
        pieces.append(render_node(child, preserve_links, base_url))
    return normalize_rendered_markdown("".join(pieces))


def render_inline_code(text: str) -> str:
    if "`" not in text:
        return f"`{text}`"
    return f"`` {text} ``"


def render_pre(node: Tag | None) -> str:
    if node is None:
        return ""

    code = node.find("code") or node
    language = detect_code_language(node)
    code_text = code.get_text("", strip=False)
    code_text = html.unescape(code_text)
    code_text = code_text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in code_text.splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    if not lines:
        return ""

    body = "\n".join(lines)
    fence = longest_safe_fence(body)
    return f"{fence}{language}\n{body}\n{fence}"


def longest_safe_fence(code_text: str) -> str:
    longest = 2
    for match in re.finditer(r"`{3,}", code_text):
        longest = max(longest, len(match.group(0)))
    return "`" * (longest + 1)


def title_is_already_rendered(blocks: list[str], title: str) -> bool:
    normalized_title = normalize_whitespace(title)
    for block in blocks[:4]:
        candidate = normalize_whitespace(block)
        if candidate == normalized_title or candidate == f"# {normalized_title}":
            return True
    return False


def has_meaningful_blocks(blocks: list[str], title: str) -> bool:
    normalized_title = normalize_whitespace(title)
    title_markers = {
        normalized_title,
        f"# {normalized_title}",
        f"## {normalized_title}",
    }
    for block in blocks:
        candidate = normalize_whitespace(block)
        if candidate and candidate not in title_markers:
            return True
    return False


def detect_code_language(node: Tag) -> str:
    classes: list[str] = []
    for candidate in (node, node.find("code"), node.parent if isinstance(node.parent, Tag) else None):
        if isinstance(candidate, Tag):
            classes.extend(str(value) for value in candidate.get("class") or [])
            data_lang = candidate.get("data-lang") or candidate.get("lang")
            if data_lang:
                classes.append(f"language-{data_lang}")
    class_text = " ".join(classes)
    match = re.search(r"(?:language|lang)-([A-Za-z0-9+#._-]+)", class_text)
    if not match:
        return "text"
    language = match.group(1).lower()
    language = language.replace("cplusplus", "cpp")
    language = language.replace("c++", "cpp")
    language = language.replace("shell", "bash")
    return language or "text"


def render_list(node: Tag, preserve_links: bool, base_url: str | None, indent: int = 0) -> str:
    ordered = node.name == "ol"
    items: list[str] = []
    for index, li in enumerate(node.find_all("li", recursive=False), start=1):
        text = render_list_item(li, preserve_links, base_url, indent=indent)
        if not text:
            continue
        prefix = f"{index}." if ordered else "-"
        lines = text.splitlines()
        first_line = lines[0] if lines else ""
        item_lines = [f"{' ' * indent}{prefix} {first_line}".rstrip()]
        continuation_indent = indent + len(prefix) + 1
        for line in lines[1:]:
            item_lines.append(f"{' ' * continuation_indent}{line}".rstrip() if line else "")
        items.append("\n".join(item_lines))
    return "\n".join(items)


def render_list_item(node: Tag, preserve_links: bool, base_url: str | None, indent: int = 0) -> str:
    parts: list[str] = []
    nested_lists: list[Tag] = []
    for child in node.children:
        if isinstance(child, NavigableString):
            parts.append(normalize_mdx_text(str(child)))
            continue
        if child.name in {"ul", "ol"}:
            nested_lists.append(child)
            continue
        rendered = render_node(child, preserve_links, base_url).strip()
        if rendered:
            parts.append(rendered)

    text = collapse_blocks(part for part in parts if normalize_whitespace(part))
    lines: list[str] = [line.rstrip() for line in text.splitlines()] if text else []
    for nested in nested_lists:
        rendered_nested = render_list(nested, preserve_links, base_url, indent=indent + 2)
        if rendered_nested:
            if lines:
                lines.append(rendered_nested)
            else:
                lines.extend(rendered_nested.splitlines())
    return "\n".join(lines).strip()


def render_table(table: Tag, preserve_links: bool, base_url: str | None) -> str:
    rows: list[list[str]] = []
    for row in table.find_all("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if not cells:
            continue
        rows.append([cell_text(cell, preserve_links, base_url) for cell in cells])

    if not rows:
        return ""

    header_row = rows[0]
    body_rows = rows[1:]
    width = max(len(header_row), *(len(row) for row in body_rows)) if body_rows else len(header_row)
    header_row = normalize_row_width(header_row, width)
    normalized_rows = [normalize_row_width(row, width) for row in body_rows]

    def to_row(values: list[str]) -> str:
        return "| " + " | ".join(escape_table_cell(value) for value in values) + " |"

    lines = [to_row(header_row), to_row(["---"] * width)]
    lines.extend(to_row(row) for row in normalized_rows)
    return "\n".join(lines)


def normalize_row_width(row: list[str], width: int) -> list[str]:
    if len(row) < width:
        return row + [""] * (width - len(row))
    if len(row) > width:
        return row[:width]
    return row


def cell_text(cell: Tag, preserve_links: bool, base_url: str | None) -> str:
    pieces: list[str] = []
    for child in cell.children:
        if isinstance(child, NavigableString):
            pieces.append(normalize_mdx_text(str(child)))
        else:
            pieces.append(render_node(child, preserve_links, base_url))
    text = normalize_rendered_markdown("".join(pieces))
    text = re.sub(r"\n+", " ", text)
    return text


def escape_table_cell(value: str) -> str:
    return value.replace("\n", " ").replace("|", "\\|")


def render_callout(node: Tag, preserve_links: bool, base_url: str | None) -> str:
    class_text = " ".join(node.get("class") or []).lower()
    callout_type = next((kind for kind in CALL_OUT_TYPES if kind in class_text), None)
    if callout_type is None:
        return ""

    title_node = node.find(class_="title")
    content_node = node.find(class_="content")
    content_source = content_node if content_node else node
    content = render_block(content_source, preserve_links, base_url).strip()
    if title_node:
        title_text = normalize_whitespace(title_node.get_text(" ", strip=True))
        content = content.replace(title_text, "", 1).strip()
    else:
        title_text = ""
    if not content:
        return ""

    admonition_type = DOCUSAURUS_ADMONITION_TYPES.get(callout_type, "note")
    headline = f":::{admonition_type}"
    if title_text:
        headline += f" {title_text}"
    lines = [headline, *content.splitlines(), ":::"]
    return "\n".join(lines)


def render_block(node: Tag, preserve_links: bool, base_url: str | None) -> str:
    chunks: list[str] = []
    for child in node.children:
        rendered = render_node(child, preserve_links, base_url)
        rendered = rendered.strip()
        if rendered:
            chunks.append(rendered)
    return collapse_blocks(chunks)


def collapse_blocks(chunks: Iterable[str]) -> str:
    out: list[str] = []
    for chunk in chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        if out and out[-1] != "":
            out.append("")
        out.extend(chunk.splitlines())
    return "\n".join(out).strip()


def has_block_children(node: Tag) -> bool:
    for child in node.children:
        if not isinstance(child, Tag):
            continue
        if child.name in BLOCK_TAGS:
            return True
    return False


def escape_markdown_link_text(value: str) -> str:
    return value.replace("[", "\\[").replace("]", "\\]")


def escape_markdown_url(value: str) -> str:
    return value.replace(" ", "%20").replace(")", "%29")


def build_markdown(title: str, blocks: list[str]) -> str:
    md_parts: list[str] = []
    if not title_is_already_rendered(blocks, title):
        md_parts.append(f"# {title}")
        md_parts.append("")
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        md_parts.append(block)
        md_parts.append("")
    return re.sub(r"\n{3,}", "\n\n", "\n".join(md_parts)).strip() + "\n"


def parse_markdown_document(
    source: HtmlSource,
    preserve_links: bool,
    keep_empty: bool,
) -> ParsedPage:
    html_path = source.html_path
    try:
        raw_html = html_path.read_text(encoding="utf-8", errors="replace")
        soup = make_soup(raw_html)
        title = extract_better_title(soup, html_path.stem)
        module_name = source.module_name or extract_module_name(soup)
        base_url = extract_base_url(soup)
        container = extract_main_container(soup)
        clean_dom(container)

        blocks = gather_blocks(container, preserve_links=preserve_links, base_url=base_url)
        if not keep_empty and not has_meaningful_blocks(blocks, title):
            return ParsedPage(html_path=html_path, skipped_reason="empty after cleanup")

        markdown_text = build_markdown(title, blocks)
        file_title = strip_problem_prefix(title)
        document = MarkdownDocument(
            html_path=html_path,
            module_name=module_name,
            source_title=title,
            file_title=file_title,
            markdown=markdown_text,
        )
        return ParsedPage(html_path=html_path, document=document)
    except Exception as exc:
        return ParsedPage(html_path=html_path, skipped_reason=f"parse failed: {exc}")


def parser_worker_count(jobs: int, document_count: int) -> int:
    if jobs > 0:
        return max(1, jobs)
    return max(1, min(document_count, os.cpu_count() or 1, 8))


@dataclass
class WriteState:
    counters: defaultdict[str, int] = field(default_factory=lambda: defaultdict(int))
    used_stems: defaultdict[Path, set[str]] = field(default_factory=lambda: defaultdict(set))


def write_document(document: MarkdownDocument, output_dir: Path, state: WriteState) -> ConvertResult:
    module_dir_name = sanitize_filename(document.module_name, document.module_name) if document.module_name else ""
    module_dir = output_dir / module_dir_name if module_dir_name else output_dir
    module_dir.mkdir(parents=True, exist_ok=True)

    state.counters[module_dir_name] += 1
    local_index = state.counters[module_dir_name]

    base_name = sanitize_filename(document.file_title, document.html_path.stem)
    stem = f"{local_index:03d}_{base_name}"
    unique_stem = stem
    suffix = 2
    while unique_stem in state.used_stems[module_dir]:
        unique_stem = f"{stem}-{suffix}"
        suffix += 1
    state.used_stems[module_dir].add(unique_stem)

    md_path = module_dir / f"{unique_stem}.md"
    md_path.write_text(document.markdown, encoding="utf-8")
    return ConvertResult(
        html_path=document.html_path,
        md_path=md_path,
        module_name=document.module_name,
        local_index=local_index,
        title=document.file_title,
    )


def parse_and_write_documents(
    html_sources: list[HtmlSource],
    output_dir: Path,
    preserve_links: bool,
    keep_empty: bool,
    jobs: int,
) -> list[ConvertResult]:
    if not html_sources:
        return []

    max_workers = parser_worker_count(jobs, len(html_sources))
    worker = partial(parse_markdown_document, preserve_links=preserve_links, keep_empty=keep_empty)
    write_state = WriteState()
    results: list[ConvertResult] = []

    def handle_parsed_page(parsed: ParsedPage) -> None:
        if parsed.document is None:
            print(f"[skip] {parsed.html_path.name}: {parsed.skipped_reason}", flush=True)
            return

        result = write_document(parsed.document, output_dir, write_state)
        results.append(result)
        print(f"[ok] {result.html_path.name} -> {result.md_path.relative_to(output_dir)}", flush=True)

    print(f"[parse] parsing {len(html_sources)} HTML file(s) with {max_workers} worker(s)", flush=True)
    if max_workers <= 1 or len(html_sources) == 1:
        for index, source in enumerate(html_sources, start=1):
            handle_parsed_page(worker(source))
            print(f"[parse] progress {index}/{len(html_sources)}: {source.html_path.name}", flush=True)
        return results

    pending: dict[int, ParsedPage] = {}
    next_to_write = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(worker, source): (index, source)
            for index, source in enumerate(html_sources)
        }
        for completed_count, future in enumerate(as_completed(futures), start=1):
            index, source = futures[future]
            pending[index] = future.result()
            print(f"[parse] progress {completed_count}/{len(html_sources)}: {source.html_path.name}", flush=True)

            while next_to_write in pending:
                handle_parsed_page(pending.pop(next_to_write))
                next_to_write += 1

    return results


def build_toc_markdown(results: list[ConvertResult], output_dir: Path) -> str:
    def clean_cell(text: str) -> str:
        text = re.sub(r"\s+", " ", text).strip()
        return text.replace("|", "\\|")

    lines = ["# 目录", "", "| 分类 | 编号 | 标题 | 文件 |", "| --- | --- | --- | --- |"]
    for result in results:
        module = clean_cell(result.module_name or "未分类")
        title = clean_cell(result.title)
        relative_path = result.md_path.relative_to(output_dir).as_posix()
        lines.append(f"| {module} | {result.local_index:03d} | {title} | [{relative_path}]({relative_path}) |")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    args = parse_args()
    input_dir = resolve_path(args.input_dir)
    output_dir = resolve_path(args.output_dir)
    targets_file = resolve_path(args.targets_file)
    single = resolve_path(args.single) if args.single is not None else None

    preserve_output_files = [output_relative_path(path) for path in args.preserve_output_file]
    prepare_output_dir(output_dir, preserve_output_files)

    if args.sync_html_layout and single is None:
        target_entries = load_target_entries(targets_file)
        sync_html_layout(input_dir, target_entries, clean_stale=args.clean_stale_html)

    html_sources, missing_paths, _entries = iter_html_files(
        input_dir=input_dir,
        targets_file=targets_file,
        single=single,
        include_extra_html=args.include_extra_html,
    )
    if not html_sources:
        raise FileNotFoundError(f"No HTML files found in {input_dir}")

    print(f"[start] input_dir={input_dir}", flush=True)
    print(f"[start] output_dir={output_dir}", flush=True)
    print(f"[start] targets={len(html_sources)} missing={len(missing_paths)}", flush=True)

    for missing_path in missing_paths:
        print(f"[warn] target HTML missing: {missing_path.relative_to(input_dir)}")

    results = parse_and_write_documents(
        html_sources=html_sources,
        output_dir=output_dir,
        preserve_links=not args.plain_links,
        keep_empty=args.keep_empty,
        jobs=args.jobs,
    )

    if not results:
        raise ValueError("No Markdown documents were produced.")

    toc_path = output_dir / TOC_FILENAME
    toc_path.write_text(build_toc_markdown(results, output_dir), encoding="utf-8")
    print(f"Converted {len(results)} file(s) into {output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
