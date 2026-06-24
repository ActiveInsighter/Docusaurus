import React, {type ReactNode} from 'react';
import clsx from 'clsx';

import AlgoCanvas from '../core/AlgoCanvas';
import type {DiagramBackground, NodeStatus, Point} from '../core/types';
import styles from '../styles.module.css';

type MatrixCellStatus = {
  row: number;
  column: number;
  status: NodeStatus;
};

export type MatrixDiagramProps = {
  values: ReactNode[][];
  rowLabels?: ReactNode[];
  columnLabels?: ReactNode[];
  activeCells?: Array<[number, number]>;
  mutedCells?: Array<[number, number]>;
  statusCells?: MatrixCellStatus[];
  highlightRows?: number[];
  highlightColumns?: number[];
  cellSize?: number | {width: number; height: number};
  width?: number;
  height?: number;
  background?: DiagramBackground;
  className?: string;
  ariaLabel?: string;
  children?: (context: MatrixDiagramContext) => ReactNode;
};

type ResolvedMatrixCell = {
  row: number;
  column: number;
  value: ReactNode;
  x: number;
  y: number;
  width: number;
  height: number;
  status: NodeStatus;
};

export type MatrixDiagramContext = {
  cells: ResolvedMatrixCell[];
  getCellCenter: (row: number, column: number) => Point;
  width: number;
  height: number;
};

const MATRIX_PADDING = 56;
const AXIS_SIZE = 44;

const matrixCellStatusClass: Record<NodeStatus, string | undefined> = {
  default: undefined,
  active: styles.matrixCellStatusActive,
  visited: styles.matrixCellStatusSuccess,
  current: styles.matrixCellStatusActive,
  success: styles.matrixCellStatusSuccess,
  warning: styles.matrixCellStatusWarning,
  danger: styles.matrixCellStatusDanger,
  muted: styles.matrixCellStatusMuted,
};

function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function getCellSize(cellSize: MatrixDiagramProps['cellSize']): {
  width: number;
  height: number;
} {
  if (typeof cellSize === 'number') {
    return {width: cellSize, height: cellSize};
  }

  return cellSize ?? {width: 54, height: 46};
}

function resolveMatrix({
  values,
  cellSize,
  width,
  height,
  activeCells,
  mutedCells,
  statusCells,
  highlightRows,
  highlightColumns,
}: {
  values: ReactNode[][];
  cellSize: {width: number; height: number};
  width: number;
  height: number;
  activeCells: Array<[number, number]>;
  mutedCells: Array<[number, number]>;
  statusCells: MatrixCellStatus[];
  highlightRows: number[];
  highlightColumns: number[];
}): ResolvedMatrixCell[] {
  const activeSet = new Set(activeCells.map(([row, column]) => cellKey(row, column)));
  const mutedSet = new Set(mutedCells.map(([row, column]) => cellKey(row, column)));
  const statusMap = new Map(
    statusCells.map((cell): [string, NodeStatus] => [cellKey(cell.row, cell.column), cell.status]),
  );
  const highlightedRows = new Set(highlightRows);
  const highlightedColumns = new Set(highlightColumns);
  const rows = values.length;
  const columns = Math.max(...values.map((row) => row.length), 0);
  const tableWidth = columns * cellSize.width;
  const tableHeight = rows * cellSize.height;
  const startX = (width - tableWidth) / 2 + cellSize.width / 2 + AXIS_SIZE / 2;
  const startY = (height - tableHeight) / 2 + cellSize.height / 2 + AXIS_SIZE / 2;

  return values.flatMap((row, rowIndex) =>
    row.map((value, columnIndex) => {
      const key = cellKey(rowIndex, columnIndex);
      const status =
        mutedSet.has(key)
          ? 'muted'
          : statusMap.get(key) ??
            (activeSet.has(key) || highlightedRows.has(rowIndex) || highlightedColumns.has(columnIndex)
              ? 'active'
              : 'default');

      return {
        row: rowIndex,
        column: columnIndex,
        value,
        x: startX + columnIndex * cellSize.width,
        y: startY + rowIndex * cellSize.height,
        width: cellSize.width,
        height: cellSize.height,
        status,
      };
    }),
  );
}

function createMatrixContext(
  cells: ResolvedMatrixCell[],
  width: number,
  height: number,
): MatrixDiagramContext {
  const cellMap = new Map(cells.map((cell) => [cellKey(cell.row, cell.column), cell]));

  return {
    cells,
    getCellCenter: (row, column) => {
      const cell = cellMap.get(cellKey(row, column));
      return cell ? {x: cell.x, y: cell.y} : {x: 0, y: 0};
    },
    width,
    height,
  };
}

function renderAxisLabels({
  cells,
  rowLabels,
  columnLabels,
}: {
  cells: ResolvedMatrixCell[];
  rowLabels?: ReactNode[];
  columnLabels?: ReactNode[];
}): ReactNode {
  const firstColumnCells = cells.filter((cell) => cell.column === 0);
  const firstRowCells = cells.filter((cell) => cell.row === 0);

  return (
    <>
      {rowLabels &&
        firstColumnCells.map((cell) => (
          <foreignObject
            key={`row-label-${cell.row}`}
            x={cell.x - cell.width / 2 - AXIS_SIZE - 6}
            y={cell.y - cell.height / 2}
            width={AXIS_SIZE}
            height={cell.height}>
            <div className={styles.matrixAxisLabel}>
              {rowLabels[cell.row]}
            </div>
          </foreignObject>
        ))}
      {columnLabels &&
        firstRowCells.map((cell) => (
          <foreignObject
            key={`column-label-${cell.column}`}
            x={cell.x - cell.width / 2}
            y={cell.y - cell.height / 2 - AXIS_SIZE + 4}
            width={cell.width}
            height={AXIS_SIZE - 8}>
            <div className={styles.matrixAxisLabel}>
              {columnLabels[cell.column]}
            </div>
          </foreignObject>
        ))}
    </>
  );
}

function renderCells(cells: ResolvedMatrixCell[]): ReactNode {
  return cells.map((cell) => (
    <g key={cellKey(cell.row, cell.column)} className={clsx(styles.matrixCell, matrixCellStatusClass[cell.status])}>
      <rect
        className={styles.matrixCellShape}
        x={cell.x - cell.width / 2}
        y={cell.y - cell.height / 2}
        width={cell.width}
        height={cell.height}
        rx={3}
      />
      <foreignObject x={cell.x - cell.width / 2} y={cell.y - cell.height / 2} width={cell.width} height={cell.height}>
        <div className={styles.matrixCellContent}>
          {cell.value}
        </div>
      </foreignObject>
    </g>
  ));
}

export default function MatrixDiagram({
  values,
  rowLabels,
  columnLabels,
  activeCells = [],
  mutedCells = [],
  statusCells = [],
  highlightRows = [],
  highlightColumns = [],
  cellSize,
  width,
  height,
  background = 'matrix',
  className,
  ariaLabel = 'Algorithm matrix diagram',
  children,
}: MatrixDiagramProps): ReactNode {
  const actualCellSize = getCellSize(cellSize);
  const rows = values.length;
  const columns = Math.max(...values.map((row) => row.length), 0);
  const resolvedWidth =
    width ?? Math.max(420, columns * actualCellSize.width + MATRIX_PADDING * 2 + AXIS_SIZE);
  const resolvedHeight =
    height ?? Math.max(260, rows * actualCellSize.height + MATRIX_PADDING * 2 + AXIS_SIZE);
  const cells = resolveMatrix({
    values,
    cellSize: actualCellSize,
    width: resolvedWidth,
    height: resolvedHeight,
    activeCells,
    mutedCells,
    statusCells,
    highlightRows,
    highlightColumns,
  });
  const context = createMatrixContext(cells, resolvedWidth, resolvedHeight);

  return (
    <AlgoCanvas
      width={resolvedWidth}
      height={resolvedHeight}
      background={background}
      className={className}
      ariaLabel={ariaLabel}>
      <>
        {renderAxisLabels({cells, rowLabels, columnLabels})}
        <g>{renderCells(cells)}</g>
        {children?.(context)}
      </>
    </AlgoCanvas>
  );
}
