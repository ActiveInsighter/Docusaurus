import React, {useEffect} from 'react';
import OriginalTOCItems from '@theme-original/TOCItems';

type Props = React.ComponentProps<typeof OriginalTOCItems>;

function syncTocHeadingMarkup(): void {
  const tocLinks = document.querySelectorAll<HTMLAnchorElement>(
    '.table-of-contents a[href*="#"]',
  );

  tocLinks.forEach((link) => {
    const hash = link.hash || new URL(link.href, window.location.href).hash;
    if (!hash) return;

    let headingId: string;
    try {
      headingId = decodeURIComponent(hash.slice(1));
    } catch {
      headingId = hash.slice(1);
    }

    const heading = document.getElementById(headingId);
    if (!heading) return;

    const clone = heading.cloneNode(true) as HTMLElement;
    clone
      .querySelectorAll('.hash-link, [aria-hidden="true"]')
      .forEach((element) => element.remove());
    clone.querySelectorAll('[id]').forEach((element) => {
      element.removeAttribute('id');
    });

    const markup = clone.innerHTML.trim();
    if (markup && link.innerHTML !== markup) {
      link.innerHTML = markup;
      link.dataset.renderedHeading = 'true';
    }
  });
}

export default function TOCItems(props: Props): React.ReactNode {
  useEffect(() => {
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncTocHeadingMarkup);
    });
    const delayedSync = window.setTimeout(syncTocHeadingMarkup, 160);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.clearTimeout(delayedSync);
    };
  });

  return <OriginalTOCItems {...props} />;
}
