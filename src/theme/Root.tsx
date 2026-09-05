import type {ReactNode} from 'react';
import {AnswerVisibilityProvider} from '@site/src/components/Question';

import '@fontsource-variable/jetbrains-mono/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import '@site/src/css/font-override.css';

type Props = {
  children: ReactNode;
};

export default function Root({children}: Props): ReactNode {
  return (
    <AnswerVisibilityProvider>{children}</AnswerVisibilityProvider>
  );
}
