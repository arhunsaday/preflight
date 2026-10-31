# Documentation site

[Fumadocs](https://fumadocs.dev) on Next.js (App Router). Deployed on **Vercel**.

```bash
npm install
npm run dev      # dev server, hot reload
npm run build    # production build into .next/
npm run start    # serve the build locally
```

## Layout

| Path | Contents |
| --- | --- |
| `content/docs/**.mdx` | the pages; `meta.json` in each folder sets the sidebar title and order |
| `content/docs/preflight/` | the Preflight CLI, TUI, sharing and desktop app pages |
| `public/` | static assets (logo, favicons) |
| `lib/shared.ts` | site name and GitHub repository |

Callouts use `<Callout type="info|warn|error">`; relative links are written as
absolute `/docs/...` paths.

## Deploying

Import the repo in Vercel with root directory `docs`. The Next.js preset is
detected automatically (`docs/vercel.json` only names the framework). The
production domain is `ai.arhun.fr`.

`.github/workflows/ci.yml` builds the site on every push, so a broken MDX file
fails CI before it reaches Vercel.
