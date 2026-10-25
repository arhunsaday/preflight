import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // The repository root has its own package-lock.json; pin the docs folder.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
  // The Docusaurus site served pages at the root; keep its links working.
  async redirects() {
    return [
      { source: '/ai/jev', destination: '/docs/stack/jev', permanent: true },
      {
        source:
          '/:section(setup|claude-code|mcp|other-agents|stack|tools|workflows)/:page*',
        destination: '/docs/:section/:page*',
        permanent: true,
      },
      {
        source: '/:page(beyond-vibecoding|ecosystem)',
        destination: '/docs/:page',
        permanent: true,
      },
    ];
  },
};

export default withMDX(config);
