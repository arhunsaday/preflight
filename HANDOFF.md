# Reprise du projet ADK — 24 septembre 2026 (mis à jour en fin de session TUI)

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
| TUI | Quatre vues (browse, catalogue, doctor, profils), liste/détail, palette d'actions, formulaire validé, aperçu avant écriture, référence clavier, panneau de résultat | `src/ui/` |
| Partage | Export/import validés, codes courts, Worker Hono KV/R2, token propriétaire, expiration/révocation, page d’inspection avant application | `src/sharing.ts`, `src/worker.ts`, `wrangler.jsonc` |
| Benchmark | Comparaison A/B locale sur révision épinglée, clone/home isolés, métriques, dix tâches et vérificateurs indépendants | `src/bench.ts`, `src/bench-tasks.ts` |
| Compléments | Retrofit AGENTS et détection de stack, délégation Git, packaging npm, documentation et CI Node 22/24 | `src/retrofit.ts`, `ADK.md`, `.github/workflows/` |

## Commits récents

- `490caa4` : implémentation initiale CLI/TUI (commit utilisateur à conserver).
- `66eaf22` : résolution des packages MCP en configurations de lancement épinglées.
- `906a22a` : tolérance des métadonnées MCP incomplètes et synchronisation du test d’entrée TUI.
- `272c0b7` : reconstruction du TUI autour des vues, actions et aperçus.
- `43c887a` : usage mesuré par ressource et préchargement du catalogue.
- `b9f9005` : guidage d'un projet vide, identité de ressource figée à l'édition.
- `d06e17b` : provenance explicite des loadouts ; le contrôle de dépôt passe hors machine d'origine.
- `0aa935e` : indicateur « appliqué » comparé au lockfile.
- `0a323ce` : lignes de panneau clippées à une ligne, findings identifiés par ressource.
- `5ee358c` : test d'échelle 500 ressources et bornage du rendu de contenu.
- `dbb5d36` : ouverture du panneau de résultat et coloration JSON.

## Dernier travail et résultats exacts

### Le TUI a été reconstruit

`src/ui.tsx` (un seul fichier, une liste et un champ de saisie polyvalent) est remplacé par `src/ui/` : `text.ts` et `theme.ts` (primitives), `actions.ts` (catalogue d'actions pur), `form.ts` (état et validation de formulaire), `preview.ts` (résumé de transaction), `components.tsx` (présentation), `app.tsx` (machine à états), `index.tsx` (ré-exports et `startUI`). `src/cli.ts` importe désormais `./ui/index.js`.

Ce que l'interface fait maintenant : quatre vues commutables au clavier ; liste virtualisée à gauche et panneau de détail structuré à droite (empilés sous 74 colonnes, re-rendu au redimensionnement) ; palette d'actions `Ctrl+K` avec correspondance sous-chaîne puis sous-séquence ; formulaire multichamp validé par le même schéma Zod que la CLI, avec choix cyclables et erreurs nommées par champ ; aperçu avant chaque écriture, montrant le diff de ressources, les fichiers touchés avec leurs compteurs de lignes et les avertissements d'adaptateur ; référence clavier ; panneau de résultat en JSON coloré.

Chaque action porte la commande CLI qu'elle exécute, affichée dans la palette, la référence clavier et la ligne d'état ; un test vérifie que chaque `cli` déclaré résout à une vraie commande, pour que l'interface ne devienne jamais le seul chemin.

Deux informations que l'ancienne interface n'avait pas : les invocations mesurées par ressource (skills comptés comme le fait `usage`, serveurs MCP via les noms `mcp__<serveur>__<outil>`, rien du tout si aucun transcript), et l'état « appliqué » comparé à `adk.lock.json`, qui distingue un état désiré arrivé par Git ou édité à la main d'un état déjà écrit dans les fichiers du harness.

### CI

La CI de la branche échouait **avant cette session** (`3977b3e` comprise), sur le job `verify` : `scripts/loadouts.py` considérait comme connue une skill présente dans le magasin local `~/.agents/skills`, si bien que six items de loadout résolvaient sur la machine d'origine et nulle part ailleurs. Un item qui n'est pas embarqué dans ce dépôt déclare maintenant son dépôt d'origine (`"external": "owner/repo"`), validé contre `skills/install-third-party.sh`, et `materializeLoadout` rapporte la commande d'installation. `eli5-succinct` a été **retiré** du loadout `junior` : absent du dépôt, de l'installeur et de la liste des skills installées, rien ne pouvait le résoudre.

Runs 17, 18 et 19 verts sur Node 22 et 24 plus `verify`. C'est la première CI verte de la branche.

### Mesures

`npm run check` : **78 tests dans 16 fichiers**, lint, types et build réussis. Suite Python : **33 tests** (26 auparavant, plus `tests/test_loadouts.py`). `python3 scripts/kit.py check` : 0 problème.

Rendu vérifié dans un vrai PTY (tmux) à 60, 80, 110 et 120 colonnes : première ouverture d'un projet vide, `init`, browse, catalogue avec recherche, doctor, profils, palette, formulaire, aperçu, référence clavier, panneau de résultat. Trois défauts trouvés ainsi et corrigés : dépassement de largeur du panneau de détail, lignes de panneau qui passaient à deux lignes et rognaient un caractère, marqueur de portée rendu `…` en colonne étroite.

Échelle : avec 500 ressources, environ **20 ms par image rendue** sur cette machine, et une rafale de 60 touches se résout en **une seule image, en 20 ms au total** (React groupe les mises à jour). Le test `tests/ui-scale.test.tsx` fige le bornage de la liste et une borne large sur la rafale.

### Vérifications antérieures

Conservées des sessions précédentes, non répétées ici : recherche réelle via le build, `mcpRegistry.search('filesystem')` renvoyant **83 résultats**, dont **80 avec configuration de lancement** et **3 sans URL de dépôt** — ce qui vérifie la découverte et la conversion, pas qu'un de ces serveurs démarre ; bundle navigateur du Worker ; installation d'un tarball npm dans un préfixe temporaire ; smoke CLI dans un home temporaire ; audit npm sans vulnérabilité.

Une revue indépendante de la branche avait trouvé sept problèmes, corrigés avant cette session : suivi des adaptateurs partiellement défaillants, détection de credentials au partage, skills distants non résolus/fichiers annexes, SHA Git considéré comme secret, sortie TUI non défilante, propriété des chemins supprimés et benchmarks avec configuration partiellement appliquée.

## Ce qui reste à faire

### Priorité 1 — valider les intégrations réelles

1. ~~Vérifier les jobs CI~~ : fait. CI verte sur Node 22/24 et `verify` depuis `d06e17b`. Continuer à la surveiller, notamment la stabilité des tests TUI, qui dépendent du temps : le pilote de test attend l'absence de spinner avant chaque touche, parce que l'interface ignore les touches pendant qu'une commande tourne.
2. Exécuter un smoke du Worker avec Wrangler et KV/R2 locaux. Le bundle et les tests du Worker passent, mais aucun environnement Wrangler réel ni déploiement Cloudflare n’a été validé. Non fait dans cette session : Wrangler n'est pas une dépendance du dépôt.
3. Tester les parcours sur de vraies installations Claude/Cursor et les installateurs délégués, avec des ressources de test et sans écraser la configuration personnelle. Aucun téléchargement de plugin ou serveur externe n’a été effectué. Le TUI a été exercé de bout en bout sur un projet jetable (`init`, recherche catalogue, ajout, `sync`, déplacement de portée), pas sur une configuration personnelle réelle.
4. Exécuter un véritable benchmark agent A/B et recueillir les métriques ; le runner et les dix tâches sont implémentés, mais aucun run payant d’agent n’a été lancé.
5. Revue ciblée des ajouts : le TUI de cette session a été relu à la main et exercé dans un PTY, sans revue indépendante. Les plugins Claude et la conversion du registre MCP n'ont **pas** été revus à nouveau.

### Priorité 2 — écarts fonctionnels connus

- **MCP.Directory** : ingestion directe absente. Les requêtes directes ont renvoyé HTTP 403 ; aucune API publique documentée exploitable n’a été trouvée. Chercher une intégration officielle autorisée, sans inventer de contrat ni contourner le blocage.
- **Ressources déjà installées** : détectées mais pas automatiquement adoptées. Un mécanisme explicite d’adoption, avec preview et protection des fichiers existants, serait une extension utile. Le stockage partagé `~/.agents/skills` n’est pas un emplacement géré par les adaptateurs actuels.
- **Couverture des catalogues** : limites de 100 résultats par source, recherche GitHub par chemins, assets distants textuels et bornés uniquement. La découverte locale ne couvre pas nécessairement chaque type dans chaque format externe.
- **Robustesse MCP** : la conversion couvre HTTP/SSE et npm/PyPI standard épinglés. Tester davantage de variantes de packages et d’arguments ; les types de packages non pris en charge restent explicites. Le schéma de réponse valide encore le lot entier : une nouvelle forme invalide pourrait rendre la source indisponible, sans casser les autres sources.
- **Interface** : une commande en cours n'est pas annulable ; les touches sont ignorées pendant son exécution. `verify` et `install` s'affichent en JSON brut coloré, pas en panneau structuré. Les ressources détectées mais non gérées ne sont visibles que par `detect` et le doctor, pas adoptables depuis l'interface.
- ~~Reprendre les critères de `PLAN.md` point par point~~ : fait, dans `ACCEPTANCE.md`. Six écarts y sont retenus, trois autres ont été corrigés plutôt que consignés.

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

Pour regarder le TUI sans terminal interactif, `tmux` alloue un PTY :

```sh
tmux new-session -d -s adk -x 120 -y 36 "node dist/cli.js ui --root /tmp/demo --home /tmp/demo/home"
sleep 2; tmux send-keys -t adk 2; sleep 1; tmux capture-pane -p -t adk; tmux kill-session -t adk
```

Utiliser un répertoire projet/home temporaire pour les tests d’écriture via le service. Les tests existants montrent les fixtures et les contextes injectés. Les logs de développement locaux sont dans `.superpowers/sdd/PLAN/`, mais ne sont pas transportés par Git.
