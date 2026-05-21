import type {ReactNode} from 'react';

import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';

type Props = {
  children: ReactNode;
};

export default function Root({children}: Props): ReactNode {
  return children;
}
