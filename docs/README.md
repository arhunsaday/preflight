# Documentation site

Docusaurus. Deployed on **Vercel**.

```bash
npm install
npm start        # dev server, hot reload
npm run build    # production build into build/
npm run serve    # serve the build locally
```

## Deploying

Vercel picks this up from `docs/vercel.json`. Import the repo in Vercel with:

| Setting | Value |
| --- | --- |
| Root directory | `docs` |
| Framework preset | Docusaurus 2 |
| Build command | `npm run build` |
| Output directory | `build` |

Set `url` in `docusaurus.config.js` to the production domain once assigned —
it is only used for canonical links and the sitemap, so a wrong value does not
break the site, it just makes those wrong.

`.github/workflows/ci.yml` builds the site on every push, so a broken link or a
bad MDX file fails CI before it reaches Vercel.
