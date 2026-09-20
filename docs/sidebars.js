/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  main: [
    'index',
    {
      type: 'category', label: 'Setup', collapsed: false,
      items: ['setup/install', 'setup/what-lands-where', 'setup/new-project'],
    },
    {
      type: 'category', label: 'Claude Code',
      items: [
        'claude-code/fundamentals',
        'claude-code/skills',
        'claude-code/hooks',
        'claude-code/commands-and-agents',
        'claude-code/plugins',
        'claude-code/tips',
      ],
    },
    {
      type: 'category', label: 'MCP',
      items: ['mcp/index', 'mcp/my-servers', 'mcp/recommended', 'mcp/context-and-memory'],
    },
    {
      type: 'category', label: 'Workflows',
      items: [
        'workflows/planning',
        'workflows/architecture',
        'workflows/coding',
        'workflows/debugging',
        'workflows/review',
        'workflows/devops',
        'workflows/observability',
      ],
    },
    {
      type: 'category', label: 'My stack',
      items: ['stack/frontend', 'stack/backend', 'stack/devops', 'stack/ai'],
    },
    {
      type: 'category', label: 'Tools',
      items: ['tools/index', 'tools/rtk', 'tools/remote-control'],
    },
    {
      type: 'category', label: 'Other agents',
      items: ['other-agents/codex', 'other-agents/copilot'],
    },
    'beyond-vibecoding',
  ],
};
export default sidebars;
