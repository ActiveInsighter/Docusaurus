import React, {type ReactNode} from 'react';

import LinearDiagram, {type LinearDiagramProps} from './LinearDiagram';

type PresetProps = Omit<LinearDiagramProps, 'mode'>;

export function ArrayDiagram(props: PresetProps): ReactNode {
  return <LinearDiagram mode="array" startCap="closed" endCap="closed" {...props} />;
}

export function StringDiagram(props: PresetProps): ReactNode {
  return <LinearDiagram mode="string" startCap="closed" endCap="closed" {...props} />;
}

export function StackDiagram(props: PresetProps): ReactNode {
  return (
    <LinearDiagram
      mode="stack"
      orientation="vertical"
      startCap="closed"
      endCap="open"
      showIndex={false}
      {...props}
    />
  );
}

export function QueueDiagram(props: PresetProps): ReactNode {
  return (
    <LinearDiagram
      mode="queue"
      orientation="horizontal"
      startCap="open"
      endCap="open"
      showIndex={false}
      {...props}
    />
  );
}

export function DequeDiagram(props: PresetProps): ReactNode {
  return (
    <LinearDiagram
      mode="deque"
      orientation="horizontal"
      startCap="open"
      endCap="open"
      showIndex={false}
      {...props}
    />
  );
}
