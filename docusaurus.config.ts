import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type {PrismTheme} from 'prism-react-renderer';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import normalizeMathUnicode from './src/remark/normalizeMathUnicode';

const quartzLightCodeTheme: PrismTheme = {
  plain: {
    color: '#24292f',
    backgroundColor: '#f7f7f7',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: {
        color: '#6b7280',
        fontStyle: 'italic',
      },
    },
    {
      types: ['punctuation'],
      style: {
        color: '#667085',
      },
    },
    {
      types: ['operator', 'entity', 'url'],
      style: {
        color: '#0f766e',
      },
    },
    {
      types: ['keyword', 'atrule', 'important'],
      style: {
        color: '#b42318',
        fontWeight: '600',
      },
    },
    {
      types: ['builtin', 'class-name', 'namespace'],
      style: {
        color: '#6941c6',
      },
    },
    {
      types: ['function'],
      style: {
        color: '#7a2e8f',
      },
    },
    {
      types: ['property', 'attr-name', 'variable'],
      style: {
        color: '#0550ae',
      },
    },
    {
      types: ['tag', 'selector'],
      style: {
        color: '#116329',
      },
    },
    {
      types: ['string', 'char', 'attr-value', 'inserted'],
      style: {
        color: '#0a7f5a',
      },
    },
    {
      types: ['number', 'boolean', 'constant', 'symbol'],
      style: {
        color: '#953800',
      },
    },
    {
      types: ['regex'],
      style: {
        color: '#9a6700',
      },
    },
    {
      types: ['deleted'],
      style: {
        color: '#b42318',
      },
    },
    {
      types: ['bold'],
      style: {
        fontWeight: '700',
      },
    },
    {
      types: ['italic'],
      style: {
        fontStyle: 'italic',
      },
    },
  ],
};

const quartzDarkCodeTheme: PrismTheme = {
  plain: {
    color: '#e6edf3',
    backgroundColor: '#141414',
  },
  styles: [
    {
      types: ['comment', 'prolog', 'doctype', 'cdata'],
      style: {
        color: '#8b949e',
        fontStyle: 'italic',
      },
    },
    {
      types: ['punctuation'],
      style: {
        color: '#c9d1d9',
      },
    },
    {
      types: ['operator', 'entity', 'url'],
      style: {
        color: '#7ee7d1',
      },
    },
    {
      types: ['namespace', 'builtin', 'class-name'],
      style: {
        color: '#d2a8ff',
      },
    },
    {
      types: ['keyword', 'atrule', 'important'],
      style: {
        color: '#ff8f86',
        fontWeight: '600',
      },
    },
    {
      types: ['function'],
      style: {
        color: '#f2cc60',
      },
    },
    {
      types: ['property', 'attr-name', 'variable'],
      style: {
        color: '#79c0ff',
      },
    },
    {
      types: ['tag', 'selector'],
      style: {
        color: '#7ee787',
      },
    },
    {
      types: ['string', 'char', 'attr-value', 'inserted'],
      style: {
        color: '#a5d6ff',
      },
    },
    {
      types: ['number', 'boolean', 'constant', 'symbol'],
      style: {
        color: '#ffa657',
      },
    },
    {
      types: ['regex'],
      style: {
        color: '#d2a8ff',
      },
    },
    {
      types: ['deleted'],
      style: {
        color: '#ff7b72',
      },
    },
    {
      types: ['bold'],
      style: {
        fontWeight: '700',
      },
    },
    {
      types: ['italic'],
      style: {
        fontStyle: 'italic',
      },
    },
  ],
};

const katexOptions = {
  strict: (errorCode: string) =>
    errorCode === 'unicodeTextInMathMode' ? 'ignore' : 'warn',
};

const config: Config = {
  title: 'To Any Docs',
  tagline: '学习、技术与项目实践的长期知识库',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
    faster: true,
  },

  url: 'https://to-any.top',
  baseUrl: '/',
  trailingSlash: true,

  organizationName: 'ActiveInsighter',
  projectName: 'Docusaurus',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
    localeConfigs: {
      'zh-Hans': {
        label: '简体中文',
        htmlLang: 'zh-CN',
      },
    },
  },

  markdown: {
    mermaid: true,
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          numberPrefixParser: false,
          remarkPlugins: [normalizeMathUnicode, remarkMath],
          rehypePlugins: [[rehypeKatex, katexOptions]],
          editUrl: 'https://github.com/ActiveInsighter/Docusaurus/edit/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],

  themeConfig: {
    colorMode: {
      respectPrefersColorScheme: true,
    },
    algolia: {
      appId: 'CAESKGNRU8',
      apiKey: '25ada381258c861fb09be16f7b6f4710',
      indexName: 'Docs',
      contextualSearch: true,
      searchPagePath: 'search',
      placeholder: '搜索文档',
      translations: {
        button: {
          buttonText: '搜索',
          buttonAriaLabel: '搜索文档',
        },
        modal: {
          searchBox: {
            placeholderText: '搜索文档',
            searchInputLabel: '搜索文档',
            clearButtonTitle: '清空搜索',
            clearButtonAriaLabel: '清空搜索',
            closeButtonText: '取消',
            closeButtonAriaLabel: '取消',
          },
        },
      },
    },
    navbar: {
      title: 'To Any Docs',
      logo: {
        alt: 'To Any Docs',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: '文档',
        },
        {
          type: 'search',
          position: 'right',
        },
        {
          href: 'https://github.com/ActiveInsighter/Docusaurus',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '内容',
          items: [
            {
              label: '文档总览',
              to: '/docs/overview',
            },
            {
              label: '搜索文档',
              to: '/search',
            },
          ],
        },
        {
          title: '项目',
          items: [
            {
              label: 'GitHub 仓库',
              href: 'https://github.com/ActiveInsighter/Docusaurus',
            },
            {
              label: '问题反馈',
              href: 'https://github.com/ActiveInsighter/Docusaurus/issues',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} To Any Docs. Built with Docusaurus.`,
    },
    prism: {
      theme: quartzLightCodeTheme,
      darkTheme: quartzDarkCodeTheme,
      additionalLanguages: [
        'bash',
        'c',
        'cpp',
        'csharp',
        'dart',
        'diff',
        'json',
        'java',
        'markdown',
        'mermaid',
        'python',
        'rust',
        'go',
        'php',
        'powershell',
        'ruby',
        'swift',
        'kotlin',
        'scala',
      ],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
