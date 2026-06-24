import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type { PrismTheme } from 'prism-react-renderer';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

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

const config: Config = {
  title: 'My Site',
  tagline: 'Dinosaurs are cool',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Set the production url of your site here
  url: 'https://to-any.top',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',
  trailingSlash: true,

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'facebook', // Usually your GitHub org/user name.
  projectName: 'docusaurus', // Usually your repo name.

  onBrokenLinks: 'throw',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
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
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        blog: {
          showReadingTime: true,
          remarkPlugins: [remarkMath],
          rehypePlugins: [rehypeKatex],
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-mermaid'],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
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
      title: 'My Site',
      logo: {
        alt: 'My Site Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Tutorial',
        },
        { to: '/blog', label: 'Blog', position: 'left' },
        {
          type: 'search',
          position: 'right',
        },
        {
          href: 'https://github.com/facebook/docusaurus',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Tutorial',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'Stack Overflow',
              href: 'https://stackoverflow.com/questions/tagged/docusaurus',
            },
            {
              label: 'Discord',
              href: 'https://discordapp.com/invite/docusaurus',
            },
            {
              label: 'X',
              href: 'https://x.com/docusaurus',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/facebook/docusaurus',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} My Project, Inc. Built with Docusaurus.`,
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
