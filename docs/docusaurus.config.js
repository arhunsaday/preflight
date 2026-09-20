// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'ai-dev-kit',
  tagline: 'My AI development setup — skills, hooks, MCP, and the workflows around them',
  favicon: 'img/favicon.ico',
  future: {v4: true},

  url: 'https://arhunsaday.github.io',
  baseUrl: '/ai-dev-kit/',
  organizationName: 'arhunsaday',
  projectName: 'ai-dev-kit',
  onBrokenLinks: 'warn',
  markdown: {hooks: {onBrokenMarkdownLinks: 'warn'}},

  i18n: {defaultLocale: 'en', locales: ['en']},

  presets: [
    ['classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          routeBasePath: '/',
        },
        blog: false,
        theme: {customCss: './src/css/custom.css'},
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {defaultMode: 'dark', respectPrefersColorScheme: true},
      navbar: {
        title: 'ai-dev-kit',
        items: [
          {type: 'docSidebar', sidebarId: 'main', position: 'left', label: 'Docs'},
          {href: 'https://github.com/arhunsaday/ai-dev-kit', label: 'GitHub', position: 'right'},
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Official docs',
            items: [
              {label: 'Claude Code', href: 'https://code.claude.com/docs/en/overview'},
              {label: 'Best practices', href: 'https://code.claude.com/docs/en/best-practices'},
              {label: 'Prompt engineering', href: 'https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview'},
              {label: 'MCP', href: 'https://modelcontextprotocol.io'},
            ],
          },
          {
            title: 'Catalogs',
            items: [
              {label: 'skills.sh', href: 'https://www.skills.sh/'},
              {label: 'awesome-claude-code', href: 'https://github.com/hesreallyhim/awesome-claude-code'},
              {label: 'awesome-mcp-servers', href: 'https://github.com/punkpeye/awesome-mcp-servers'},
            ],
          },
        ],
      },
      prism: {theme: prismThemes.github, darkTheme: prismThemes.dracula},
    }),
};

export default config;
