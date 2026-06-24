import React, { type CSSProperties, type ReactNode } from 'react';
import clsx from 'clsx';

import AlgoCanvas from '../core/AlgoCanvas';
import {
  clamp,
  createDiagramContext,
  createPath,
  getNodeAnchor,
  getOppositeSide,
  getSideToward,
  midpoint,
} from '../core/geometry';
import type {
  AnchorSide,
  DiagramAnnotation,
  DiagramBackground,
  DiagramContext,
  DiagramEdge,
  DiagramNode,
  EdgeStatus,
  GraphLayout,
  HighlightPath,
  MarkerIds,
  NodeShape,
  NodeStatus,
  NodeVariant,
  Point,
  ResolvedDiagramNode,
} from '../core/types';
import styles from '../styles.module.css';

export type GraphDiagramProps = {
  nodes: DiagramNode[];
  edges?: DiagramEdge[];
  layout?: GraphLayout;
  width?: number;
  height?: number;
  background?: DiagramBackground;
  activeNodes?: string[];
  activeEdges?: Array<[string, string]>;
  highlightPaths?: HighlightPath[];
  annotations?: DiagramAnnotation[];
  edgeLabels?: boolean;
  nodeSize?: number | { width: number; height: number };
  className?: string;
  ariaLabel?: string;
  children?: ReactNode | ((context: DiagramContext) => ReactNode);
};

type TreeLevels = string[][];

type RectBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CalloutAnnotation = Extract<DiagramAnnotation, { type: 'callout' }>;

type CalloutPosition = NonNullable<CalloutAnnotation['position']>;

type ResolvedCallout = RectBounds & {
  annotation: CalloutAnnotation;
  anchor: Point;
  boxAnchor: Point;
  position: CalloutPosition;
};

type LabelPlacement = RectBounds & {
  center: Point;
};

type ResolvedTextAnnotation = {
  annotation: Extract<DiagramAnnotation, { type: 'text' }>;
  label: LabelPlacement;
};

type ResolvedArrowAnnotation = {
  annotation: Extract<DiagramAnnotation, { type: 'arrow' }>;
  path: string;
  label?: LabelPlacement;
};

const DEFAULT_NODE_WIDTH = 58;
const DEFAULT_NODE_HEIGHT = 52;
const GRAPH_PADDING = 54;

const nodeStatusClass: Record<NodeStatus, string | undefined> = {
  default: undefined,
  active: styles.nodeStatusActive,
  visited: styles.nodeStatusVisited,
  current: styles.nodeStatusCurrent,
  success: styles.nodeStatusSuccess,
  warning: styles.nodeStatusWarning,
  danger: styles.nodeStatusDanger,
  muted: styles.nodeStatusMuted,
};

const nodeVariantClass: Record<NodeVariant, string | undefined> = {
  default: undefined,
  primary: styles.nodeVariantPrimary,
  success: styles.nodeVariantSuccess,
  warning: styles.nodeVariantWarning,
  danger: styles.nodeVariantDanger,
  ghost: styles.nodeVariantGhost,
  code: styles.nodeVariantCode,
  memory: styles.nodeVariantMemory,
};

const edgeStatusClass: Record<EdgeStatus, string | undefined> = {
  default: undefined,
  active: styles.edgeStatusActive,
  visited: styles.edgeStatusVisited,
  path: styles.edgeStatusPath,
  muted: styles.edgeStatusMuted,
  danger: styles.edgeStatusDanger,
};

function edgeKey(from: string, to: string): string {
  return `${from}->${to}`;
}

function getDefaultShape(layout: GraphLayout, node: DiagramNode): NodeShape {
  if (node.shape) {
    return node.shape;
  }

  if (layout === 'linked-list') {
    return node.id === 'head' || node.id === 'null' ? 'pill' : 'rounded';
  }

  if (layout === 'binary-tree' || layout === 'tree' || layout === 'graph') {
    return 'circle';
  }

  return 'rounded';
}

function getDefaultNodeSize(
  nodeSize: GraphDiagramProps['nodeSize'],
): { width: number; height: number } {
  if (typeof nodeSize === 'number') {
    return { width: nodeSize, height: nodeSize };
  }

  if (nodeSize) {
    return nodeSize;
  }

  return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
}

function getNodeDimensions(
  node: DiagramNode,
  layout: GraphLayout,
  nodeSize: GraphDiagramProps['nodeSize'],
): { width: number; height: number } {
  const defaultSize = getDefaultNodeSize(nodeSize);
  const shape = getDefaultShape(layout, node);

  if (shape === 'circle') {
    const diameter = Math.max(node.width ?? defaultSize.width, node.height ?? defaultSize.height);
    return { width: diameter, height: diameter };
  }

  if (shape === 'pill') {
    return {
      width: node.width ?? Math.max(74, defaultSize.width + 16),
      height: node.height ?? Math.min(42, defaultSize.height),
    };
  }

  return {
    width: node.width ?? defaultSize.width,
    height: node.height ?? defaultSize.height,
  };
}

function buildTreeLevels(nodes: DiagramNode[], edges: DiagramEdge[]): TreeLevels {
  const nodeIds = nodes.map((node) => node.id);
  const incoming = new Set(edges.map((edge) => edge.to));
  const childrenById = new Map<string, string[]>();

  for (const edge of edges) {
    const children = childrenById.get(edge.from) ?? [];
    children.push(edge.to);
    childrenById.set(edge.from, children);
  }

  const roots = nodeIds.filter((id) => !incoming.has(id));
  const queue = (roots.length > 0 ? roots : nodeIds.slice(0, 1)).map((id) => ({
    id,
    level: 0,
  }));
  const visited = new Set<string>();
  const levels: TreeLevels = [];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const item = queue[cursor];

    if (visited.has(item.id)) {
      continue;
    }

    visited.add(item.id);
    levels[item.level] = levels[item.level] ?? [];
    levels[item.level].push(item.id);

    for (const childId of childrenById.get(item.id) ?? []) {
      queue.push({ id: childId, level: item.level + 1 });
    }
  }

  const missing = nodeIds.filter((id) => !visited.has(id));
  if (missing.length > 0) {
    levels.push(missing);
  }

  return levels;
}

function inferGraphSize(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  layout: GraphLayout,
  width?: number,
  height?: number,
): { width: number; height: number } {
  if (layout === 'linked-list' || layout === 'horizontal') {
    return {
      width: width ?? Math.max(520, GRAPH_PADDING * 2 + Math.max(0, nodes.length - 1) * 118 + 90),
      height: height ?? 220,
    };
  }

  if (layout === 'vertical') {
    return {
      width: width ?? 360,
      height: height ?? Math.max(280, GRAPH_PADDING * 2 + Math.max(0, nodes.length - 1) * 94),
    };
  }

  if (layout === 'tree' || layout === 'binary-tree' || layout === 'dag') {
    const levels = buildTreeLevels(nodes, edges);
    const widestLevel = Math.max(...levels.map((level) => level.length), 1);
    return {
      width: width ?? Math.max(520, widestLevel * 132 + GRAPH_PADDING * 2),
      height: height ?? Math.max(280, levels.length * 96 + GRAPH_PADDING * 2),
    };
  }

  if (layout === 'grid') {
    const columns = Math.ceil(Math.sqrt(nodes.length || 1));
    const rows = Math.ceil((nodes.length || 1) / columns);
    return {
      width: width ?? Math.max(420, columns * 112 + GRAPH_PADDING * 2),
      height: height ?? Math.max(260, rows * 92 + GRAPH_PADDING * 2),
    };
  }

  return {
    width: width ?? 640,
    height: height ?? 360,
  };
}

function resolveNodes(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  layout: GraphLayout,
  width: number,
  height: number,
  nodeSize: GraphDiagramProps['nodeSize'],
  nodeStatuses: Map<string, NodeStatus>,
): ResolvedDiagramNode[] {
  const centerX = width / 2;
  const centerY = height / 2;

  if (layout === 'manual') {
    return nodes.map((node, index) => {
      const dimensions = getNodeDimensions(node, layout, nodeSize);
      const fallbackAngle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2;
      const fallbackRadius = Math.min(width, height) * 0.3;

      return {
        ...node,
        x: node.x ?? centerX + Math.cos(fallbackAngle) * fallbackRadius,
        y: node.y ?? centerY + Math.sin(fallbackAngle) * fallbackRadius,
        width: dimensions.width,
        height: dimensions.height,
        shape: getDefaultShape(layout, node),
        variant: node.variant ?? 'default',
        status: node.status ?? nodeStatuses.get(node.id) ?? 'default',
      };
    });
  }

  if (layout === 'linked-list' || layout === 'horizontal') {
    const spacing = nodes.length > 1 ? (width - GRAPH_PADDING * 2) / (nodes.length - 1) : 0;

    return nodes.map((node, index) => {
      const dimensions = getNodeDimensions(node, layout, nodeSize);

      return {
        ...node,
        x: nodes.length > 1 ? GRAPH_PADDING + spacing * index : centerX,
        y: centerY,
        width: dimensions.width,
        height: dimensions.height,
        shape: getDefaultShape(layout, node),
        variant: node.variant ?? (layout === 'linked-list' && node.id === 'head' ? 'primary' : 'default'),
        status: node.status ?? nodeStatuses.get(node.id) ?? 'default',
      };
    });
  }

  if (layout === 'vertical') {
    const spacing = nodes.length > 1 ? (height - GRAPH_PADDING * 2) / (nodes.length - 1) : 0;

    return nodes.map((node, index) => {
      const dimensions = getNodeDimensions(node, layout, nodeSize);

      return {
        ...node,
        x: centerX,
        y: nodes.length > 1 ? GRAPH_PADDING + spacing * index : centerY,
        width: dimensions.width,
        height: dimensions.height,
        shape: getDefaultShape(layout, node),
        variant: node.variant ?? 'default',
        status: node.status ?? nodeStatuses.get(node.id) ?? 'default',
      };
    });
  }

  if (layout === 'tree' || layout === 'binary-tree' || layout === 'dag') {
    const levels = buildTreeLevels(nodes, edges);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const resolved: ResolvedDiagramNode[] = [];
    const verticalStep =
      levels.length > 1 ? (height - GRAPH_PADDING * 2) / (levels.length - 1) : 0;

    levels.forEach((level, levelIndex) => {
      const horizontalStep = width / (level.length + 1);

      level.forEach((id, index) => {
        const node = nodeById.get(id);
        if (!node) {
          return;
        }

        const dimensions = getNodeDimensions(node, layout, nodeSize);
        resolved.push({
          ...node,
          x: horizontalStep * (index + 1),
          y: levels.length > 1 ? GRAPH_PADDING + verticalStep * levelIndex : centerY,
          width: dimensions.width,
          height: dimensions.height,
          shape: getDefaultShape(layout, node),
          variant: node.variant ?? 'default',
          status: node.status ?? nodeStatuses.get(node.id) ?? 'default',
        });
      });
    });

    return resolved;
  }

  if (layout === 'grid') {
    const columns = Math.ceil(Math.sqrt(nodes.length || 1));
    const cellWidth = (width - GRAPH_PADDING * 2) / Math.max(columns - 1, 1);
    const rows = Math.ceil((nodes.length || 1) / columns);
    const cellHeight = (height - GRAPH_PADDING * 2) / Math.max(rows - 1, 1);

    return nodes.map((node, index) => {
      const dimensions = getNodeDimensions(node, layout, nodeSize);
      const column = index % columns;
      const row = Math.floor(index / columns);

      return {
        ...node,
        x: columns > 1 ? GRAPH_PADDING + column * cellWidth : centerX,
        y: rows > 1 ? GRAPH_PADDING + row * cellHeight : centerY,
        width: dimensions.width,
        height: dimensions.height,
        shape: getDefaultShape(layout, node),
        variant: node.variant ?? 'default',
        status: node.status ?? nodeStatuses.get(node.id) ?? 'default',
      };
    });
  }

  return nodes.map((node, index) => {
    const dimensions = getNodeDimensions(node, layout, nodeSize);
    const angle = (Math.PI * 2 * index) / Math.max(nodes.length, 1) - Math.PI / 2;
    const radius = Math.max(84, Math.min(width, height) * 0.32);

    return {
      ...node,
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
      width: dimensions.width,
      height: dimensions.height,
      shape: getDefaultShape(layout, node),
      variant: node.variant ?? 'default',
      status: node.status ?? nodeStatuses.get(node.id) ?? 'default',
    };
  });
}

function createHighlightMaps(
  activeNodes: string[] = [],
  activeEdges: Array<[string, string]> = [],
  highlightPaths: HighlightPath[] = [],
): {
  nodeStatuses: Map<string, NodeStatus>;
  edgeStatuses: Map<string, EdgeStatus>;
  animatedEdges: Set<string>;
} {
  const nodeStatuses = new Map<string, NodeStatus>();
  const edgeStatuses = new Map<string, EdgeStatus>();
  const animatedEdges = new Set<string>();

  for (const id of activeNodes) {
    nodeStatuses.set(id, 'active');
  }

  for (const [from, to] of activeEdges) {
    edgeStatuses.set(edgeKey(from, to), 'active');
  }

  for (const path of highlightPaths) {
    const status = path.status ?? 'active';
    const edgeStatus: EdgeStatus = status === 'success' ? 'visited' : status === 'danger' ? 'danger' : 'path';

    for (const id of path.nodes) {
      nodeStatuses.set(id, status === 'danger' ? 'danger' : status);
    }

    const pathEdges =
      path.edges ??
      path.nodes.slice(0, -1).map((from, index): [string, string] => [from, path.nodes[index + 1]]);

    for (const [from, to] of pathEdges) {
      const key = edgeKey(from, to);
      edgeStatuses.set(key, edgeStatus);
      if (path.animated) {
        animatedEdges.add(key);
      }
    }
  }

  return { nodeStatuses, edgeStatuses, animatedEdges };
}

function getMarkerId(status: EdgeStatus, markerIds: MarkerIds): string {
  if (status === 'active' || status === 'path') {
    return markerIds.active;
  }

  if (status === 'visited') {
    return markerIds.success;
  }

  if (status === 'danger') {
    return markerIds.danger;
  }

  if (status === 'muted') {
    return markerIds.muted;
  }

  return markerIds.default;
}

function renderNodeShape(node: ResolvedDiagramNode): ReactNode {
  const x = node.x - node.width / 2;
  const y = node.y - node.height / 2;
  const shapeProps = {
    className: styles.nodeShape,
    style: node.style,
  };

  if (node.shape === 'none') {
    return null;
  }

  if (node.shape === 'circle') {
    return <circle {...shapeProps} cx={node.x} cy={node.y} r={Math.min(node.width, node.height) / 2} />;
  }

  if (node.shape === 'diamond') {
    const points = [
      `${node.x},${y}`,
      `${x + node.width},${node.y}`,
      `${node.x},${y + node.height}`,
      `${x},${node.y}`,
    ].join(' ');
    return <polygon {...shapeProps} points={points} />;
  }

  if (node.shape === 'hexagon') {
    const inset = node.width * 0.18;
    const points = [
      `${x + inset},${y}`,
      `${x + node.width - inset},${y}`,
      `${x + node.width},${node.y}`,
      `${x + node.width - inset},${y + node.height}`,
      `${x + inset},${y + node.height}`,
      `${x},${node.y}`,
    ].join(' ');
    return <polygon {...shapeProps} points={points} />;
  }

  const rx = node.shape === 'pill' ? node.height / 2 : node.shape === 'rect' || node.shape === 'cell' ? 4 : 8;
  return <rect {...shapeProps} x={x} y={y} width={node.width} height={node.height} rx={rx} />;
}

function renderNode(node: ResolvedDiagramNode): ReactNode {
  const contentHeight = node.height;

  return (
    <g
      key={node.id}
      className={clsx(
        styles.node,
        nodeStatusClass[node.status],
        nodeVariantClass[node.variant],
      )}>
      {renderNodeShape(node)}
      <foreignObject
        x={node.x - node.width / 2}
        y={node.y - contentHeight / 2}
        width={node.width}
        height={contentHeight}>
        <div className={styles.nodeContent}>
          <div className={styles.nodeInner}>
            <div className={styles.nodeLabel}>{node.label}</div>
            {node.subLabel && <div className={styles.nodeSubLabel}>{node.subLabel}</div>}
          </div>
        </div>
      </foreignObject>
      {node.badge && (
        <foreignObject
          x={node.x + node.width / 2 - 10}
          y={node.y - node.height / 2 - 18}
          width={28}
          height={22}>
          <div className={styles.nodeBadge}>
            {node.badge}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

function resolveEdgeAnchors(
  fromNode: ResolvedDiagramNode,
  toNode: ResolvedDiagramNode,
  layout: GraphLayout,
): { from: Point; to: Point } {
  if (fromNode.id === toNode.id) {
    return {
      from: getNodeAnchor(fromNode, 'right'),
      to: getNodeAnchor(toNode, 'top'),
    };
  }

  if (layout === 'tree' || layout === 'binary-tree' || layout === 'dag') {
    if (toNode.y >= fromNode.y) {
      return {
        from: getNodeAnchor(fromNode, 'bottom'),
        to: getNodeAnchor(toNode, 'top'),
      };
    }

    return {
      from: getNodeAnchor(fromNode, 'top'),
      to: getNodeAnchor(toNode, 'bottom'),
    };
  }

  if (layout === 'linked-list' || layout === 'horizontal') {
    return {
      from: getNodeAnchor(fromNode, toNode.x >= fromNode.x ? 'right' : 'left'),
      to: getNodeAnchor(toNode, toNode.x >= fromNode.x ? 'left' : 'right'),
    };
  }

  if (layout === 'vertical') {
    return {
      from: getNodeAnchor(fromNode, toNode.y >= fromNode.y ? 'bottom' : 'top'),
      to: getNodeAnchor(toNode, toNode.y >= fromNode.y ? 'top' : 'bottom'),
    };
  }

  const fromSide = getSideToward(fromNode, toNode);
  const toSide = getOppositeSide(fromSide);

  return {
    from: getNodeAnchor(fromNode, fromSide),
    to: getNodeAnchor(toNode, toSide),
  };
}

function renderEdge(
  edge: DiagramEdge,
  nodeMap: Record<string, ResolvedDiagramNode>,
  layout: GraphLayout,
  markerIds: MarkerIds,
  edgeStatuses: Map<string, EdgeStatus>,
  animatedEdges: Set<string>,
  showLabels: boolean,
  labelPlacement?: LabelPlacement,
): ReactNode {
  const fromNode = nodeMap[edge.from];
  const toNode = nodeMap[edge.to];

  if (!fromNode || !toNode) {
    return null;
  }

  const key = edge.id ?? edgeKey(edge.from, edge.to);
  const status = edge.status ?? edgeStatuses.get(edgeKey(edge.from, edge.to)) ?? 'default';
  const direction = edge.direction ?? (fromNode.id === toNode.id ? 'forward' : 'none');
  const markerId = getMarkerId(status, markerIds);
  const anchors = resolveEdgeAnchors(fromNode, toNode, layout);
  const pathType = edge.type === 'loop' || fromNode.id === toNode.id ? 'loop' : edge.curved ? 'curve' : edge.type ?? 'straight';
  const path =
    pathType === 'loop'
      ? `M ${anchors.from.x} ${anchors.from.y} C ${anchors.from.x + 74} ${anchors.from.y - 78
      }, ${anchors.to.x + 34} ${anchors.to.y - 82}, ${anchors.to.x} ${anchors.to.y}`
      : createPath(anchors.from, anchors.to, pathType);
  const label = edge.label ?? edge.weight;
  const markerEnd = direction === 'forward' || direction === 'both' ? `url(#${markerId})` : undefined;
  const markerStart = direction === 'backward' || direction === 'both' ? `url(#${markerId})` : undefined;

  return (
    <g key={key} className={clsx(styles.edge, edgeStatusClass[status])}>
      <path
        className={clsx(
          styles.edgePath,
          (edge.dashed || animatedEdges.has(edgeKey(edge.from, edge.to))) && styles.edgeDashed,
          animatedEdges.has(edgeKey(edge.from, edge.to)) && styles.edgeAnimated,
        )}
        d={path}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={edge.style as CSSProperties}
      />
      {showLabels && label && labelPlacement && (
        <foreignObject
          className={styles.edgeLabel}
          x={labelPlacement.x}
          y={labelPlacement.y}
          width={labelPlacement.width}
          height={labelPlacement.height}>
          <div className={styles.labelPill}>
            {label}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

function getEdgeLabelPoint(from: Point, to: Point, layout: GraphLayout): Point {
  const center = midpoint(from, to);

  if (layout === 'linked-list' || layout === 'horizontal') {
    return { x: center.x, y: center.y - 17 };
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return center;
  }

  const offset = layout === 'manual' || layout === 'graph' ? 14 : 10;

  return {
    x: center.x + (-dy / length) * offset,
    y: center.y + (dx / length) * offset,
  };
}


function annotationSide(position: 'top' | 'right' | 'bottom' | 'left'): AnchorSide {
  return position;
}

function getLabelSize(
  value: ReactNode,
  options: { minWidth?: number; maxWidth?: number; height?: number; horizontalPadding?: number } = {},
): { width: number; height: number } {
  const characters = countTextCharacters(value);
  const horizontalPadding = options.horizontalPadding ?? 10;

  return {
    width: clamp(characters * 7.4 + horizontalPadding * 2, options.minWidth ?? 22, options.maxWidth ?? 148),
    height: options.height ?? 24,
  };
}

function boundsFromCenter(center: Point, size: { width: number; height: number }): LabelPlacement {
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
    center,
  };
}

function clampLabelToCanvas(label: LabelPlacement, context: DiagramContext, margin = 8): LabelPlacement {
  const x = clamp(label.x, margin, Math.max(margin, context.width - label.width - margin));
  const y = clamp(label.y, margin, Math.max(margin, context.height - label.height - margin));

  return {
    ...label,
    x,
    y,
    center: { x: x + label.width / 2, y: y + label.height / 2 },
  };
}

function getOutsidePenalty(bounds: RectBounds, context: DiagramContext, margin = 8): number {
  const left = Math.max(0, margin - bounds.x);
  const top = Math.max(0, margin - bounds.y);
  const right = Math.max(0, bounds.x + bounds.width - (context.width - margin));
  const bottom = Math.max(0, bounds.y + bounds.height - (context.height - margin));

  return (left + top + right + bottom) * 180;
}

function chooseLabelPlacement(
  preferredCenter: Point,
  size: { width: number; height: number },
  context: DiagramContext,
  occupied: RectBounds[],
  candidateCenters: Point[],
): LabelPlacement {
  const centers = [preferredCenter, ...candidateCenters];
  let best = clampLabelToCanvas(boundsFromCenter(preferredCenter, size), context);
  let bestScore = Number.POSITIVE_INFINITY;

  centers.forEach((center, index) => {
    const raw = boundsFromCenter(center, size);
    const candidate = clampLabelToCanvas(raw, context);
    const paddedCandidate = expandBounds(candidate, 4);
    const overlapScore = occupied.reduce(
      (sum, item) => sum + getOverlapArea(paddedCandidate, item),
      0,
    );
    const driftScore = Math.hypot(candidate.center.x - preferredCenter.x, candidate.center.y - preferredCenter.y);
    const score = overlapScore * 90 + getOutsidePenalty(raw, context) + driftScore * 2 + index * 4;

    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  });

  return best;
}

function getEdgeLabelCandidates(from: Point, to: Point, layout: GraphLayout): Point[] {
  const preferred = getEdgeLabelPoint(from, to, layout);
  const center = midpoint(from, to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return [
      { x: preferred.x, y: preferred.y - 22 },
      { x: preferred.x + 22, y: preferred.y },
      { x: preferred.x, y: preferred.y + 22 },
      { x: preferred.x - 22, y: preferred.y },
    ];
  }

  const normal = { x: -dy / length, y: dx / length };
  const tangent = { x: dx / length, y: dy / length };
  const normalOffsets = layout === 'linked-list' || layout === 'horizontal'
    ? [24, -24, 40, -40]
    : [20, -20, 36, -36];
  const tangentOffsets = [-24, 24];

  return [
    ...normalOffsets.map((offset) => ({ x: center.x + normal.x * offset, y: center.y + normal.y * offset })),
    ...tangentOffsets.map((offset) => ({ x: preferred.x + tangent.x * offset, y: preferred.y + tangent.y * offset })),
  ];
}

function resolveEdgeLabelPlacements(
  edges: DiagramEdge[],
  context: DiagramContext,
  layout: GraphLayout,
): Array<LabelPlacement | undefined> {
  const occupied = Object.values(context.nodes).map((node) => expandBounds(getNodeBounds(node), 10));
  const placements: Array<LabelPlacement | undefined> = [];

  edges.forEach((edge, index) => {
    const fromNode = context.nodes[edge.from];
    const toNode = context.nodes[edge.to];
    const label = edge.label ?? edge.weight;

    if (!fromNode || !toNode || !label) {
      placements[index] = undefined;
      return;
    }

    const anchors = resolveEdgeAnchors(fromNode, toNode, layout);
    const preferredCenter = getEdgeLabelPoint(anchors.from, anchors.to, layout);
    const size = getLabelSize(label, { minWidth: 22, maxWidth: 92, height: 24, horizontalPadding: 8 });
    const placement = chooseLabelPlacement(
      preferredCenter,
      size,
      context,
      occupied,
      getEdgeLabelCandidates(anchors.from, anchors.to, layout),
    );

    placements[index] = placement;
    occupied.push(expandBounds(placement, 4));
  });

  return placements;
}

function constrainBoundsToCanvas(
  bounds: RectBounds,
  context: DiagramContext,
  margin = 14,
): RectBounds {
  const x = clamp(bounds.x, margin, Math.max(margin, context.width - bounds.width - margin));
  const y = clamp(bounds.y, margin, Math.max(margin, context.height - bounds.height - margin));
  const width = Math.min(bounds.width, context.width - margin - x);
  const height = Math.min(bounds.height, context.height - margin - y);

  return {
    x,
    y,
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

function getCurvePath(from: Point, to: Point, bend = 28): string {
  const center = midpoint(from, to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const control = {
    x: center.x + (-dy / length) * bend,
    y: center.y + (dx / length) * bend,
  };

  return `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
}

function getCurveBounds(from: Point, to: Point, bend: number): RectBounds {
  const center = midpoint(from, to);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const control = {
    x: center.x + (-dy / length) * bend,
    y: center.y + (dx / length) * bend,
  };
  const minX = Math.min(from.x, to.x, control.x);
  const maxX = Math.max(from.x, to.x, control.x);
  const minY = Math.min(from.y, to.y, control.y);
  const maxY = Math.max(from.y, to.y, control.y);

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function chooseArrowBend(from: Point, to: Point, context: DiagramContext, occupied: RectBounds[]): number {
  const bends = [30, -30, 48, -48, 16, -16, 0];
  let best = bends[0];
  let bestScore = Number.POSITIVE_INFINITY;

  bends.forEach((bend, index) => {
    const bounds = expandBounds(getCurveBounds(from, to, bend), 6);
    const overlapScore = occupied.reduce((sum, item) => sum + getOverlapArea(bounds, item), 0);
    const score = overlapScore * 90 + getOutsidePenalty(bounds, context) + Math.abs(bend) * 0.3 + index;

    if (score < bestScore) {
      best = bend;
      bestScore = score;
    }
  });

  return best;
}

function resolveAnnotationLayouts(
  annotations: DiagramAnnotation[],
  context: DiagramContext,
  initialOccupied: RectBounds[],
): { texts: ResolvedTextAnnotation[]; arrows: ResolvedArrowAnnotation[] } {
  const occupied = [
    ...Object.values(context.nodes).map((node) => expandBounds(getNodeBounds(node), 10)),
    ...initialOccupied,
  ];
  const texts: ResolvedTextAnnotation[] = [];
  const arrows: ResolvedArrowAnnotation[] = [];

  annotations.forEach((annotation) => {
    if (annotation.type === 'text') {
      const size = getLabelSize(annotation.text, { minWidth: 34, maxWidth: 170, height: 26, horizontalPadding: 4 });
      const preferred = { x: annotation.x, y: annotation.y };
      const shifts = [
        { x: 0, y: -28 },
        { x: 0, y: 28 },
        { x: 36, y: 0 },
        { x: -36, y: 0 },
        { x: 44, y: -24 },
        { x: -44, y: -24 },
      ];
      const label = chooseLabelPlacement(
        preferred,
        size,
        context,
        occupied,
        shifts.map((shift) => ({ x: preferred.x + shift.x, y: preferred.y + shift.y })),
      );

      texts.push({ annotation, label });
      occupied.push(expandBounds(label, 5));
      return;
    }

    if (annotation.type === 'arrow') {
      const bend = chooseArrowBend(annotation.from, annotation.to, context, occupied);
      const path = getCurvePath(annotation.from, annotation.to, bend);
      const labelSize = annotation.label
        ? getLabelSize(annotation.label, { minWidth: 32, maxWidth: 112, height: 24, horizontalPadding: 6 })
        : null;
      let label: LabelPlacement | undefined;

      if (annotation.label && labelSize) {
        const mid = midpoint(annotation.from, annotation.to);
        const dx = annotation.to.x - annotation.from.x;
        const dy = annotation.to.y - annotation.from.y;
        const length = Math.hypot(dx, dy) || 1;
        const normal = { x: -dy / length, y: dx / length };
        const preferred = {
          x: mid.x + normal.x * (bend + 18),
          y: mid.y + normal.y * (bend + 18),
        };
        label = chooseLabelPlacement(
          preferred,
          labelSize,
          context,
          occupied,
          [
            { x: mid.x + normal.x * (bend - 18), y: mid.y + normal.y * (bend - 18) },
            { x: mid.x - normal.x * 28, y: mid.y - normal.y * 28 },
            { x: mid.x + 34, y: mid.y },
            { x: mid.x - 34, y: mid.y },
          ],
        );
        occupied.push(expandBounds(label, 5));
      }

      arrows.push({ annotation, path, label });
    }
  });

  return { texts, arrows };
}

function countTextCharacters(value: ReactNode): number {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).length;
  }

  return 12;
}

function expandBounds(bounds: RectBounds, padding: number): RectBounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

function getOverlapArea(a: RectBounds, b: RectBounds): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

  return x * y;
}

function getNodeBounds(node: ResolvedDiagramNode): RectBounds {
  return {
    x: node.x - node.width / 2,
    y: node.y - node.height / 2,
    width: node.width,
    height: node.height,
  };
}

function getCalloutSize(annotation: CalloutAnnotation): { width: number; height: number } {
  const characters = countTextCharacters(annotation.text);

  return {
    width: clamp(characters * 7 + 34, 88, 148),
    height: characters > 14 ? 46 : 36,
  };
}

function getCalloutCandidate(
  annotation: CalloutAnnotation,
  context: DiagramContext,
  position: CalloutPosition,
  shift: number,
): ResolvedCallout | null {
  const target = context.nodes[annotation.target];
  if (!target) {
    return null;
  }

  const { width: boxWidth, height: boxHeight } = getCalloutSize(annotation);
  const anchor = context.getNodeAnchor(annotation.target, annotationSide(position));
  const offset = 20;
  const tangentShift = position === 'top' || position === 'bottom'
    ? { x: shift, y: 0 }
    : { x: 0, y: shift };
  const rawBoxX =
    position === 'left'
      ? anchor.x - boxWidth - offset
      : position === 'right'
        ? anchor.x + offset
        : anchor.x - boxWidth / 2 + tangentShift.x;
  const rawBoxY =
    position === 'top'
      ? anchor.y - boxHeight - offset
      : position === 'bottom'
        ? anchor.y + offset
        : anchor.y - boxHeight / 2 + tangentShift.y;
  const boxX = clamp(rawBoxX, 8, Math.max(8, context.width - boxWidth - 8));
  const boxY = clamp(rawBoxY, 8, Math.max(8, context.height - boxHeight - 8));

  return {
    annotation,
    anchor,
    position,
    x: boxX,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    boxAnchor: {
      x: position === 'left' ? boxX + boxWidth : position === 'right' ? boxX : boxX + boxWidth / 2,
      y: position === 'top' ? boxY + boxHeight : position === 'bottom' ? boxY : boxY + boxHeight / 2,
    },
  };
}

function resolveCalloutPlacements(
  annotations: CalloutAnnotation[],
  context: DiagramContext,
): ResolvedCallout[] {
  const occupied = Object.values(context.nodes).map((node) => expandBounds(getNodeBounds(node), 8));
  const positions: CalloutPosition[] = ['top', 'right', 'bottom', 'left'];
  const shifts = [0, -44, 44, -88, 88];
  const placements: ResolvedCallout[] = [];

  annotations.forEach((annotation) => {
    const preferred = annotation.position ?? 'top';
    const orderedPositions = [
      preferred,
      ...positions.filter((position) => position !== preferred),
    ];
    let best: ResolvedCallout | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    orderedPositions.forEach((position, positionIndex) => {
      shifts.forEach((shift) => {
        const candidate = getCalloutCandidate(annotation, context, position, shift);
        if (!candidate) {
          return;
        }

        const paddedCandidate = expandBounds(candidate, 6);
        const overlapScore = occupied.reduce(
          (sum, item) => sum + getOverlapArea(paddedCandidate, item),
          0,
        );
        const preferredAnchor = getCalloutCandidate(annotation, context, preferred, 0);
        const driftScore = preferredAnchor
          ? Math.hypot(candidate.x - preferredAnchor.x, candidate.y - preferredAnchor.y)
          : 0;
        const score = overlapScore * 80 + positionIndex * 260 + Math.abs(shift) * 3 + driftScore;

        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      });
    });

    if (best) {
      placements.push(best);
      occupied.push(expandBounds(best, 8));
    }
  });

  return placements;
}

function renderResolvedCallout(callout: ResolvedCallout): ReactNode {
  return (
    <g key={`callout-${callout.annotation.target}-${callout.position}-${callout.x}-${callout.y}`}>
      <path className={styles.calloutLine} d={createPath(callout.boxAnchor, callout.anchor, 'straight')} />
      <foreignObject x={callout.x} y={callout.y} width={callout.width} height={callout.height}>
        <div className={styles.calloutBox}>
          {callout.annotation.text}
        </div>
      </foreignObject>
    </g>
  );
}

function renderResolvedTextAnnotation(item: ResolvedTextAnnotation): ReactNode {
  return (
    <foreignObject
      key={`text-${item.annotation.x}-${item.annotation.y}`}
      x={item.label.x}
      y={item.label.y}
      width={item.label.width}
      height={item.label.height}>
      <div className={styles.annotationLabel}>
        <span className={styles.labelPill}>{item.annotation.text}</span>
      </div>
    </foreignObject>
  );
}

function renderResolvedArrowAnnotation(item: ResolvedArrowAnnotation, markerIds: MarkerIds): ReactNode {
  const status = item.annotation.status ?? 'active';
  const markerId = getMarkerId(status, markerIds);

  return (
    <g key={`arrow-${item.annotation.from.x}-${item.annotation.from.y}-${item.annotation.to.x}-${item.annotation.to.y}`}>
      <path
        className={clsx(styles.annotationArrow, item.annotation.dashed && styles.edgeDashed)}
        d={item.path}
        markerEnd={`url(#${markerId})`}
      />
      {item.annotation.label && item.label && (
        <foreignObject
          x={item.label.x}
          y={item.label.y}
          width={item.label.width}
          height={item.label.height}>
          <div className={styles.labelPill}>
            {item.annotation.label}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

function renderAnnotation(
  annotation: DiagramAnnotation,
  context: DiagramContext,
  markerIds: MarkerIds,
): ReactNode {
  if (annotation.type === 'text') {
    return (
      <foreignObject key={`text-${annotation.x}-${annotation.y}`} x={annotation.x - 70} y={annotation.y - 16} width={140} height={32}>
        <div className={styles.annotationLabel}>
          <span className={styles.labelPill}>{annotation.text}</span>
        </div>
      </foreignObject>
    );
  }

  if (annotation.type === 'region') {
    const targetNodes =
      annotation.targets
        ?.map((targetId) => context.nodes[targetId])
        .filter((node): node is ResolvedDiagramNode => Boolean(node)) ?? [];
    const padding = annotation.padding ?? 24;
    const bounds =
      targetNodes.length > 0
        ? {
          x:
            Math.min(...targetNodes.map((node) => node.x - node.width / 2)) -
            padding,
          y:
            Math.min(...targetNodes.map((node) => node.y - node.height / 2)) -
            padding,
          width:
            Math.max(...targetNodes.map((node) => node.x + node.width / 2)) -
            Math.min(...targetNodes.map((node) => node.x - node.width / 2)) +
            padding * 2,
          height:
            Math.max(...targetNodes.map((node) => node.y + node.height / 2)) -
            Math.min(...targetNodes.map((node) => node.y - node.height / 2)) +
            padding * 2,
        }
        : {
          x: annotation.x,
          y: annotation.y,
          width: annotation.width,
          height: annotation.height,
        };

    if (
      bounds.x === undefined ||
      bounds.y === undefined ||
      bounds.width === undefined ||
      bounds.height === undefined
    ) {
      return null;
    }

    const safeBounds = constrainBoundsToCanvas(bounds as RectBounds, context, 14);

    const statusClass =
      annotation.status === 'success'
        ? styles.regionStatusSuccess
        : annotation.status === 'warning'
          ? styles.regionStatusWarning
          : annotation.status === 'danger'
            ? styles.regionStatusDanger
            : undefined;

    return (
      <g key={`region-${bounds.x}-${bounds.y}`} className={statusClass}>
        <rect
          className={styles.regionShape}
          x={safeBounds.x}
          y={safeBounds.y}
          width={safeBounds.width}
          height={safeBounds.height}
          rx={8}
        />
        {annotation.label && (
          <foreignObject x={safeBounds.x + 10} y={safeBounds.y + 8} width={140} height={28}>
            <div className={styles.labelPill}>
              {annotation.label}
            </div>
          </foreignObject>
        )}
      </g>
    );
  }

  if (annotation.type === 'arrow') {
    const status = annotation.status ?? 'active';
    const markerId = getMarkerId(status, markerIds);

    return (
      <g key={`arrow-${annotation.from.x}-${annotation.from.y}-${annotation.to.x}-${annotation.to.y}`}>
        <path
          className={clsx(styles.annotationArrow, annotation.dashed && styles.edgeDashed)}
          d={createPath(annotation.from, annotation.to, 'curve')}
          markerEnd={`url(#${markerId})`}
        />
        {annotation.label && (
          <foreignObject x={(annotation.from.x + annotation.to.x) / 2 - 42} y={(annotation.from.y + annotation.to.y) / 2 - 26} width={84} height={28}>
            <div className={styles.labelPill}>
              {annotation.label}
            </div>
          </foreignObject>
        )}
      </g>
    );
  }

  const fallback = getCalloutCandidate(annotation, context, annotation.position ?? 'top', 0);

  return fallback ? renderResolvedCallout(fallback) : null;
}

export default function GraphDiagram({
  nodes,
  edges = [],
  layout = 'manual',
  width,
  height,
  background = 'dots',
  activeNodes = [],
  activeEdges = [],
  highlightPaths = [],
  annotations = [],
  edgeLabels = true,
  nodeSize,
  className,
  ariaLabel = 'Algorithm graph diagram',
  children,
}: GraphDiagramProps): ReactNode {
  const { nodeStatuses, edgeStatuses, animatedEdges } = createHighlightMaps(
    activeNodes,
    activeEdges,
    highlightPaths,
  );
  const size = inferGraphSize(nodes, edges, layout, width, height);
  const resolvedNodes = resolveNodes(
    nodes,
    edges,
    layout,
    size.width,
    size.height,
    nodeSize,
    nodeStatuses,
  );
  const context = createDiagramContext(resolvedNodes, size.width, size.height);
  const edgeLabelPlacements = edgeLabels
    ? resolveEdgeLabelPlacements(edges, context, layout)
    : [];
  const occupiedEdgeLabels = edgeLabelPlacements.filter((item): item is LabelPlacement => Boolean(item));
  const annotationLayouts = resolveAnnotationLayouts(
    annotations.filter((annotation) => annotation.type === 'text' || annotation.type === 'arrow'),
    context,
    occupiedEdgeLabels,
  );
  const calloutAnnotations = annotations.filter(
    (annotation): annotation is CalloutAnnotation => annotation.type === 'callout',
  );
  const calloutPlacements = resolveCalloutPlacements(calloutAnnotations, context);

  return (
    <AlgoCanvas
      width={size.width}
      height={size.height}
      background={background}
      className={className}
      ariaLabel={ariaLabel}>
      {({ markerIds }) => (
        <>
          <g>{annotations.filter((annotation) => annotation.type === 'region').map((annotation) => renderAnnotation(annotation, context, markerIds))}</g>
          <g>
            {edges.map((edge, index) =>
              renderEdge(
                edge,
                context.nodes,
                layout,
                markerIds,
                edgeStatuses,
                animatedEdges,
                edgeLabels,
                edgeLabelPlacements[index],
              ),
            )}
          </g>
          <g>{resolvedNodes.map(renderNode)}</g>
          <g>
            {annotationLayouts.texts.map(renderResolvedTextAnnotation)}
            {annotationLayouts.arrows.map((annotation) => renderResolvedArrowAnnotation(annotation, markerIds))}
            {calloutPlacements.map(renderResolvedCallout)}
          </g>
          {typeof children === 'function' ? children(context) : children}
        </>
      )}
    </AlgoCanvas>
  );
}
