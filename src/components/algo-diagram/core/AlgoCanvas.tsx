import React, {useId, type ReactNode} from 'react';
import clsx from 'clsx';

import styles from '../styles.module.css';
import type {
  CanvasRenderContext,
  DiagramBackground,
  MarkerIds,
} from './types';

type AlgoCanvasProps = {
  width: number;
  height: number;
  background?: DiagramBackground;
  className?: string;
  ariaLabel?: string;
  minWidth?: number;
  children: ReactNode | ((context: CanvasRenderContext) => ReactNode);
};

function createScopedId(prefix: string, suffix: string): string {
  return `${prefix}-${suffix}`;
}

function renderBackground(
  background: DiagramBackground,
  width: number,
  height: number,
  idPrefix: string,
): ReactNode {
  if (background === 'none') {
    return null;
  }

  const patternId = createScopedId(idPrefix, background);

  return (
    <>
      <rect
        className={styles.canvasBackground}
        x={0}
        y={0}
        width={width}
        height={height}
        rx={0}
      />
      {background !== 'plain' && (
        <rect x={0} y={0} width={width} height={height} fill={`url(#${patternId})`} />
      )}
    </>
  );
}

function renderDefs(idPrefix: string, background: DiagramBackground): ReactNode {
  const markerIds: MarkerIds = {
    default: createScopedId(idPrefix, 'arrow-default'),
    active: createScopedId(idPrefix, 'arrow-active'),
    success: createScopedId(idPrefix, 'arrow-success'),
    warning: createScopedId(idPrefix, 'arrow-warning'),
    danger: createScopedId(idPrefix, 'arrow-danger'),
    muted: createScopedId(idPrefix, 'arrow-muted'),
  };

  const patternId = createScopedId(idPrefix, background);

  return (
    <defs>
      {Object.entries(markerIds).map(([status, id]) => (
        <marker
          key={id}
          id={id}
          viewBox="0 0 12 12"
          refX="10"
          refY="6"
          markerWidth="9"
          markerHeight="9"
          orient="auto-start-reverse">
          <path
            className={clsx(
              styles.marker,
              status === 'active' && styles.markerActive,
              status === 'success' && styles.markerSuccess,
              status === 'warning' && styles.markerWarning,
              status === 'danger' && styles.markerDanger,
              status === 'muted' && styles.markerMuted,
            )}
            d="M 2 2 L 10 6 L 2 10"
          />
        </marker>
      ))}

      {background === 'dots' && (
        <pattern id={patternId} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle className={styles.patternDot} cx="2" cy="2" r="1.15" />
        </pattern>
      )}

      {background === 'grid' && (
        <pattern id={patternId} width="28" height="28" patternUnits="userSpaceOnUse">
          <path className={styles.patternLine} d="M 28 0 L 0 0 0 28" />
        </pattern>
      )}

      {background === 'lines' && (
        <pattern id={patternId} width="34" height="34" patternUnits="userSpaceOnUse">
          <path className={styles.patternLine} d="M 0 17 H 34" />
        </pattern>
      )}

      {background === 'matrix' && (
        <pattern id={patternId} width="44" height="44" patternUnits="userSpaceOnUse">
          <path className={styles.patternLine} d="M 44 0 L 0 0 0 44" />
          <path className={styles.patternLineSoft} d="M 22 0 V 44 M 0 22 H 44" />
        </pattern>
      )}

      {background === 'blueprint' && (
        <pattern id={patternId} width="48" height="48" patternUnits="userSpaceOnUse">
          <path className={styles.patternLineSoft} d="M 48 0 L 0 0 0 48" />
          <path className={styles.patternLine} d="M 0 24 H 48 M 24 0 V 48" />
          <circle className={styles.patternDot} cx="24" cy="24" r="1.25" />
        </pattern>
      )}
    </defs>
  );
}

export default function AlgoCanvas({
  width,
  height,
  background = 'dots',
  className,
  ariaLabel = 'Algorithm diagram',
  minWidth,
  children,
}: AlgoCanvasProps): ReactNode {
  const rawId = useId();
  const idPrefix = `algo-${rawId.replace(/:/g, '')}`;
  const markerIds: MarkerIds = {
    default: createScopedId(idPrefix, 'arrow-default'),
    active: createScopedId(idPrefix, 'arrow-active'),
    success: createScopedId(idPrefix, 'arrow-success'),
    warning: createScopedId(idPrefix, 'arrow-warning'),
    danger: createScopedId(idPrefix, 'arrow-danger'),
    muted: createScopedId(idPrefix, 'arrow-muted'),
  };

  return (
    <div className={clsx(styles.frame, className)}>
      <svg
        className={styles.svg}
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        style={minWidth ? {minWidth} : undefined}>
        {renderDefs(idPrefix, background)}
        {renderBackground(background, width, height, idPrefix)}
        <g className={styles.diagramContent}>
          {typeof children === 'function' ? children({markerIds}) : children}
        </g>
      </svg>
    </div>
  );
}
