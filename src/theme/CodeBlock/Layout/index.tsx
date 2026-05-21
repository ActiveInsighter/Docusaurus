import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {useCodeBlockContext} from '@docusaurus/theme-common/internal';
import Container from '@theme/CodeBlock/Container';
import Content from '@theme/CodeBlock/Content';
import Buttons from '@theme/CodeBlock/Buttons';
import type {Props} from '@theme/CodeBlock/Layout';

import styles from './styles.module.css';

const languageLabels: Record<string, string> = {
  bash: 'Bash',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  diff: 'Diff',
  go: 'Go',
  html: 'HTML',
  java: 'Java',
  javascript: 'JavaScript',
  js: 'JavaScript',
  json: 'JSON',
  jsx: 'JSX',
  markdown: 'Markdown',
  md: 'Markdown',
  mdx: 'MDX',
  mermaid: 'Mermaid',
  powershell: 'PowerShell',
  python: 'Python',
  py: 'Python',
  rust: 'Rust',
  sh: 'Shell',
  shell: 'Shell',
  terminal: 'Terminal',
  sql: 'SQL',
  text: 'Text',
  txt: 'Text',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  yaml: 'YAML',
  yml: 'YAML',
};

function getLanguageLabel(language: string): string {
  return languageLabels[language] ?? language;
}

export default function CodeBlockLayout({className}: Props): ReactNode {
  const {metadata} = useCodeBlockContext();
  const label = metadata.title || getLanguageLabel(metadata.language);

  return (
    <Container as="div" className={clsx(className, metadata.className)}>
      <div className={clsx(styles.toolbar, 'md-code-toolbar')}>
        <div className={clsx(styles.meta, 'md-code-toolbar-meta')}>
          <span
            className={clsx(styles.icon, 'md-code-toolbar-icon')}
            aria-hidden="true">
            <svg
              className={styles.iconSvg}
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true">
              <path d="m9 7-5 5 5 5" />
              <path d="m15 7 5 5-5 5" />
              <path d="m13.5 4-3 16" />
            </svg>
          </span>
          <span className={clsx(styles.label, 'md-code-toolbar-label')}>
            {label}
          </span>
        </div>
        <Buttons className={clsx(styles.actions, 'md-code-toolbar-actions')} />
      </div>
      <div className={styles.codeBlockContent}>
        <Content />
      </div>
    </Container>
  );
}
