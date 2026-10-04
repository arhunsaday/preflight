# Reprise du projet ADK — 24 septembre 2026 (mis à jour en fin de session TUI)

## Demande et règles de travail

Implémenter le projet décrit dans `PLAN.md`, sans demander de précisions à l’utilisateur. Il a ensuite demandé de **committer et pousser au fur et à mesure**, puis de pousser directement sur `main`. Travailler par lots vérifiés. Ne pas confondre « code local livré » et « toute la roadmap réalisée ». Aucune garantie d’absence totale de bugs n’est possible.

Dépôt : `https://github.com/arhunsaday/preflight`. **Le travail est sur `main`** depuis `6f5f2df` : `codex/implement-adk-tui` a été avancée en fast-forward sur `main`, sans commit de fusion, et les deux références sont identiques. La branche de travail subsiste mais n'est plus la destination.

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
- `272c0b7` : reconstruction du TUI autour des vues, actions et aperçus.
- `43c887a` : usage mesuré par ressource et préchargement du catalogue.
- `b9f9005` : guidage d'un projet vide, identité de ressource figée à l'édition.
- `d06e17b` : provenance explicite des loadouts ; le contrôle de dépôt passe hors machine d'origine.
- `0aa935e` : indicateur « appliqué » comparé au lockfile.
- `0a323ce` : lignes de panneau clippées, findings identifiés par ressource.
- `5ee358c` : test d'échelle 500 ressources et bornage du rendu de contenu.
- `dbb5d36` : ouverture du panneau de résultat et coloration JSON.
- `3bbbbc2` : sources de catalogue tolérantes, version courante du registre MCP, script de status line.
- `eecef3c` : `ACCEPTANCE.md`, audit du plan critère par critère.
- `a3f4d6a` : `unmanaged` et `adopt`, vue **Detected** du TUI.

## Dernier travail et résultats exacts

### Le TUI a été reconstruit

`src/ui.tsx` (un seul fichier, une liste et un champ de saisie polyvalent) est remplacé par `src/ui/` : `text.ts` et `theme.ts` (primitives), `actions.ts` (catalogue d'actions pur), `form.ts` (état et validation de formulaire), `preview.ts` (résumé de transaction), `components.tsx` (présentation), `app.tsx` (machine à états), `index.tsx` (ré-exports et `startUI`). `src/cli.ts` importe désormais `./ui/index.js`.

Ce que l'interface fait maintenant : quatre vues commutables au clavier ; liste virtualisée à gauche et panneau de détail structuré à droite (empilés sous 74 colonnes, re-rendu au redimensionnement) ; palette d'actions `Ctrl+K` avec correspondance sous-chaîne puis sous-séquence ; formulaire multichamp validé par le même schéma Zod que la CLI, avec choix cyclables et erreurs nommées par champ ; aperçu avant chaque écriture, montrant le diff de ressources, les fichiers touchés avec leurs compteurs de lignes et les avertissements d'adaptateur ; référence clavier ; panneau de résultat en JSON coloré.

Chaque action porte la commande CLI qu'elle exécute, affichée dans la palette, la référence clavier et la ligne d'état ; un test vérifie que chaque `cli` déclaré résout à une vraie commande, pour que l'interface ne devienne jamais le seul chemin.

Deux informations que l'ancienne interface n'avait pas : les invocations mesurées par ressource (skills comptés comme le fait `usage`, serveurs MCP via les noms `mcp__<serveur>__<outil>`, rien du tout si aucun transcript), et l'état « appliqué » comparé à `adk.lock.json`, qui distingue un état désiré arrivé par Git ou édité à la main d'un état déjà écrit dans les fichiers du harness.

### CI

La CI de la branche échouait **avant cette session** (`3977b3e` comprise), sur le job `verify` : `scripts/loadouts.py` considérait comme connue une skill présente dans le magasin local `~/.agents/skills`, si bien que six items de loadout résolvaient sur la machine d'origine et nulle part ailleurs. Un item qui n'est pas embarqué dans ce dépôt déclare maintenant son dépôt d'origine (`"external": "owner/repo"`), validé contre `skills/install-third-party.sh`, et `materializeLoadout` rapporte la commande d'installation. `eli5-succinct` a été **retiré** du loadout `junior` : absent du dépôt, de l'installeur et de la liste des skills installées, rien ne pouvait le résoudre.

Runs 17, 18 et 19 verts sur Node 22 et 24 plus `verify`. C'est la première CI verte de la branche.

### Adoption de l'existant

`unmanaged` liste ce qu'un harnais contient et que le profil actif ne gère pas ; `adopt` l'amène sous gestion **là où il est**. La ressource enregistre `adoptedBy` et `adoptedPath` (relatif à la base du harnais), l'adaptateur vise ce chemin, et un fichier dont le contenu correspond déjà n'est pas réécrit : la transaction n'ajoute que l'entrée de configuration et l'empreinte du lockfile, donc la dérive est détectée ensuite. `delete` retire le fichier, `rollback` le remet. Un chemin adopté qui tente de sortir du répertoire du harnais est ignoré au profit du chemin géré par ADK. Les types portés par un fichier de réglages s'adoptent en reconnaissant l'entrée déjà présente ; l'écriture des hooks est devenue idempotente pour ne pas dupliquer celle qu'on adopte.

Vérifié avec un vrai installateur, dans un HOME isolé : `npx skills@latest add vercel-labs/agent-skills --skill deploy-to-vercel --agent claude-code -g -y` installe **un vrai répertoire dans `~/.claude/skills`**, sans magasin `~/.agents/skills`. ADK le détecte comme non géré et l'adopte, empreinte du fichier inchangée. Le magasin partagé que documente `skills/THIRD-PARTY.md` relève donc d'une version ou d'options antérieures ; là où il existe, les skills y sont atteintes par lien symbolique et l'adoption les refuse explicitement, puisqu'ADK n'écrit jamais au travers d'un lien.

Limite : seules les ressources situées dans les répertoires des harnais sont détectées.

### Mesures

`npm run check` : **85 tests dans 16 fichiers**, lint, types et build réussis. Suite Python : **33 tests** (26 auparavant, plus `tests/test_loadouts.py`). `python3 scripts/kit.py check` : 0 problème.

Rendu vérifié dans un vrai PTY (tmux) à 60, 80, 110 et 120 colonnes : première ouverture d'un projet vide, `init`, browse, catalogue avec recherche, doctor, profils, palette, formulaire, aperçu, référence clavier, panneau de résultat. Trois défauts trouvés ainsi et corrigés : dépassement de largeur du panneau de détail, lignes de panneau qui passaient à deux lignes et rognaient un caractère, marqueur de portée rendu `…` en colonne étroite.

Échelle : avec 500 ressources, environ **20 ms par image rendue** sur cette machine, et une rafale de 60 touches se résout en **une seule image, en 20 ms au total** (React groupe les mises à jour). Le test `tests/ui-scale.test.tsx` fige le bornage de la liste et une borne large sur la rafale.

### Vérifications antérieures

Conservées des sessions précédentes, non répétées ici : recherche réelle via le build, `mcpRegistry.search('filesystem')` renvoyant **83 résultats**, dont **80 avec configuration de lancement** et **3 sans URL de dépôt** — ce qui vérifie la découverte et la conversion, pas qu'un de ces serveurs démarre ; bundle navigateur du Worker ; installation d'un tarball npm dans un préfixe temporaire ; smoke CLI dans un home temporaire ; audit npm sans vulnérabilité.

Une revue indépendante de la branche avait trouvé sept problèmes, corrigés avant cette session : suivi des adaptateurs partiellement défaillants, détection de credentials au partage, skills distants non résolus/fichiers annexes, SHA Git considéré comme secret, sortie TUI non défilante, propriété des chemins supprimés et benchmarks avec configuration partiellement appliquée.

## Ce qui reste à faire

### Priorité 1 — valider les intégrations réelles

1. ~~Vérifier les jobs CI~~ : fait. CI verte sur Node 22/24 et `verify` depuis `d06e17b`. Continuer à la surveiller, notamment la stabilité des tests TUI, qui dépendent du temps : le pilote de test attend l'absence de spinner avant chaque touche, parce que l'interface ignore les touches pendant qu'une commande tourne.
2. ~~Exécuter un smoke du Worker avec Wrangler et KV/R2 locaux~~ : fait. `npm run smoke:worker` (voir `scripts/worker-smoke.sh`) lance un vrai runtime Wrangler avec KV et R2 locaux et vérifie neuf comportements : partage absent, publication avec et sans jeton, page d'inspection qui nomme les variables requises sans porter leur valeur, relecture, révocation avec et sans jeton. Wrangler est téléchargé par `npx`, pas ajouté aux dépendances. **Le déploiement Cloudflare reste à faire** et demande le compte de l'auteur.
3. Installateurs délégués : **deux des quatre ont été exécutés pour de vrai** dans cette session, sur des répertoires jetables.
   - `npx skills@latest add … -g -y` : installe un vrai répertoire dans `~/.claude/skills` ; ADK le détecte et l'adopte, empreinte inchangée. Un défaut corrigé au passage : `--agent` ne prend qu'un argument.
   - `mcpm install <nom> --force` : installe réellement le serveur, `mcpm ls` le confirme. Deux défauts corrigés : la commande était `add`, qui n'existe pas, et sans `--force` elle attend une confirmation au clavier qu'ADK ne peut pas donner.
   - `npm install -- <paquet>` : exécuté, code de sortie 0, paquet présent.
   - `claude plugin install` : la CLI Claude a été installée et l'argv vérifié — `--scope` accepte bien `user`, `project`, `local`, et un marketplace inexistant échoue proprement avec le message de la CLI. Non installé pour de vrai faute de marketplace de test. Constat important : `-y` est **requis sans TTY**, mais il accepte la commande déclarée par la marketplace sans la montrer à personne ; ADK ne le passe pas à votre place et le dit dans la note du plan.
   - `brew` : pas de macOS ici, non exécuté.
   Rien n'a été testé sur une configuration Claude/Cursor personnelle réelle ; le TUI a été exercé de bout en bout sur des projets jetables.
4. Exécuter un véritable benchmark agent A/B et recueillir les métriques ; le runner et les dix tâches sont implémentés, mais aucun run payant d’agent n’a été lancé.
5. ~~Revue ciblée des ajouts~~ : faite. Le registre MCP (deux défauts corrigés), les plugins Claude et la délégation d'installation ont été relus ; la délégation passait deux agents à un drapeau qui n'en prend qu'un, corrigé et testé. Le TUI a été relu à la main et exercé dans un PTY, sans revue indépendante.

### Priorité 2 — écarts fonctionnels connus

- **MCP.Directory** : ingestion directe absente. Les requêtes directes ont renvoyé HTTP 403 ; aucune API publique documentée exploitable n’a été trouvée. Chercher une intégration officielle autorisée, sans inventer de contrat ni contourner le blocage.
- ~~**Ressources déjà installées**~~ : `unmanaged` et `adopt` existent. L'adoption est explicite, prévisualisée, ne déplace pas le fichier et ne le réécrit pas quand son contenu correspond déjà ; la vue **Detected** du TUI l'expose avec `a`. Le stockage partagé `~/.agents/skills` n'est toujours pas un emplacement géré par les adaptateurs : seules les ressources dans les répertoires des harnais sont détectées, donc adoptables.
- **Couverture des catalogues** : limites de 100 résultats par source, recherche GitHub par chemins, assets distants textuels et bornés uniquement. La découverte locale ne couvre pas nécessairement chaque type dans chaque format externe.
- **Robustesse MCP** : la conversion couvre HTTP/SSE et npm/PyPI standard épinglés. Tester davantage de variantes de packages et d’arguments ; les types de packages non pris en charge restent explicites. ~~Le schéma valide le lot entier~~ : corrigé — les entrées sont validées une par une, celles qu'ADK ne sait pas lire sont comptées et signalées, et le registre retient la version qu'il marque courante.
- **Interface** : une commande en cours n'est pas annulable ; les touches sont ignorées pendant son exécution. `verify` et `install` s'affichent en JSON brut coloré, pas en panneau structuré.
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
