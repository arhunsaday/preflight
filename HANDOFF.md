# Reprise du projet ADK — 24 septembre 2026

## Demande et règles de travail

Implémenter le projet décrit dans `PLAN.md`, sans demander de précisions à l’utilisateur. Il a ensuite demandé de **committer et pousser au fur et à mesure**. Continuer sur `codex/implement-adk-tui`, avec des lots vérifiés. Ne pas confondre « code local livré » et « toute la roadmap réalisée ». Aucune garantie d’absence totale de bugs n’est possible.

Dépôt local : `/Users/asaday/Repos/ai-dev-kit`. Upstream : `origin/codex/implement-adk-tui`. Le remote configuré utilise encore `https://github.com/Jeusto/ai-coding-setup.git` ; GitHub accepte les pushes et signale le déplacement vers `https://github.com/arhunsaday/preflight.git`.

Lire `PLAN.md` pour l’objectif produit et `ADK.md` pour les commandes, la matrice de support et les limitations. Le journal local `.superpowers/sdd/PLAN/progress.md` est ignoré par Git et certaines anciennes conclusions y sont dépassées : **les plugins Claude sont maintenant pris en charge et les pushes autorisés**. Ce document sert de reprise portable.

## État livré

Le socle local est implémenté en TypeScript / Node 22+, avec CLI Commander et TUI Ink/React utilisant le même service. La roadmap a été traitée comme des tranches fonctionnelles P0/P1 ; les fonctionnalités commerciales et multi-utilisateur annoncées comme futures n’ont pas été inventées.

| Domaine | Réalisation | Fichiers principaux |
| --- | --- | --- |
| Modèle | Schéma Zod commun, neuf types de ressources, profils, scopes global/projet, état désiré et lockfile | `src/schema.ts`, `src/state.ts`, `src/diff.ts` |
| Transactions | Prévisualisation, écritures atomiques, journal, verrou, contrôle des modifications concurrentes, rollback et récupération après interruption | `src/transaction.ts`, `src/service.ts` |
| Adaptateurs | Claude Code et Cursor ; capacités explicites, isolation des erreurs, conservation des entrées non gérées | `src/adapters.ts` |
| Ressources | CRUD, fork, déplacement de scope, profils, fichiers annexes des skills et scripts des hooks | `src/service.ts`, `src/commands.ts` |
| Catalogue | 93 entrées issues du dépôt, loadouts, sources locales, GitHub avec commit épinglé, skills.sh et registre MCP officiel | `catalog/`, `src/catalog.ts`, `src/loadouts.ts` |
| MCP | HTTP/SSE et packages npm/PyPI stdio épinglés ; références de variables ; formats non pris en charge inspectables mais refusés à l’application | `src/registry.ts` |
| Inspection | Matérialisation et inspection des skills distants avant application, contenu et provenance | `src/catalog.ts` |
| Installation | Délégation explicite à npx skills, mcpm, brew/npm et Claude CLI pour les plugins | `src/operations.ts` |
| Plugins Claude | Installation déléguée, paramètres enabledPlugins, activation/désactivation et déplacement réversibles | `src/adapters.ts`, `src/operations.ts` |
| Doctor / usage | Conflits, estimation statique du contexte, permissions Claude, consommation mesurée via tool_use JSONL ; propositions de pruning uniquement | `src/analysis.ts`, `src/service.ts` |
| Vérification MCP | Validation statique par défaut ; connexion explicite avec initialize/listTools via le SDK | `src/verify.ts` |
| TUI | Liste bornée pour 500 ressources, filtres, formulaires, preview/confirm, sortie défilante, recherche catalogue puis inspection et ajout | `src/ui.tsx` |
| Partage | Export/import validés, codes courts, Worker Hono KV/R2, token propriétaire, expiration/révocation, page d’inspection avant application | `src/sharing.ts`, `src/worker.ts`, `wrangler.jsonc` |
| Benchmark | Comparaison A/B locale sur révision épinglée, clone/home isolés, métriques, dix tâches et vérificateurs indépendants | `src/bench.ts`, `src/bench-tasks.ts` |
| Compléments | Retrofit AGENTS et détection de stack, délégation Git, packaging npm, documentation et CI Node 22/24 | `src/retrofit.ts`, `ADK.md`, `.github/workflows/` |

## Commits récents

- `c077e99` : état de configuration typé.
- `490caa4` : implémentation initiale CLI/TUI (commit utilisateur à conserver).
- `15c7de6` : tâches benchmark, documentation du paquet et CI.
- `9bd2b68` : plugins Claude et audit des permissions.
- `655a9d0` : recherche catalogue → inspection → ajout dans le TUI.
- `66eaf22` : résolution des packages MCP en configurations de lancement épinglées.
- `906a22a` : tolérance des métadonnées MCP incomplètes et synchronisation du test d’entrée TUI.

## Dernier travail et résultats exacts

Le test réel du registre MCP a révélé `repository: {}` et des packages sans `version`. Le schéma les accepte désormais comme métadonnées, sans générer un lanceur non épinglé. Deux régressions ont été observées rouges puis vertes.

Un test TUI était intermittent : il envoyait des touches avant la fin des effets React/Ink ou pendant le travail asynchrone. Le helper de test attend maintenant la disponibilité et laisse s’exécuter les effets entre les touches. Le code applicatif n’a pas été modifié pour masquer ce problème ; surveiller sa stabilité en CI.

Dernière vérification complète : `npm run check` **réussi, 53 tests dans 14 fichiers**, lint, types et build réussis. Recherche réelle via le build : `mcpRegistry.search('filesystem')` renvoie **83 résultats**, dont **80 avec configuration de lancement**, et **3 sans URL de dépôt**. Cela vérifie la découverte et la conversion ; cela ne prouve pas que ces 80 serveurs démarrent.

Vérifications antérieures réussies : suite Python existante (26 tests), `scripts/kit.py check`, bundle navigateur du Worker, installation d’un tarball npm dans un préfixe temporaire, interaction TTY réelle, smoke CLI dans un home temporaire et audit npm sans vulnérabilité. Ces vérifications antérieures n’ont pas toutes été répétées après chaque commit ; les 53 tests et le build sont les résultats les plus récents.

Une revue indépendante de la branche a trouvé sept problèmes corrigés : suivi des adaptateurs partiellement défaillants, détection de credentials au partage, skills distants non résolus/fichiers annexes, SHA Git considéré comme secret, sortie TUI non défilante, propriété des chemins supprimés et benchmarks avec configuration partiellement appliquée.

## Ce qui reste à faire

### Priorité 1 — valider les intégrations réelles

1. Vérifier les jobs CI du dernier push sur Node 22/24 (les tests locaux tournent sur Node 25.2.1). Corriger tout échec avéré, en particulier la stabilité du test TUI.
2. Exécuter un smoke du Worker avec Wrangler et KV/R2 locaux. Le bundle et les tests du Worker passent, mais aucun environnement Wrangler réel ni déploiement Cloudflare n’a été validé.
3. Tester les parcours sur de vraies installations Claude/Cursor et les installateurs délégués, avec des ressources de test et sans écraser la configuration personnelle. Aucun téléchargement de plugin ou serveur externe n’a été effectué dans cette session.
4. Exécuter un véritable benchmark agent A/B et recueillir les métriques ; le runner et les dix tâches sont implémentés, mais aucun run payant d’agent n’a été lancé.
5. Refaire une revue ciblée des ajouts postérieurs à la revue initiale : plugins, parcours TUI catalogue et conversion du registre MCP.

### Priorité 2 — écarts fonctionnels connus

- **MCP.Directory** : ingestion directe absente. Les requêtes directes ont renvoyé HTTP 403 ; aucune API publique documentée exploitable n’a été trouvée. Chercher une intégration officielle autorisée, sans inventer de contrat ni contourner le blocage.
- **Ressources déjà installées** : détectées mais pas automatiquement adoptées. Un mécanisme explicite d’adoption, avec preview et protection des fichiers existants, serait une extension utile. Le stockage partagé `~/.agents/skills` n’est pas un emplacement géré par les adaptateurs actuels.
- **Couverture des catalogues** : limites de 100 résultats par source, recherche GitHub par chemins, assets distants textuels et bornés uniquement. La découverte locale ne couvre pas nécessairement chaque type dans chaque format externe.
- **Robustesse MCP** : la conversion couvre HTTP/SSE et npm/PyPI standard épinglés. Tester davantage de variantes de packages et d’arguments ; les types de packages non pris en charge restent explicites. Le schéma de réponse valide encore le lot entier : une nouvelle forme invalide pourrait rendre la source indisponible, sans casser les autres sources.
- Reprendre les critères de `PLAN.md` point par point pour identifier les écarts restants avant d’annoncer la roadmap complète ; cette liste ne remplace pas un audit d’acceptation.

### Configuration externe et roadmap différée

- Déploiement public du partage : renseigner le compte Cloudflare, KV, R2, le token et le domaine. `wrangler.jsonc` contient des identifiants de remplacement. Rien n’est déployé sur `adk.sh`.
- skills.sh nécessite `VERCEL_OIDC_TOKEN` ; GitHub peut utiliser `GITHUB_TOKEN`. Ne jamais committer les secrets.
- Authentification multi-utilisateur/OIDC, administration d’organisations, catalogue/politiques hébergés, synchronisation cloud, analytique de maturité, facturation et marketplace : non implémentés, roadmap future.
- Les validations humaines du plan (acceptation des loadouts, synchronisation sur deux machines pendant une semaine, accord entre pruning mesuré et jugement humain) restent à effectuer ; des tests automatisés ne les remplacent pas.

## Limites à préserver

- Les opérations Git et package managers déléguées ne sont pas couvertes par le rollback local ADK.
- Les types non supportés par un harness ne doivent jamais être présentés comme actifs. Cursor ne prend notamment pas en charge les plugins Claude.
- Absence de transcripts = usage inconnu, pas inutilisation. Prune ne supprime rien automatiquement.
- Le scanner de secrets est heuristique ; ne pas promettre une détection exhaustive.
- `skipLibCheck` et un cast étroit du transport MCP compensent une incompatibilité de déclarations du SDK avec exactOptionalPropertyTypes ; le code applicatif reste strict.
- Conserver les changements de l’utilisateur et la branche existante ; ne pas merger, publier sur npm ou déployer implicitement à la place d’un simple push.

## Commandes pour reprendre

```sh
git status --short
git log -8 --oneline
npm ci
npm run check
npm run build:worker
python3 -m unittest discover -s tests
python3 scripts/kit.py check
node dist/cli.js --help
node dist/cli.js ui
```

Utiliser un répertoire projet/home temporaire pour les tests d’écriture via le service. Les tests existants montrent les fixtures et les contextes injectés. Les logs de développement locaux sont dans `.superpowers/sdd/PLAN/`, mais ne sont pas transportés par Git.
