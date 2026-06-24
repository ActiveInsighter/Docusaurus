import React, { type ReactNode } from 'react';
import clsx from 'clsx';

import AlgoCanvas from '../core/AlgoCanvas';
import { createPath } from '../core/geometry';
import type {
  DiagramBackground,
  EndCap,
  LinearMode,
  LinearOperation,
  LinearPointer,
  LinearRange,
  MarkerIds,
  NodeShape,
  NodeStatus,
  Point,
} from '../core/types';
import styles from '../styles.module.css';

export type LinearDiagramProps = {
  values: ReactNode[];
  mode?: LinearMode;
  orientation?: 'horizontal' | 'vertical';
  width?: number;
  height?: number;
  background?: DiagramBackground;
  startCap?: EndCap;
  endCap?: EndCap;
  showIndex?: boolean;
  indexBase?: number;
  activeIndices?: number[];
  mutedIndices?: number[];
  ranges?: LinearRange[];
  pointers?: LinearPointer[];
  operations?: LinearOperation[];
  cellShape?: NodeShape;
  cellSize?: number | { width: number; height: number };
  gap?: number;
  className?: string;
  ariaLabel?: string;
  children?: (context: LinearDiagramContext) => ReactNode;
};

type ResolvedLinearCell = {
  index: number;
  value: ReactNode;
  x: number;
  y: number;
  width: number;
  height: number;
  status: NodeStatus;
};

type LinearInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type EndLinearOperation = Extract<
  LinearOperation,
  { type: 'push' | 'pop'; side: 'start' | 'end' }
>;

type CellSide = 'top' | 'right' | 'bottom' | 'left';


type RangeLayer = 'fill' | 'outline';

export type LinearDiagramContext = {
  cells: ResolvedLinearCell[];
  getCellCenter: (index: number) => Point;
  getCellAnchor: (
    index: number,
    side: 'top' | 'right' | 'bottom' | 'left' | 'center',
  ) => Point;
  width: number;
  height: number;
};

const cellStatusClass: Record<NodeStatus, string | undefined> = {
  default: undefined,
  active: styles.cellStatusActive,
  visited: styles.cellStatusSuccess,
  current: styles.cellStatusActive,
  success: styles.cellStatusSuccess,
  warning: styles.cellStatusWarning,
  danger: styles.cellStatusDanger,
  muted: styles.cellStatusMuted,
};

const pointerStatusClass: Record<NodeStatus, string | undefined> = {
  default: undefined,
  active: undefined,
  visited: styles.pointerStatusSuccess,
  current: undefined,
  success: styles.pointerStatusSuccess,
  warning: styles.pointerStatusWarning,
  danger: styles.pointerStatusDanger,
  muted: styles.pointerStatusMuted,
};

const LINEAR_BASE_INSET = 24;
const LINEAR_SIDE_INSET = 48;
const LABEL_SIZE = { width: 92, height: 32 };
const OPERATION_LABEL_SIZE = { width: 104, height: 32 };
const LABEL_GAP = 6;

function hasPointerAt(
  pointers: LinearPointer[],
  position: 'top' | 'right' | 'bottom' | 'left',
): boolean {
  return pointers.some((pointer) => (pointer.position ?? 'top') === position);
}

function getVerticalOperationEdge(
  operation: EndLinearOperation,
  mode: LinearMode,
): 'top' | 'bottom' {
  if (mode === 'stack') {
    return operation.side === 'end' ? 'top' : 'bottom';
  }

  return operation.side === 'start' ? 'top' : 'bottom';
}

function getLinearInsets({
  mode,
  orientation,
  showIndex,
  ranges,
  pointers,
  operations,
  startCap,
  endCap,
}: {
  mode: LinearMode;
  orientation: 'horizontal' | 'vertical';
  showIndex: boolean;
  ranges: LinearRange[];
  pointers: LinearPointer[];
  operations: LinearOperation[];
  startCap: EndCap;
  endCap: EndCap;
}): LinearInsets {
  const hasRangeLabel = ranges.some((range) => range.label);
  const rangeLabelRows = ranges.filter((range) => range.label).length;
  const floatingOperationRows = operations.filter(
    (operation) => operation.type === 'swap' || operation.type === 'move',
  ).length;
  const hasStartOperation = operations.some(
    (operation) => (operation.type === 'push' || operation.type === 'pop') && operation.side === 'start',
  );
  const hasEndOperation = operations.some(
    (operation) => (operation.type === 'push' || operation.type === 'pop') && operation.side === 'end',
  );

  if (orientation === 'horizontal') {
    return {
      top:
        LINEAR_BASE_INSET +
        (hasRangeLabel ? rangeLabelRows * (LABEL_SIZE.height + LABEL_GAP) : 0) +
        (floatingOperationRows ? floatingOperationRows * (OPERATION_LABEL_SIZE.height + LABEL_GAP) : 0) +
        (hasPointerAt(pointers, 'top') ? 70 : 0),
      right:
        LINEAR_SIDE_INSET +
        (hasPointerAt(pointers, 'right') ? 92 : 0) +
        (hasEndOperation ? 112 : 0) +
        (endCap !== 'closed' && endCap !== 'none' ? 26 : 0),
      bottom:
        LINEAR_BASE_INSET +
        (showIndex ? 30 : 0) +
        (hasPointerAt(pointers, 'bottom') ? 62 : 0),
      left:
        LINEAR_SIDE_INSET +
        (hasPointerAt(pointers, 'left') ? 92 : 0) +
        (hasStartOperation ? 112 : 0) +
        (startCap !== 'closed' && startCap !== 'none' ? 26 : 0),
    };
  }

  const hasTopOperation = operations.some(
    (operation) =>
      (operation.type === 'push' || operation.type === 'pop') &&
      getVerticalOperationEdge(operation, mode) === 'top',
  );
  const hasBottomOperation = operations.some(
    (operation) =>
      (operation.type === 'push' || operation.type === 'pop') &&
      getVerticalOperationEdge(operation, mode) === 'bottom',
  );

  return {
    top:
      LINEAR_BASE_INSET +
      (hasPointerAt(pointers, 'top') ? 62 : 0) +
      (hasTopOperation ? 82 : 0) +
      (endCap !== 'closed' && endCap !== 'none' ? 18 : 0),
    right: LINEAR_SIDE_INSET + (hasPointerAt(pointers, 'right') ? 104 : 0),
    bottom:
      LINEAR_BASE_INSET +
      (hasPointerAt(pointers, 'bottom') ? 62 : 0) +
      (hasBottomOperation ? 82 : 0) +
      (startCap !== 'closed' && startCap !== 'none' ? 18 : 0),
    left: LINEAR_SIDE_INSET + (hasPointerAt(pointers, 'left') ? 104 : 0),
  };
}

function getDefaultOrientation(
  mode: LinearMode,
  orientation?: 'horizontal' | 'vertical',
): 'horizontal' | 'vertical' {
  if (orientation) {
    return orientation;
  }

  return mode === 'stack' || mode === 'dp-column' ? 'vertical' : 'horizontal';
}

function getDefaultCaps(mode: LinearMode, startCap?: EndCap, endCap?: EndCap): {
  startCap: EndCap;
  endCap: EndCap;
} {
  if (startCap || endCap) {
    return {
      startCap: startCap ?? 'closed',
      endCap: endCap ?? 'closed',
    };
  }

  if (mode === 'queue' || mode === 'deque') {
    return { startCap: 'open', endCap: 'open' };
  }

  if (mode === 'stack') {
    return { startCap: 'closed', endCap: 'open' };
  }

  return { startCap: 'closed', endCap: 'closed' };
}

function getCellSize(
  cellSize: LinearDiagramProps['cellSize'],
  mode: LinearMode,
): { width: number; height: number } {
  if (typeof cellSize === 'number') {
    return { width: cellSize, height: cellSize };
  }

  if (cellSize) {
    return cellSize;
  }

  if (mode === 'string') {
    return { width: 46, height: 48 };
  }

  if (mode === 'stack') {
    return { width: 82, height: 46 };
  }

  return { width: 58, height: 52 };
}

function getCanvasSize(
  count: number,
  orientation: 'horizontal' | 'vertical',
  cellSize: { width: number; height: number },
  gap: number,
  insets: LinearInsets,
  width?: number,
  height?: number,
): { width: number; height: number } {
  const trackLength =
    count === 0
      ? 0
      : orientation === 'horizontal'
        ? count * cellSize.width + Math.max(0, count - 1) * gap
        : count * cellSize.height + Math.max(0, count - 1) * gap;

  if (orientation === 'horizontal') {
    const minWidth = insets.left + trackLength + insets.right;
    const minHeight = insets.top + cellSize.height + insets.bottom;

    return {
      width: width ? Math.max(width, minWidth) : Math.max(520, minWidth),
      height: height ? Math.max(height, minHeight) : Math.max(220, minHeight),
    };
  }

  const minWidth = insets.left + cellSize.width + insets.right;
  const minHeight = insets.top + trackLength + insets.bottom;

  return {
    width: width ? Math.max(width, minWidth) : Math.max(320, minWidth),
    height: height ? Math.max(height, minHeight) : Math.max(300, minHeight),
  };
}

function resolveCells({
  values,
  mode,
  orientation,
  cellSize,
  gap,
  width,
  height,
  insets,
  activeIndices,
  mutedIndices,
  ranges,
}: {
  values: ReactNode[];
  mode: LinearMode;
  orientation: 'horizontal' | 'vertical';
  cellSize: { width: number; height: number };
  gap: number;
  width: number;
  height: number;
  insets: LinearInsets;
  activeIndices: number[];
  mutedIndices: number[];
  ranges: LinearRange[];
}): ResolvedLinearCell[] {
  const activeSet = new Set(activeIndices);
  const mutedSet = new Set(mutedIndices);
  const rangeStatusByIndex = new Map<number, NodeStatus>();

  for (const range of ranges) {
    const from = Math.min(range.from, range.to);
    const to = Math.max(range.from, range.to);
    const status: NodeStatus =
      range.status === 'danger'
        ? 'danger'
        : range.status === 'warning'
          ? 'warning'
          : range.status === 'success'
            ? 'success'
            : 'active';

    for (let index = from; index <= to; index += 1) {
      rangeStatusByIndex.set(index, status);
    }
  }

  if (orientation === 'horizontal') {
    const trackWidth = values.length * cellSize.width + Math.max(0, values.length - 1) * gap;
    const contentWidth = Math.max(trackWidth, width - insets.left - insets.right);
    const startX = insets.left + (contentWidth - trackWidth) / 2 + cellSize.width / 2;
    const y = insets.top + cellSize.height / 2;

    return values.map((value, index) => ({
      index,
      value,
      x: startX + index * (cellSize.width + gap),
      y,
      width: cellSize.width,
      height: cellSize.height,
      status: mutedSet.has(index)
        ? 'muted'
        : activeSet.has(index)
          ? 'active'
          : rangeStatusByIndex.get(index) ?? 'default',
    }));
  }

  const isStack = mode === 'stack';
  const trackHeight = values.length * cellSize.height + Math.max(0, values.length - 1) * gap;
  const contentHeight = Math.max(trackHeight, height - insets.top - insets.bottom);
  const startY = insets.top + (contentHeight - trackHeight) / 2 + cellSize.height / 2;
  const contentWidth = Math.max(cellSize.width, width - insets.left - insets.right);
  const x = insets.left + contentWidth / 2;

  return values.map((value, index) => {
    const visualIndex = isStack ? values.length - 1 - index : index;

    return {
      index,
      value,
      x,
      y: startY + visualIndex * (cellSize.height + gap),
      width: cellSize.width,
      height: cellSize.height,
      status: mutedSet.has(index)
        ? 'muted'
        : activeSet.has(index)
          ? 'active'
          : rangeStatusByIndex.get(index) ?? 'default',
    };
  });
}

function getCellAnchor(
  cell: ResolvedLinearCell,
  side: 'top' | 'right' | 'bottom' | 'left' | 'center',
): Point {
  if (side === 'top') {
    return { x: cell.x, y: cell.y - cell.height / 2 };
  }

  if (side === 'right') {
    return { x: cell.x + cell.width / 2, y: cell.y };
  }

  if (side === 'bottom') {
    return { x: cell.x, y: cell.y + cell.height / 2 };
  }

  if (side === 'left') {
    return { x: cell.x - cell.width / 2, y: cell.y };
  }

  return { x: cell.x, y: cell.y };
}

function createLinearContext(
  cells: ResolvedLinearCell[],
  width: number,
  height: number,
): LinearDiagramContext {
  const cellByIndex = new Map(cells.map((cell) => [cell.index, cell]));

  return {
    cells,
    getCellCenter: (index) => {
      const cell = cellByIndex.get(index);
      return cell ? { x: cell.x, y: cell.y } : { x: 0, y: 0 };
    },
    getCellAnchor: (index, side) => {
      const cell = cellByIndex.get(index);
      return cell ? getCellAnchor(cell, side) : { x: 0, y: 0 };
    },
    width,
    height,
  };
}

function rangeStatusClass(status: LinearRange['status']): string | undefined {
  if (status === 'success') {
    return styles.rangeStatusSuccess;
  }

  if (status === 'warning') {
    return styles.rangeStatusWarning;
  }

  if (status === 'danger') {
    return styles.rangeStatusDanger;
  }

  return undefined;
}

function getRangeBounds(
  range: LinearRange,
  context: LinearDiagramContext,
): { x1: number; x2: number; y1: number; y2: number } | null {
  const from = context.cells.find((cell) => cell.index === range.from);
  const to = context.cells.find((cell) => cell.index === range.to);

  if (!from || !to) {
    return null;
  }

  return {
    x1: Math.min(from.x - from.width / 2, to.x - to.width / 2) - 7,
    x2: Math.max(from.x + from.width / 2, to.x + to.width / 2) + 7,
    y1: Math.min(from.y - from.height / 2, to.y - to.height / 2) - 7,
    y2: Math.max(from.y + from.height / 2, to.y + to.height / 2) + 7,
  };
}

function renderRanges(
  ranges: LinearRange[],
  context: LinearDiagramContext,
  orientation: 'horizontal' | 'vertical',
  layer: RangeLayer,
): ReactNode {
  let labelLane = 0;

  return ranges.map((range, index) => {
    const bounds = getRangeBounds(range, context);

    if (!bounds) {
      return null;
    }

    const { x1, x2, y1, y2 } = bounds;
    const currentLabelLane = range.label ? labelLane++ : 0;
    const shouldRenderLabel = layer === 'outline' && range.label;

    return (
      <g key={`range-${layer}-${index}`} className={rangeStatusClass(range.status)}>
        <rect
          className={clsx(
            styles.rangeShape,
            layer === 'fill' ? styles.rangeFill : styles.rangeOutline,
          )}
          x={x1}
          y={y1}
          width={x2 - x1}
          height={y2 - y1}
          rx={9}
        />
        {shouldRenderLabel && (
          <foreignObject
            x={orientation === 'horizontal' ? (x1 + x2) / 2 - LABEL_SIZE.width / 2 : x2 + 10}
            y={
              orientation === 'horizontal'
                ? y1 - (currentLabelLane + 1) * (LABEL_SIZE.height + LABEL_GAP)
                : (y1 + y2) / 2 - LABEL_SIZE.height / 2 +
                currentLabelLane * (LABEL_SIZE.height + LABEL_GAP)
            }
            width={LABEL_SIZE.width}
            height={LABEL_SIZE.height}>
            <div className={styles.labelPill}>
              {range.label}
            </div>
          </foreignObject>
        )}
      </g>
    );
  });
}

function renderCellShape(
  cell: ResolvedLinearCell,
  shape: NodeShape,
  mode: LinearMode,
  openSides: CellSide[] = [],
): ReactNode {
  const x = cell.x - cell.width / 2;
  const y = cell.y - cell.height / 2;

  if (shape === 'circle') {
    return <circle className={styles.cellShape} cx={cell.x} cy={cell.y} r={Math.min(cell.width, cell.height) / 2} />;
  }

  const rx =
    shape === 'pill'
      ? cell.height / 2
      : shape === 'rounded' || mode === 'memory'
        ? 8
        : 0;

  if (openSides.length > 0) {
    const open = new Set(openSides);
    const paths = [
      !open.has('top') && `M ${x + rx} ${y} H ${x + cell.width - rx}`,
      !open.has('right') && `M ${x + cell.width} ${y + rx} V ${y + cell.height - rx}`,
      !open.has('bottom') && `M ${x + cell.width - rx} ${y + cell.height} H ${x + rx}`,
      !open.has('left') && `M ${x} ${y + cell.height - rx} V ${y + rx}`,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <>
        <rect
          className={styles.cellShape}
          x={x}
          y={y}
          width={cell.width}
          height={cell.height}
          rx={rx}
          style={{ stroke: 'none' }}
        />
        <path className={styles.cellShape} d={paths} style={{ fill: 'none' }} />
      </>
    );
  }

  return <rect className={styles.cellShape} x={x} y={y} width={cell.width} height={cell.height} rx={rx} />;
}

function capOpensCell(cap: EndCap): boolean {
  return cap !== 'closed' && cap !== 'none';
}

function getCapCellSide(
  capSide: 'start' | 'end',
  orientation: 'horizontal' | 'vertical',
  mode: LinearMode,
): CellSide {
  if (orientation === 'horizontal') {
    return capSide === 'start' ? 'left' : 'right';
  }

  if (mode === 'stack') {
    return capSide === 'end' ? 'top' : 'bottom';
  }

  return capSide === 'start' ? 'top' : 'bottom';
}

function getOpenSidesForCell(
  cell: ResolvedLinearCell,
  cells: ResolvedLinearCell[],
  orientation: 'horizontal' | 'vertical',
  mode: LinearMode,
  startCap: EndCap,
  endCap: EndCap,
): CellSide[] {
  const ordered = cells.slice().sort((a, b) => a.index - b.index);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const openSides: CellSide[] = [];

  if (first && cell.index === first.index && capOpensCell(startCap)) {
    openSides.push(getCapCellSide('start', orientation, mode));
  }

  if (last && cell.index === last.index && capOpensCell(endCap)) {
    openSides.push(getCapCellSide('end', orientation, mode));
  }

  return openSides;
}

function renderCells(
  cells: ResolvedLinearCell[],
  mode: LinearMode,
  showIndex: boolean,
  indexBase: number,
  cellShape: NodeShape,
  orientation: 'horizontal' | 'vertical',
  startCap: EndCap,
  endCap: EndCap,
): ReactNode {
  return cells.map((cell) => (
    <g key={cell.index} className={clsx(styles.cell, cellStatusClass[cell.status])}>
      {renderCellShape(
        cell,
        cellShape,
        mode,
        getOpenSidesForCell(cell, cells, orientation, mode, startCap, endCap),
      )}
      <foreignObject x={cell.x - cell.width / 2} y={cell.y - cell.height / 2} width={cell.width} height={cell.height}>
        <div className={styles.cellContent}>
          {cell.value}
        </div>
      </foreignObject>
      {showIndex && (
        <text
          className={styles.indexLabel}
          x={orientation === 'horizontal' ? cell.x : cell.x - cell.width / 2 - 12}
          y={orientation === 'horizontal' ? cell.y + cell.height / 2 + 20 : cell.y + 4}
          textAnchor={orientation === 'horizontal' ? 'middle' : 'end'}>
          {cell.index + indexBase}
        </text>
      )}
    </g>
  ));
}

function renderCap(
  cap: EndCap,
  side: 'start' | 'end',
  cells: ResolvedLinearCell[],
  orientation: 'horizontal' | 'vertical',
  mode: LinearMode,
  markerIds: MarkerIds,
): ReactNode {
  if (cap === 'closed' || cap === 'open' || cap === 'none' || cells.length === 0) {
    return null;
  }

  const ordered = cells.slice().sort((a, b) => a.index - b.index);
  const target = side === 'start' ? ordered[0] : ordered[ordered.length - 1];
  const anchorSide =
    orientation === 'horizontal'
      ? side === 'start'
        ? 'left'
        : 'right'
      : mode === 'stack'
        ? side === 'end'
          ? 'top'
          : 'bottom'
        : side === 'start'
          ? 'top'
          : 'bottom';
  const anchor = getCellAnchor(target, anchorSide);
  const sign = side === 'start' ? -1 : 1;

  if (orientation === 'horizontal') {
    const x = anchor.x;
    const y = anchor.y;
    const y1 = target.y - target.height / 2;
    const y2 = target.y + target.height / 2;

    if (cap === 'arrow') {
      return (
        <path
          className={styles.capLine}
          d={`M ${x + sign * 34} ${y} L ${x + sign * 5} ${y}`}
          markerEnd={`url(#${markerIds.muted})`}
        />
      );
    }

    if (cap === 'fade') {
      return (
        <rect
          className={styles.capFade}
          x={side === 'start' ? x - 26 : x + 2}
          y={y1 - 2}
          width={24}
          height={target.height + 4}
        />
      );
    }

    return (
      <path
        className={styles.capLine}
        d={`M ${x} ${y1} L ${x + sign * 18} ${y1} M ${x} ${y2} L ${x + sign * 18
          } ${y2}`}
      />
    );
  }

  const x = anchor.x;
  const y = anchor.y;
  const x1 = target.x - target.width / 2;
  const x2 = target.x + target.width / 2;
  const verticalSign = anchorSide === 'top' ? -1 : 1;

  if (cap === 'arrow') {
    return (
      <path
        className={styles.capLine}
        d={`M ${x} ${y + verticalSign * 34} L ${x} ${y + verticalSign * 5}`}
        markerEnd={`url(#${markerIds.muted})`}
      />
    );
  }

  if (cap === 'fade') {
    return (
      <rect
        className={styles.capFade}
        x={x1 - 2}
        y={anchorSide === 'top' ? y - 26 : y + 2}
        width={target.width + 4}
        height={24}
      />
    );
  }

  return (
    <path
      className={styles.capLine}
      d={`M ${x1} ${y} L ${x1} ${y + verticalSign * 18} M ${x2} ${y} L ${x2} ${y + verticalSign * 18
        }`}
    />
  );
}

function renderPointer(
  pointer: LinearPointer,
  context: LinearDiagramContext,
  markerIds: MarkerIds,
): ReactNode {
  const cell = context.cells.find((item) => item.index === pointer.index);

  if (!cell) {
    return null;
  }

  const position = pointer.position ?? 'top';
  const anchor = getCellAnchor(cell, position);
  const distance = position === 'top' || position === 'bottom' ? 62 : 66;
  const labelSize = LABEL_SIZE;
  const labelPoint =
    position === 'top'
      ? { x: anchor.x, y: anchor.y - distance }
      : position === 'bottom'
        ? { x: anchor.x, y: anchor.y + distance }
        : position === 'left'
          ? { x: anchor.x - distance, y: anchor.y }
          : { x: anchor.x + distance, y: anchor.y };
  const lineStart =
    position === 'top'
      ? { x: labelPoint.x, y: labelPoint.y + labelSize.height / 2 }
      : position === 'bottom'
        ? { x: labelPoint.x, y: labelPoint.y - labelSize.height / 2 }
        : position === 'left'
          ? { x: labelPoint.x + labelSize.width / 2, y: labelPoint.y }
          : { x: labelPoint.x - labelSize.width / 2, y: labelPoint.y };

  return (
    <g key={`pointer-${String(pointer.label)}-${pointer.index}`} className={pointerStatusClass[pointer.status ?? 'active']}>
      <path
        className={styles.pointerLine}
        d={createPath(lineStart, anchor, 'straight')}
        markerEnd={`url(#${markerIds.active})`}
      />
      <foreignObject x={labelPoint.x - labelSize.width / 2} y={labelPoint.y - labelSize.height / 2} width={labelSize.width} height={labelSize.height}>
        <div className={styles.pointerLabel}>
          {pointer.label}
        </div>
      </foreignObject>
    </g>
  );
}

function getOperationPoint(
  side: 'start' | 'end',
  cells: ResolvedLinearCell[],
  orientation: 'horizontal' | 'vertical',
  mode: LinearMode,
): Point | null {
  if (cells.length === 0) {
    return null;
  }

  if (orientation === 'horizontal') {
    const ordered = cells.slice().sort((a, b) => a.index - b.index);
    const cell = side === 'start' ? ordered[0] : ordered[ordered.length - 1];
    return getCellAnchor(cell, side === 'start' ? 'left' : 'right');
  }

  const ordered = cells.slice().sort((a, b) => a.index - b.index);
  const cell = side === 'start' ? ordered[0] : ordered[ordered.length - 1];

  if (mode === 'stack') {
    return getCellAnchor(cell, side === 'end' ? 'top' : 'bottom');
  }

  return getCellAnchor(cell, side === 'start' ? 'top' : 'bottom');
}

function getOperationTargetCell(
  side: 'start' | 'end',
  cells: ResolvedLinearCell[],
): ResolvedLinearCell | null {
  if (cells.length === 0) {
    return null;
  }

  const ordered = cells.slice().sort((a, b) => a.index - b.index);
  return side === 'start' ? ordered[0] : ordered[ordered.length - 1];
}

function renderOperation(
  operation: LinearOperation,
  context: LinearDiagramContext,
  orientation: 'horizontal' | 'vertical',
  mode: LinearMode,
  markerIds: MarkerIds,
  operationIndex = 0,
): ReactNode {
  if (operation.type === 'push' || operation.type === 'pop') {
    const anchor = getOperationPoint(operation.side, context.cells, orientation, mode);
    if (!anchor) {
      return null;
    }

    const direction = operation.side === 'start' ? -1 : 1;
    const isPush = operation.type === 'push';
    let operationAnchor = anchor;
    let external: Point;
    let labelPoint: Point;

    if (orientation === 'vertical') {
      const targetCell = getOperationTargetCell(operation.side, context.cells);
      const verticalEdge = getVerticalOperationEdge(operation, mode);
      const verticalSign = verticalEdge === 'top' ? -1 : 1;
      const laneSign = isPush ? -1 : 1;
      const laneOffset = laneSign * Math.min(28, (targetCell?.width ?? 82) * 0.32);

      operationAnchor = { x: anchor.x + laneOffset, y: anchor.y };
      external = { x: operationAnchor.x, y: operationAnchor.y + verticalSign * 76 };
      labelPoint = {
        x: operationAnchor.x,
        y: external.y + verticalSign * (OPERATION_LABEL_SIZE.height / 2 + 4),
      };
    } else {
      external = { x: anchor.x + direction * 76, y: anchor.y };
      labelPoint = midpointForOperation(external, anchor, orientation, operation.side, operationIndex);
    }

    const from = isPush ? external : operationAnchor;
    const to = isPush ? operationAnchor : external;

    return (
      <g key={`${operation.type}-${operation.side}`}>
        <path className={styles.operationLine} d={createPath(from, to, 'straight')} markerEnd={`url(#${markerIds.active})`} />
        {operation.label && (
          <foreignObject
            x={labelPoint.x - OPERATION_LABEL_SIZE.width / 2}
            y={labelPoint.y - OPERATION_LABEL_SIZE.height / 2}
            width={OPERATION_LABEL_SIZE.width}
            height={OPERATION_LABEL_SIZE.height}>
            <div className={styles.operationLabel}>
              {operation.label}
            </div>
          </foreignObject>
        )}
      </g>
    );
  }

  const fromCell = context.cells.find((cell) => cell.index === operation.from);
  const toCell = context.cells.find((cell) => cell.index === operation.to);

  if (!fromCell || !toCell) {
    return null;
  }

  const from =
    orientation === 'horizontal'
      ? getCellAnchor(fromCell, 'top')
      : getCellAnchor(fromCell, 'right');
  const to =
    orientation === 'horizontal'
      ? getCellAnchor(toCell, 'top')
      : getCellAnchor(toCell, 'right');
  const labelPoint = {
    x: (from.x + to.x) / 2,
    y:
      orientation === 'horizontal'
        ? Math.min(from.y, to.y) -
        (OPERATION_LABEL_SIZE.height + LABEL_GAP) * (operationIndex + 1)
        : (from.y + to.y) / 2,
  };

  return (
    <g key={`${operation.type}-${operation.from}-${operation.to}`}>
      <path className={styles.operationLine} d={createPath(from, to, 'curve')} markerEnd={`url(#${markerIds.active})`} />
      {operation.label && (
        <foreignObject
          x={labelPoint.x - OPERATION_LABEL_SIZE.width / 2}
          y={labelPoint.y - OPERATION_LABEL_SIZE.height / 2}
          width={OPERATION_LABEL_SIZE.width}
          height={OPERATION_LABEL_SIZE.height}>
          <div className={styles.operationLabel}>
            {operation.label}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

function midpointForOperation(
  from: Point,
  to: Point,
  orientation: 'horizontal' | 'vertical',
  side: 'start' | 'end',
  lane = 0,
): Point {
  if (orientation === 'vertical') {
    return {
      x: (from.x + to.x) / 2 - 68 - lane * (OPERATION_LABEL_SIZE.width * 0.82),
      y: (from.y + to.y) / 2,
    };
  }

  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 + (side === 'start' ? -32 : -32) -
      lane * (OPERATION_LABEL_SIZE.height + LABEL_GAP),
  };
}

function defaultCellShape(mode: LinearMode, cellShape?: NodeShape): NodeShape {
  if (cellShape) {
    return cellShape;
  }

  if (mode === 'string') {
    return 'cell';
  }

  if (mode === 'memory') {
    return 'rounded';
  }

  return 'cell';
}

export default function LinearDiagram({
  values,
  mode = 'array',
  orientation,
  width,
  height,
  background = 'dots',
  startCap,
  endCap,
  showIndex = mode === 'array' || mode === 'string' || mode === 'memory',
  indexBase = 0,
  activeIndices = [],
  mutedIndices = [],
  ranges = [],
  pointers = [],
  operations = [],
  cellShape,
  cellSize,
  gap = 0,
  className,
  ariaLabel = 'Algorithm linear diagram',
  children,
}: LinearDiagramProps): ReactNode {
  const actualOrientation = getDefaultOrientation(mode, orientation);
  const actualCellSize = getCellSize(cellSize, mode);
  const caps = getDefaultCaps(mode, startCap, endCap);
  const insets = getLinearInsets({
    mode,
    orientation: actualOrientation,
    showIndex,
    ranges,
    pointers,
    operations,
    startCap: caps.startCap,
    endCap: caps.endCap,
  });
  const size = getCanvasSize(
    values.length,
    actualOrientation,
    actualCellSize,
    gap,
    insets,
    width,
    height,
  );
  const cells = resolveCells({
    values,
    mode,
    orientation: actualOrientation,
    cellSize: actualCellSize,
    gap,
    width: size.width,
    height: size.height,
    insets,
    activeIndices,
    mutedIndices,
    ranges,
  });
  const context = createLinearContext(cells, size.width, size.height);
  const actualCellShape = defaultCellShape(mode, cellShape);
  const rangeLabelLaneOffset = ranges.filter((range) => range.label).length;

  return (
    <AlgoCanvas
      width={size.width}
      height={size.height}
      background={background}
      className={className}
      ariaLabel={ariaLabel}>
      {({ markerIds }) => (
        <>
          <g>{renderRanges(ranges, context, actualOrientation, 'fill')}</g>
          <g>
            {renderCells(
              cells,
              mode,
              showIndex,
              indexBase,
              actualCellShape,
              actualOrientation,
              caps.startCap,
              caps.endCap,
            )}
          </g>
          <g>{renderRanges(ranges, context, actualOrientation, 'outline')}</g>
          <g>
            {renderCap(caps.startCap, 'start', cells, actualOrientation, mode, markerIds)}
            {renderCap(caps.endCap, 'end', cells, actualOrientation, mode, markerIds)}
          </g>
          <g>{pointers.map((pointer) => renderPointer(pointer, context, markerIds))}</g>
          <g>
            {operations.map((operation, index) =>
              renderOperation(
                operation,
                context,
                actualOrientation,
                mode,
                markerIds,
                index + rangeLabelLaneOffset,
              ),
            )}
          </g>
          {children?.(context)}
        </>
      )}
    </AlgoCanvas>
  );
}
