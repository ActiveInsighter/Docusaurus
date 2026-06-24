import type {
  AnchorSide,
  DiagramContext,
  Point,
  ResolvedDiagramNode,
} from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getNodeCenter(node: ResolvedDiagramNode): Point {
  return {x: node.x, y: node.y};
}

export function getNodeAnchor(
  node: ResolvedDiagramNode,
  side: AnchorSide,
): Point {
  if (side === 'top') {
    return {x: node.x, y: node.y - node.height / 2};
  }

  if (side === 'right') {
    return {x: node.x + node.width / 2, y: node.y};
  }

  if (side === 'bottom') {
    return {x: node.x, y: node.y + node.height / 2};
  }

  if (side === 'left') {
    return {x: node.x - node.width / 2, y: node.y};
  }

  return getNodeCenter(node);
}

export function getSideToward(from: Point, to: Point): AnchorSide {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }

  return dy >= 0 ? 'bottom' : 'top';
}

export function getOppositeSide(side: AnchorSide): AnchorSide {
  if (side === 'top') {
    return 'bottom';
  }

  if (side === 'right') {
    return 'left';
  }

  if (side === 'bottom') {
    return 'top';
  }

  if (side === 'left') {
    return 'right';
  }

  return 'center';
}

export function createDiagramContext(
  nodes: ResolvedDiagramNode[],
  width: number,
  height: number,
): DiagramContext {
  const nodeMap = Object.fromEntries(nodes.map((node) => [node.id, node]));

  return {
    nodes: nodeMap,
    getNodeCenter: (id) => getNodeCenter(nodeMap[id]),
    getNodeAnchor: (id, side) => getNodeAnchor(nodeMap[id], side),
    width,
    height,
  };
}

export function createPath(from: Point, to: Point, type = 'straight'): string {
  if (type === 'elbow' || type === 'orthogonal') {
    const midX = (from.x + to.x) / 2;
    return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
  }

  if (type === 'curve') {
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      return `M ${from.x} ${from.y} C ${from.x + dx * 0.42} ${from.y}, ${
        to.x - dx * 0.42
      } ${to.y}, ${to.x} ${to.y}`;
    }

    return `M ${from.x} ${from.y} C ${from.x} ${from.y + dy * 0.42}, ${
      to.x
    } ${to.y - dy * 0.42}, ${to.x} ${to.y}`;
  }

  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

export function midpoint(from: Point, to: Point): Point {
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
}
