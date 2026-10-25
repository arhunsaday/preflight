import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // The repository root has its own package-lock.json; pin the docs folder.
  turbopack: { root: path.dirname(fileURLToPath(import.meta.url)) },
};

export default withMDX(config);
