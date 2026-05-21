import React, {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import type {Props as MDXAProps} from '@theme/MDXComponents/A';

import styles from './styles.module.css';

type MetadataState = 'idle' | 'loading' | 'ready' | 'blocked';

type LinkMetadata = {
  title: string;
  description?: string;
};

type ExternalResourceLinkProps = MDXAProps & {
  href: string;
  hostname: string;
};

const metadataCache = new Map<string, LinkMetadata | null>();

function getPlainText(children: ReactNode): string {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return child;
      }

      return '';
    })
    .join('')
    .trim();
}

function safelyDecodeUri(uri: string): string {
  try {
    return decodeURI(uri);
  } catch {
    return uri;
  }
}

function getReadablePath(href: string): string {
  try {
    const url = new URL(href);
    const path = safelyDecodeUri(`${url.pathname}${url.search}`);

    return path === '/' ? url.origin : path;
  } catch {
    return safelyDecodeUri(href);
  }
}

function getMetaContent(document: Document, selector: string): string {
  return (
    document.querySelector<HTMLMetaElement>(selector)?.content.trim() ?? ''
  );
}

function extractMetadata(html: string, fallbackTitle: string): LinkMetadata {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const title =
    getMetaContent(document, 'meta[property="og:title"]') ||
    document.querySelector('title')?.textContent?.trim() ||
    fallbackTitle;
  const description =
    getMetaContent(document, 'meta[name="description"]') ||
    getMetaContent(document, 'meta[property="og:description"]');

  return {
    title,
    ...(description && {description}),
  };
}

function trimText(text: string, length = 128): string {
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

export default function ExternalResourceLink({
  children,
  className,
  href,
  hostname,
  ...linkProps
}: ExternalResourceLinkProps): ReactNode {
  const fallbackTitle = useMemo(
    () => getPlainText(children) || hostname,
    [children, hostname],
  );
  const fallbackDescription = useMemo(() => getReadablePath(href), [href]);
  const [shouldLoadMetadata, setShouldLoadMetadata] = useState(false);
  const [metadataState, setMetadataState] = useState<MetadataState>(() => {
    if (!metadataCache.has(href)) {
      return 'idle';
    }

    return metadataCache.get(href) ? 'ready' : 'blocked';
  });
  const [metadata, setMetadata] = useState<LinkMetadata | null>(
    () => metadataCache.get(href) ?? null,
  );
  const {onFocus, onMouseEnter, onTouchStart, ...restLinkProps} = linkProps;
  const requestMetadata = () => setShouldLoadMetadata(true);

  useEffect(() => {
    if (!shouldLoadMetadata) {
      return undefined;
    }

    if (metadataCache.has(href)) {
      setMetadata(metadataCache.get(href) ?? null);
      setMetadataState(metadataCache.get(href) ? 'ready' : 'blocked');
      return undefined;
    }

    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      metadataCache.set(href, null);
      setMetadata(null);
      setMetadataState('blocked');
      abortController.abort();
    }, 4200);

    setMetadataState('loading');

    fetch(href, {
      credentials: 'omit',
      signal: abortController.signal,
    })
      .then((response) => {
        const contentType = response.headers.get('content-type') ?? '';

        if (!response.ok || !contentType.includes('text/html')) {
          return null;
        }

        return response.text();
      })
      .then((html) => {
        const nextMetadata = html
          ? extractMetadata(html, fallbackTitle)
          : null;

        metadataCache.set(href, nextMetadata);
        setMetadata(nextMetadata);
        setMetadataState(nextMetadata ? 'ready' : 'blocked');
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') {
          return;
        }

        metadataCache.set(href, null);
        setMetadata(null);
        setMetadataState('blocked');
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [fallbackTitle, href, shouldLoadMetadata]);

  const metadataTitle = metadata?.title || fallbackTitle;
  const metadataDescription =
    metadata?.description ||
    (metadataState === 'blocked'
      ? '浏览器无法读取该站点的 head 信息，已显示链接摘要。'
      : fallbackDescription);

  return (
    <Link
      {...restLinkProps}
      href={href}
      className={clsx(className, styles.link)}
      onFocus={(event) => {
        requestMetadata();
        onFocus?.(event);
      }}
      onMouseEnter={(event) => {
        requestMetadata();
        onMouseEnter?.(event);
      }}
      onTouchStart={(event) => {
        requestMetadata();
        onTouchStart?.(event);
      }}>
      <span className={styles.label}>{children}</span>
      <span className={styles.metadataCard} role="tooltip">
        <span className={styles.metadataHost}>{hostname}</span>
        <span className={styles.metadataTitle}>
          {metadataState === 'loading'
            ? '正在读取网页 head 信息...'
            : metadataTitle}
        </span>
        <span className={styles.metadataDescription}>
          {trimText(metadataDescription)}
        </span>
      </span>
    </Link>
  );
}
