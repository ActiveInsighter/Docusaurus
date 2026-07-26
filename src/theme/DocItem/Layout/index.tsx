import React, {type ReactNode, useCallback, useEffect, useState} from 'react';
import clsx from 'clsx';
import {useWindowSize} from '@docusaurus/theme-common';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import DocItemPaginator from '@theme/DocItem/Paginator';
import DocVersionBanner from '@theme/DocVersionBanner';
import DocVersionBadge from '@theme/DocVersionBadge';
import DocItemFooter from '@theme/DocItem/Footer';
import DocItemTOCMobile from '@theme/DocItem/TOC/Mobile';
import DocItemTOCDesktop from '@theme/DocItem/TOC/Desktop';
import DocItemContent from '@theme/DocItem/Content';
import DocBreadcrumbs from '@theme/DocBreadcrumbs';
import ContentVisibility from '@theme/ContentVisibility';
import type {Props} from '@theme/DocItem/Layout';

import styles from './styles.module.css';

const TOC_COLLAPSED_STORAGE_KEY = 'docs.desktopTocCollapsed';

function useDocTOC() {
  const {frontMatter, toc} = useDoc();
  const windowSize = useWindowSize();
  const canRender = !frontMatter.hide_table_of_contents && toc.length > 0;

  return {
    mobile: canRender ? <DocItemTOCMobile /> : undefined,
    desktop:
      canRender && (windowSize === 'desktop' || windowSize === 'ssr') ? (
        <DocItemTOCDesktop />
      ) : undefined,
  };
}

function useDesktopTOCCollapse() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(
        window.localStorage.getItem(TOC_COLLAPSED_STORAGE_KEY) === 'true',
      );
    } catch {
      // Storage may be unavailable in privacy-restricted environments.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(
          TOC_COLLAPSED_STORAGE_KEY,
          String(next),
        );
      } catch {
        // The control should still work even when persistence is unavailable.
      }
      return next;
    });
  }, []);

  return {collapsed, toggle};
}

export default function DocItemLayout({children}: Props): ReactNode {
  const docTOC = useDocTOC();
  const {metadata} = useDoc();
  const {collapsed: tocCollapsed, toggle: toggleToc} =
    useDesktopTOCCollapse();
  const hasDesktopToc = Boolean(docTOC.desktop);

  return (
    <div
      className={clsx(
        'row',
        styles.docRow,
        hasDesktopToc && tocCollapsed && styles.docRowTocCollapsed,
      )}>
      <div
        className={clsx(
          'col',
          hasDesktopToc && !tocCollapsed && styles.docItemCol,
          hasDesktopToc && tocCollapsed && styles.docItemColWide,
        )}>
        <ContentVisibility metadata={metadata} />
        <DocVersionBanner />
        <div className={styles.docItemContainer}>
          <article>
            <DocBreadcrumbs />
            <DocVersionBadge />
            {docTOC.mobile}
            <DocItemContent>{children}</DocItemContent>
            <DocItemFooter />
          </article>
          <DocItemPaginator />
        </div>
      </div>

      {hasDesktopToc && (
        <aside
          className={clsx(
            'col',
            styles.tocColumn,
            tocCollapsed && styles.tocColumnCollapsed,
          )}
          aria-label="本页目录">
          <div className={styles.tocPanel}>
            <button
              type="button"
              className={styles.tocToggle}
              onClick={toggleToc}
              aria-expanded={!tocCollapsed}
              aria-controls="doc-page-table-of-contents"
              aria-label={tocCollapsed ? '展开本页目录' : '收起本页目录'}
              title={tocCollapsed ? '展开本页目录' : '收起本页目录'}>
              <span
                className={clsx(
                  styles.tocToggleIcon,
                  tocCollapsed && styles.tocToggleIconCollapsed,
                )}
                aria-hidden="true"
              />
            </button>

            <div
              id="doc-page-table-of-contents"
              className={styles.tocContent}
              hidden={tocCollapsed}>
              {docTOC.desktop}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
