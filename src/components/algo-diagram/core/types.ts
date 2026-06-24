import type {CSSProperties, ReactNode} from 'react';

export type Point = {
  x: number;
  y: number;
};

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left' | 'center';

export type DiagramBackground =
  | 'none'
  | 'plain'
  | 'dots'
  | 'grid'
  | 'lines'
  | 'matrix'
  | 'blueprint';

export type NodeShape =
  | 'rect'
  | 'rounded'
  | 'circle'
  | 'pill'
  | 'diamond'
  | 'hexagon'
  | 'cell'
  | 'none';

export type NodeStatus =
  | 'default'
  | 'active'
  | 'visited'
  | 'current'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted';

export type NodeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'ghost'
  | 'code'
  | 'memory';

export type DiagramNode = {
  id: string;
  label: ReactNode;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  shape?: NodeShape;
  variant?: NodeVariant;
  status?: NodeStatus;
  subLabel?: ReactNode;
  badge?: ReactNode;
  style?: CSSProperties;
};

export type ResolvedDiagramNode = DiagramNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: NodeShape;
  variant: NodeVariant;
  status: NodeStatus;
};

export type EdgeDirection = 'none' | 'forward' | 'backward' | 'both';

export type EdgeType =
  | 'straight'
  | 'curve'
  | 'elbow'
  | 'orthogonal'
  | 'loop';

export type EdgeStatus =
  | 'default'
  | 'active'
  | 'visited'
  | 'path'
  | 'muted'
  | 'danger';

export type DiagramEdge = {
  id?: string;
  from: string;
  to: string;
  label?: ReactNode;
  weight?: ReactNode;
  direction?: EdgeDirection;
  type?: EdgeType;
  status?: EdgeStatus;
  dashed?: boolean;
  curved?: boolean;
  style?: CSSProperties;
};

export type HighlightPath = {
  nodes: string[];
  edges?: Array<[string, string]>;
  label?: ReactNode;
  animated?: boolean;
  status?: 'active' | 'visited' | 'success' | 'danger';
};

export type DiagramAnnotation =
  | {
      type: 'text';
      x: number;
      y: number;
      text: ReactNode;
      status?: NodeStatus;
    }
  | {
      type: 'arrow';
      from: Point;
      to: Point;
      label?: ReactNode;
      dashed?: boolean;
      status?: EdgeStatus;
    }
  | {
      type: 'region';
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      targets?: string[];
      padding?: number;
      label?: ReactNode;
      status?: NodeStatus;
    }
  | {
      type: 'callout';
      target: string;
      text: ReactNode;
      position?: 'top' | 'right' | 'bottom' | 'left';
      status?: NodeStatus;
    };

export type DiagramContext = {
  nodes: Record<string, ResolvedDiagramNode>;
  getNodeCenter: (id: string) => Point;
  getNodeAnchor: (id: string, side: AnchorSide) => Point;
  width: number;
  height: number;
};

export type GraphLayout =
  | 'manual'
  | 'horizontal'
  | 'vertical'
  | 'linked-list'
  | 'tree'
  | 'binary-tree'
  | 'graph'
  | 'circle'
  | 'grid'
  | 'dag';

export type LinearMode =
  | 'array'
  | 'string'
  | 'stack'
  | 'queue'
  | 'deque'
  | 'memory'
  | 'dp-row'
  | 'dp-column';

export type EndCap = 'closed' | 'open' | 'arrow' | 'fade' | 'none';

export type LinearPointer = {
  label: ReactNode;
  index: number;
  position?: 'top' | 'right' | 'bottom' | 'left';
  status?: NodeStatus;
};

export type LinearRange = {
  from: number;
  to: number;
  label?: ReactNode;
  status?: 'active' | 'success' | 'warning' | 'danger';
};

export type LinearOperation =
  | {type: 'push'; side: 'start' | 'end'; label?: ReactNode}
  | {type: 'pop'; side: 'start' | 'end'; label?: ReactNode}
  | {type: 'swap'; from: number; to: number; label?: ReactNode}
  | {type: 'move'; from: number; to: number; label?: ReactNode};

export type MarkerIds = {
  default: string;
  active: string;
  success: string;
  warning: string;
  danger: string;
  muted: string;
};

export type CanvasRenderContext = {
  markerIds: MarkerIds;
};
