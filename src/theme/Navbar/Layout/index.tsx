import React, {type ComponentProps, type ReactNode} from 'react';
import OriginalNavbarLayout from '@theme-original/Navbar/Layout';

import styles from './styles.module.css';

type Props = ComponentProps<typeof OriginalNavbarLayout>;

function NavbarGradientMaterial(): ReactNode {
  return (
    <div
      aria-hidden="true"
      className={styles.material}
      data-navbar-material="true">
      <div
        className={styles.softBlur}
        data-navbar-material-layer="soft"
      />
      <div
        className={styles.strongBlur}
        data-navbar-material-layer="strong"
      />
      <div className={styles.tint} data-navbar-material-layer="tint" />
    </div>
  );
}

export default function NavbarLayout(props: Props): ReactNode {
  return (
    <>
      <NavbarGradientMaterial />
      <OriginalNavbarLayout {...props} />
    </>
  );
}
