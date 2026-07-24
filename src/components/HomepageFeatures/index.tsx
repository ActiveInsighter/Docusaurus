import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: '系统化复习',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        集中整理数学、计算机基础与考研复习资料，按主题和章节组织，便于查漏补缺与长期回顾。
      </>
    ),
  },
  {
    title: '算法与技术笔记',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        收录数据结构、算法、软件工程和项目实践内容，并通过代码块、公式与图表增强阅读体验。
      </>
    ),
  },
  {
    title: '持续自动更新',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        使用 GitHub Actions 自动检查、生成和更新文档，构建状态与最近运行记录可直接在仓库中查看。
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" aria-label={title} />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props) => (
            <Feature key={props.title} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
