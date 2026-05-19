"""Render a URL allowlist and save the final HTML to disk.

The script reads URLs from ``Py/URL.txt`` by default and writes rendered HTML
into the repository-level ``HTML`` directory so the pages can be converted into
Markdown later.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import re
import sys
import time
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlencode, urljoin, urlparse, urlunparse

from url_plan import TargetEntry, load_target_entries


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_TARGETS_FILE = SCRIPT_DIR / "URL.txt"
DEFAULT_OUTPUT_DIR = SCRIPT_DIR.parent / "HTML"
DEFAULT_STABLE_MS = 250
DEFAULT_TIMEOUT_MS = 20_000
DEFAULT_POLL_MS = 100
DEFAULT_SCROLL_PASSES = 3
DEFAULT_SCROLL_WAIT_MS = 80
DEFAULT_CONCURRENCY = 5
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
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
BLOCKED_RESOURCE_TYPES = {"image", "media", "font"}
ALWAYS_BLOCKED_RESOURCE_TYPES = {"media", "font"}
BLOCKED_URL_SNIPPETS = (
    "doubleclick.net",
    "googlesyndication.com",
    "googletagservices.com",
    "google-analytics.com",
    "googleadservices.com",
    "adsbygoogle",
    "/pagead/",
    "adtrafficquality.google",
    "hm.baidu.com",
    "baidu.com/hm.js",
)
READ_MORE_TEXT_PATTERNS = (
    "阅读更多",
    "查看更多",
    "展开全文",
    "展开",
    "show more",
    "read more",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch rendered HTML for a URL allowlist.")
    parser.add_argument("--targets-file", default=str(DEFAULT_TARGETS_FILE))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--stable-ms", type=int, default=DEFAULT_STABLE_MS)
    parser.add_argument("--timeout-ms", type=int, default=DEFAULT_TIMEOUT_MS)
    parser.add_argument("--poll-ms", type=int, default=DEFAULT_POLL_MS)
    parser.add_argument("--scroll-passes", type=int, default=DEFAULT_SCROLL_PASSES)
    parser.add_argument("--scroll-wait-ms", type=int, default=DEFAULT_SCROLL_WAIT_MS)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--headful", action="store_true", help="Show the browser window.")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip URLs whose destination HTML file already exists and is non-empty.",
    )
    parser.add_argument(
        "--clean-stale",
        action="store_true",
        help="Delete HTML files in --output-dir that are not listed in --targets-file.",
    )
    parser.add_argument(
        "--load-images",
        action="store_true",
        help="Allow image requests. By default images are blocked for faster crawls.",
    )
    return parser.parse_args()


def log(message: str) -> None:
    print(message, file=sys.stdout, flush=True)


def resolve_path(value: str) -> Path:
    path = Path(value).expanduser()
    return path if path.is_absolute() else path.resolve()


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


def load_target_urls(targets_file: Path) -> list[str]:
    if not targets_file.exists():
        raise FileNotFoundError(f"targets file not found: {targets_file}")

    target_urls: list[str] = []
    seen: set[str] = set()
    duplicate_count = 0
    for raw_line in targets_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        normalized = canonicalize_url(line)
        if not normalized:
            continue
        if normalized in seen:
            duplicate_count += 1
            continue
        seen.add(normalized)
        target_urls.append(normalized)

    if duplicate_count:
        log(f"[crawl] skipped {duplicate_count} duplicate URL(s) after normalization")
    return target_urls


def sanitize_segment(segment: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", segment.strip())
    cleaned = cleaned.rstrip(". ")
    return cleaned or "_"


def output_path_for_url(url: str, output_dir: Path) -> Path:
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

    return output_dir / file_path


def output_path_for_entry(entry: TargetEntry, output_dir: Path) -> Path:
    return output_dir / entry.planned_relative_path


def prune_stale_html(output_dir: Path, target_entries: list[TargetEntry]) -> None:
    expected_paths = {output_path_for_entry(entry, output_dir).resolve() for entry in target_entries}
    removed_count = 0
    for html_file in output_dir.rglob("*"):
        if not html_file.is_file() or html_file.suffix.lower() not in {"", ".html"}:
            continue
        if html_file.resolve() in expected_paths:
            continue
        html_file.unlink()
        removed_count += 1
        log(f"[crawl] removed stale HTML {html_file.relative_to(output_dir)}")
    if removed_count:
        log(f"[crawl] removed {removed_count} stale HTML file(s)")


async def install_render_watchers(page) -> None:
    await page.evaluate(
        r"""
        () => {
          if (window.__crawlerRenderWatchersInstalled) {
            return;
          }

          window.__crawlerRenderState = { lastMutationAt: performance.now() };
          const observer = new MutationObserver(() => {
            window.__crawlerRenderState.lastMutationAt = performance.now();
          });

          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });

          window.__crawlerRenderWatchersInstalled = true;
        }
        """
    )


async def wait_for_stable_render(page, stable_ms: int, timeout_ms: int, poll_ms: int) -> dict:
    deadline = time.monotonic() + timeout_ms / 1000
    last_snapshot: dict = {}

    while time.monotonic() < deadline:
        last_snapshot = await page.evaluate(
            r"""
            () => {
              const state = window.__crawlerRenderState || { lastMutationAt: performance.now() };
              const body = document.body;
              const text = body ? (body.textContent || '').replace(/\s+/g, ' ').trim() : '';

              return {
                readyState: document.readyState,
                msSinceMutation: performance.now() - state.lastMutationAt,
                bodyPresent: Boolean(body),
                hasText: Boolean(text),
                textLength: text.length,
                title: document.title || '',
              };
            }
            """
        )

        if (
            last_snapshot.get("readyState") in {"interactive", "complete"}
            and last_snapshot.get("msSinceMutation", 0) >= stable_ms
            and last_snapshot.get("bodyPresent", False)
            and last_snapshot.get("hasText", False)
        ):
            return last_snapshot

        await page.wait_for_timeout(poll_ms)

    return last_snapshot


async def auto_scroll(page, max_passes: int, wait_ms: int) -> None:
    previous_height = -1
    for _ in range(max_passes):
        current_height = await page.evaluate(
            "() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)"
        )
        if current_height == previous_height:
            break
        previous_height = current_height
        await page.evaluate("() => window.scrollTo(0, document.documentElement.scrollHeight)")
        await page.wait_for_timeout(wait_ms)

    await page.evaluate("() => window.scrollTo(0, 0)")


def should_block_request(request, load_images: bool) -> bool:
    resource_type = request.resource_type
    blocked_types = ALWAYS_BLOCKED_RESOURCE_TYPES if load_images else BLOCKED_RESOURCE_TYPES
    if resource_type in blocked_types:
        return True

    url = request.url.lower()
    return any(snippet in url for snippet in BLOCKED_URL_SNIPPETS)


def build_route_handler(load_images: bool):
    async def route_handler(route) -> None:
        if should_block_request(route.request, load_images=load_images):
            await route.abort()
            return
        await route.continue_()

    return route_handler


async def expand_read_more_sections(page) -> None:
    button_root = page.locator("button, a, [role='button']")
    button_candidates = []
    for text in READ_MORE_TEXT_PATTERNS:
        matches = button_root.filter(has_text=text)
        count = await matches.count()
        for index in range(count):
            button_candidates.append(matches.nth(index))

    for candidate in button_candidates:
        try:
            if await candidate.is_visible():
                await candidate.click(timeout=1000)
        except Exception:
            continue

    await page.evaluate(
        """
        () => {
          const selectors = [
            '#kama-read-more-component',
            '.kama-read-more-overlay-wrapper',
            '.kama-read-more-gradient',
            '.kama-read-more-btn-wrap',
          ];

          for (const selector of selectors) {
            for (const element of document.querySelectorAll(selector)) {
              element.remove();
            }
          }

          for (const element of document.querySelectorAll('.theme-default-content.content__default')) {
            if (element instanceof HTMLElement) {
              element.style.maxHeight = 'none';
              element.style.overflow = 'visible';
              element.style.position = 'static';
            }
          }
        }
        """
    )


async def crawl_one_page(
    context,
    entry: TargetEntry,
    output_dir: Path,
    stable_ms: int,
    timeout_ms: int,
    poll_ms: int,
    scroll_passes: int,
    scroll_wait_ms: int,
    skip_existing: bool,
) -> Path:
    output_path = output_path_for_entry(entry, output_dir)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if skip_existing and output_path.exists() and output_path.stat().st_size > 0:
        log(f"[crawl] skipped existing {output_path.relative_to(output_dir)}")
        return output_path

    page = await context.new_page()

    try:
        log(f"[crawl] fetching [{entry.module_name}] {entry.url}")
        try:
            await page.goto(entry.url, wait_until="domcontentloaded", timeout=timeout_ms)
        except Exception:
            log("[crawl] navigation timed out, continuing with current page state")

        await install_render_watchers(page)
        await auto_scroll(page, max_passes=scroll_passes, wait_ms=scroll_wait_ms)
        await expand_read_more_sections(page)
        await page.wait_for_timeout(150)
        await wait_for_stable_render(page, stable_ms=stable_ms, timeout_ms=timeout_ms, poll_ms=poll_ms)

        html = await page.content()
        output_path.write_text(html, encoding="utf-8")
        log(f"[crawl] saved {output_path.relative_to(output_dir)}")
        return output_path
    finally:
        await page.close()


async def crawl_documents(
    targets_file: Path,
    output_dir: Path,
    stable_ms: int,
    timeout_ms: int,
    poll_ms: int,
    scroll_passes: int,
    scroll_wait_ms: int,
    concurrency: int,
    headful: bool,
    skip_existing: bool,
    clean_stale: bool,
    load_images: bool,
) -> None:
    try:
        from playwright.async_api import async_playwright
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "Missing dependency: playwright. Install it with `pip install playwright` "
            "and then run `playwright install chromium`."
        ) from exc

    target_entries = load_target_entries(targets_file)
    if not target_entries:
        raise ValueError(f"no valid target urls found in {targets_file}")

    if clean_stale:
        prune_stale_html(output_dir, target_entries)

    concurrency = max(1, concurrency)
    semaphore = asyncio.Semaphore(concurrency)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=not headful)
        context = await browser.new_context(locale="zh-CN", user_agent=DEFAULT_USER_AGENT)
        context.set_default_timeout(timeout_ms)
        await context.route("**/*", build_route_handler(load_images=load_images))

        try:
            log(f"[crawl] targets={len(target_entries)} concurrency={concurrency} output_dir={output_dir}")

            async def run_target(entry: TargetEntry) -> Path:
                async with semaphore:
                    return await crawl_one_page(
                        context=context,
                        entry=entry,
                        output_dir=output_dir,
                        stable_ms=stable_ms,
                        timeout_ms=timeout_ms,
                        poll_ms=poll_ms,
                        scroll_passes=scroll_passes,
                        scroll_wait_ms=scroll_wait_ms,
                        skip_existing=skip_existing,
                    )

            await asyncio.gather(*(run_target(entry) for entry in target_entries))
        finally:
            await context.close()
            await browser.close()


def main() -> int:
    args = parse_args()
    targets_file = resolve_path(args.targets_file)
    output_dir = resolve_path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    asyncio.run(
        crawl_documents(
            targets_file=targets_file,
            output_dir=output_dir,
            stable_ms=args.stable_ms,
            timeout_ms=args.timeout_ms,
            poll_ms=args.poll_ms,
            scroll_passes=args.scroll_passes,
            scroll_wait_ms=args.scroll_wait_ms,
            concurrency=args.concurrency,
            headful=args.headful,
            skip_existing=args.skip_existing,
            clean_stale=args.clean_stale,
            load_images=args.load_images,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
