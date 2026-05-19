"""Shared URL planning helpers for fetch and HTML-to-Markdown conversion."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlencode, urljoin, urlparse, urlunparse


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

UNCLASSIFIED_MODULE = "未分类"

CATEGORY_SEQUENCE = (
    ("数组理论基础", "数组"),
    ("链表理论基础", "链表"),
    ("哈希表理论基础", "哈希表"),
    ("0344.反转字符串", "字符串"),
    ("0027.移除元素", "双指针法"),
    ("栈与队列理论基础", "栈与队列"),
    ("二叉树理论基础", "二叉树"),
    ("回溯算法理论基础", "回溯算法"),
    ("贪心算法理论基础", "贪心算法"),
    ("动态规划理论基础", "动态规划"),
    ("0739.每日温度", "单调栈"),
    ("图论为什么用ACM模式", "图论"),
    ("1365.有多少小于当前数字的数字", "额外题目"),
)

CATEGORY_STARTS = dict(CATEGORY_SEQUENCE)

CATEGORY_NAMES = {
    UNCLASSIFIED_MODULE,
    *CATEGORY_STARTS.values(),
}


@dataclass(frozen=True)
class TargetEntry:
    url: str
    module_name: str
    source_index: int
    legacy_relative_path: Path
    planned_relative_path: Path


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


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


def legacy_relative_path_for_url(url: str) -> Path:
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


def planned_relative_path_for_url(url: str, module_name: str) -> Path:
    legacy_path = legacy_relative_path_for_url(url)
    file_name = legacy_path.name
    module_dir = sanitize_segment(module_name or UNCLASSIFIED_MODULE)
    return Path(module_dir) / file_name


def slug_for_url(url: str) -> str:
    parsed = urlparse(url)
    path = unquote(parsed.path)
    slug = Path(path).name
    if slug.lower().endswith(".html"):
        slug = slug[:-5]
    return slug


def module_from_comment(line: str) -> str | None:
    text = normalize_whitespace(line.lstrip("#"))
    if not text:
        return None
    text = text.removeprefix("module:").removeprefix("模块:").strip()
    return text if text in CATEGORY_NAMES else None


def sequence_index_for_module(module_name: str) -> int | None:
    for index, (_slug, module) in enumerate(CATEGORY_SEQUENCE):
        if module == module_name:
            return index
    return None


def infer_module_from_url(
    url: str,
    current_module: str | None,
    next_category_index: int,
) -> tuple[str, int]:
    slug = slug_for_url(url)
    if next_category_index < len(CATEGORY_SEQUENCE):
        expected_slug, expected_module = CATEGORY_SEQUENCE[next_category_index]
        if slug == expected_slug:
            return expected_module, next_category_index + 1

    # Support URL files that start from the middle of the course. This fallback
    # is only used when there is no active module yet so repeated URLs inside a
    # known section, such as 0027 in 数组, do not switch chapters accidentally.
    if current_module is None and slug in CATEGORY_STARTS:
        module = CATEGORY_STARTS[slug]
        index = sequence_index_for_module(module)
        return module, (index + 1) if index is not None else next_category_index

    return current_module or UNCLASSIFIED_MODULE, next_category_index


def load_target_entries(targets_file: Path) -> list[TargetEntry]:
    if not targets_file.exists():
        raise FileNotFoundError(f"targets file not found: {targets_file}")

    entries: list[TargetEntry] = []
    seen: set[tuple[str, str]] = set()
    current_module: str | None = None
    next_category_index = 0
    source_index = 0

    for raw_line in targets_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            comment_module = module_from_comment(line)
            if comment_module:
                current_module = comment_module
                index = sequence_index_for_module(comment_module)
                if index is not None:
                    next_category_index = max(next_category_index, index + 1)
            continue

        normalized = canonicalize_url(line)
        if not normalized:
            continue

        current_module, next_category_index = infer_module_from_url(
            normalized,
            current_module,
            next_category_index,
        )
        key = (current_module, normalized)
        if key in seen:
            continue
        seen.add(key)

        legacy_path = legacy_relative_path_for_url(normalized)
        planned_path = planned_relative_path_for_url(normalized, current_module)
        entries.append(
            TargetEntry(
                url=normalized,
                module_name=current_module,
                source_index=source_index,
                legacy_relative_path=legacy_path,
                planned_relative_path=planned_path,
            )
        )
        source_index += 1

    return entries
