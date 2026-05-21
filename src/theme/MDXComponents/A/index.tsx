import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import {useAnchorTargetClassName} from '@docusaurus/theme-common';
import ExternalResourceLink from '@site/src/components/ExternalResourceLink';
import type {Props} from '@theme/MDXComponents/A';

const absoluteHttpUrlPattern = /^https?:\/\//i;

function getExternalHostname(href: Props['href']): string | undefined {
  if (!href || !absoluteHttpUrlPattern.test(href)) {
    return undefined;
  }

  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function hasMediaChild(children: ReactNode): boolean {
  return React.Children.toArray(children).some((child) => {
    if (!React.isValidElement(child)) {
      return false;
    }

    return child.type === 'img';
  });
}

export default function MDXA(props: Props): ReactNode {
  const {children, className, href, ...linkProps} = props;
  const anchorTargetClassName = useAnchorTargetClassName(props.id);
  const linkClassName = clsx(anchorTargetClassName, className);
  const externalHostname = getExternalHostname(href);

  if (
    !href ||
    !externalHostname ||
    props['data-footnote-ref'] ||
    hasMediaChild(children)
  ) {
    return (
      <Link {...linkProps} href={href} className={linkClassName}>
        {children}
      </Link>
    );
  }

  return (
    <ExternalResourceLink
      {...linkProps}
      href={href}
      className={linkClassName}
      hostname={externalHostname}>
      {children}
    </ExternalResourceLink>
  );
}
