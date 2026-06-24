import React, {useEffect, useRef, useState, type ReactNode} from 'react';
import {useColorMode} from '@docusaurus/theme-common';
import clsx from 'clsx';

import styles from './styles.module.css';

type MermaidBindFunctions = (element: Element) => void;

type RenderState =
  | {status: 'loading'; svg: null; error: null}
  | {status: 'ready'; svg: string; error: null}
  | {status: 'error'; svg: null; error: string};

type Props = {
  chart: string;
  className?: string;
  ariaLabel?: string;
};

function createMermaidId(): string {
  return `docs-mermaid-${Math.round(Math.random() * 10000000)}`;
}

export default function MermaidDiagram({
  chart,
  className,
  ariaLabel = 'Mermaid diagram',
}: Props): ReactNode {
  const {colorMode} = useColorMode();
  const containerRef = useRef<HTMLDivElement>(null);
  const bindFunctionsRef = useRef<MermaidBindFunctions | undefined>(undefined);
  const idRef = useRef(createMermaidId());
  const [renderState, setRenderState] = useState<RenderState>({
    status: 'loading',
    svg: null,
    error: null,
  });

  useEffect(() => {
    let isCurrent = true;

    async function renderDiagram() {
      setRenderState({status: 'loading', svg: null, error: null});

      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: colorMode === 'dark' ? 'dark' : 'default',
        });

        const result = await mermaid.render(idRef.current, chart);

        if (!isCurrent) {
          return;
        }

        bindFunctionsRef.current = result.bindFunctions;
        setRenderState({status: 'ready', svg: result.svg, error: null});
      } catch (error) {
        document.querySelector(`#d${idRef.current}`)?.remove();

        if (!isCurrent) {
          return;
        }

        setRenderState({
          status: 'error',
          svg: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    renderDiagram();

    return () => {
      isCurrent = false;
    };
  }, [chart, colorMode]);

  useEffect(() => {
    if (renderState.status !== 'ready' || !containerRef.current) {
      return;
    }

    bindFunctionsRef.current?.(containerRef.current);
  }, [renderState]);

  if (renderState.status === 'error') {
    return (
      <pre className={clsx(styles.message, styles.error, className)}>
        Mermaid 渲染失败：{renderState.error}
      </pre>
    );
  }

  if (renderState.status === 'loading') {
    return (
      <div className={clsx(styles.message, className)} role="status">
        Mermaid 图表渲染中...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={clsx(styles.diagram, className)}
      role="img"
      aria-label={ariaLabel}
      // Mermaid returns sanitized SVG markup.
      dangerouslySetInnerHTML={{__html: renderState.svg}}
    />
  );
}
