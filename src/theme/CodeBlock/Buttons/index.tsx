import React, {type ReactNode} from 'react';
import clsx from 'clsx';

import CopyButton from '@theme/CodeBlock/Buttons/CopyButton';
import WordWrapButton from '@theme/CodeBlock/Buttons/WordWrapButton';
import type {Props} from '@theme/CodeBlock/Buttons';

import styles from './styles.module.css';

export default function CodeBlockButtons({className}: Props): ReactNode {
  return (
    <div className={clsx(className, styles.buttonGroup)}>
      <WordWrapButton className={styles.toolbarButton} />
      <CopyButton className={styles.toolbarButton} />
    </div>
  );
}
