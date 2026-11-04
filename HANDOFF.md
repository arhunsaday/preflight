## Mise à jour du 7 octobre 2026 — accents duotones

Les commits UI de l'autre agent (shell clavier/thèmes, refonte neutre arrondie et logo `d7db05f`) sont conservés. Navigation et ressources utilisent désormais Phosphor 2.1.10 en poids duotone, avec imports par icône. Composants partagés dans `desktop/renderer/components/semantic-icons.tsx` : icônes et badges par type, badges Claude/Cursor, mapping des vues de navigation. Palette discrète bleu/teal/violet/ambre/vert/rose, adaptée aux thèmes clair/sombre via les tokens existants. Les actions restent neutres, les statuts gardent leur sens et les labels textuels/accessibilité restent présents. Aucun agent supplémentaire n'est prétendu pris en charge.

Validation : `npm run check` (132 tests, lint, typecheck et build), `npm run desktop:check`, lint final et parcours Electron avec captures clair/sombre. Le smoke vérifie les couches SVG duotones, les badges d'agents et tous les parcours précédents. Les deux fichiers pnpm préexistants ne font pas partie de ce changement ; package-lock npm reste la référence de CI. Un run du smoke a expiré au délai existant de 12 secondes du scénario final d’annulation de connexion ; la relance complète passe sans modification de l’auth. À surveiller si ce timeout réapparaît. Captures finales : `/private/var/folders/d8/q7brvp314z343wfb046350yh0000gn/T/preflight-smoke-anV5FT`.

## Mise à jour du 6 octobre 2026 — carte du contexte

Desktop : **Improve → Context map**, treemap par type avec surfaces proportionnelles, zoom par catégorie, inspection, liste triée, recherche et filtres agent/global/projet. Deux scénarios : catalogue des skills ou instructions complètes si chargées. Calcul partagé `src/context-map.ts`, `ceil(characters / 4)` par contribution, aucune prétention de mesure de session réelle. MCP et autres contributions runtime inconnues affichées séparément ; aucun serveur démarré. Ressources désactivées exclues du total, profil projet prioritaire à ID égal. Les résultats du catalogue de découverte ne font pas partie de l'inventaire.

CLI : `preflight context [--mode potential|catalogue] [--agent claude-code|cursor] [--scope global|project]`, compatible `--global` et profil absent. Rapport JSON sans configuration ni credentials. Correction des doublons globaux détectés via les vrais targets d'adapters : `PreflightService.unmanaged(inherited)` utilisé par le CLI et le snapshot desktop.

Validation locale : `npm run check` (131 tests, lint/typecheck et build), `npm run desktop:check`, `npm run desktop:smoke` (carte, détail MCP, zoom, liste/filtres et viewport compact en plus des scénarios existants), et `npm --prefix docs run build` passent. Captures inspectées dans `/private/var/folders/d8/q7brvp314z343wfb046350yh0000gn/T/preflight-smoke-RHpHfi`. Doc : `docs/content/docs/preflight/context-map.mdx`.

Limite explicite : ni schémas MCP ni réponses d'outils ni historique/session native ne sont capturés. Une extension de mesure runtime pourrait les intégrer ultérieurement ; les coûts inconnus ne sont pas transformés en zéros ni en surfaces fictives.

## Mise à jour du 5 octobre 2026 — équipes et identité visuelle

La CI complète du commit équipes/UI `720af1a` est verte (https://github.com/arhunsaday/preflight/actions/runs/37344158861), comme celle du socle `2d85366` : backend Cloudflare, Node 22/24, docs, packages et parcours Electron macOS/Windows/Linux. Wrangler est désormais verrouillé dans package-lock ; le smoke tue son groupe de processus, ce qui résout le blocage Linux. Les liens nouveaux ont 16 caractères aléatoires, les anciens restent compatibles.

Implémentation suivante : client cloud validé partagé main/CLI (`src/cloud-client.ts`), équipes réelles avec invitations/acceptation/refus/annulation, rôles owner/admin/member, retrait et départ. Better Auth impose les permissions côté serveur et protège le dernier propriétaire. URL `/invite/UUID` avec retour OAuth, destinataire/email vérifié et acceptation explicite ; livraison manuelle du lien, aucun faux envoi email. UI membre sans commandes admin.

Refonte visuelle : Manrope embarquée/offline, palette marine/pétrole, Overview asymétrique avec schéma global→projet et inventaire, tableaux membres/invitations, roster local replié, compte fixé en bas de sidebar. Icône avion utilisateur conservée. Tests Electron avec vrai Better Auth et SQLite : deux connexions par device authorization, création/invitation/acceptation et vue membre. Smoke Wrangler réel couvre D1 invitations/rôles et KV/R2. Les scopes, reçus de preview, stockage sécurisé et isolation renderer restent conservés.

Reste extérieur : fournir les OAuth/Cloudflare secrets et provisionner/déployer le backend réel, signature/notarisation des installateurs. Les liens unlisted/public ne sont pas des partages privés d'équipe. Priorités fonctionnelles ultérieures : partage privé avec ACL explicites si souhaité, transfert entre stores global/projet, transport email si souhaité.

## Mise à jour du 4 octobre 2026 — UX et backend standard

- Le commit utilisateur `bebe256` (desktop et icône avion) est conservé. Configuration globale indépendante dans `HOME/.preflight/global/preflight.config.json`, contexte global/projet explicite, Overview et ressources globales héritées en lecture seule.
- Découverte séparée du catalogue local : sources MCP Registry, GitHub et skills.sh, filtres, prérequis/erreurs visibles, configuration avant installation. Éditeur MCP stdio/HTTP/SSE et mode JSON avancé.
- Backend standard Better Auth + Cloudflare Workers/D1/KV/R2 : OAuth GitHub/Google configurables, sessions, device authorization RFC8628, organisations réelles, propriétaires des partages vérifiés côté serveur. Migrations générées et guide `docs/content/docs/preflight/cloudflare-backend.mdx`.
- Desktop : connexion navigateur principale, tokens hors renderer, compatibilité deployment token secondaire. CLI `preflight auth login/status/logout`, stockage OS sans fallback plaintext, `preflight team list/create/members`. Team desktop liste/crée les organisations et affiche leurs membres ; roster local clairement distinct.
- Partage : URL hébergée générée, actions copier/ouvrir, import de l'URL complète via `preflight apply URL --dry-run`, codes aléatoires 16 caractères (anciens codes compatibles), liste serveur et desktop des partages du compte (`GET /api/shares`), révocation avec preview.
- Vérification locale Cloudflare réelle : `npm run backend:smoke` applique les migrations D1 et vérifie sessions, autorisation d'appareil, organisation, logout. `npm run smoke:worker` teste explicitement la compatibilité legacy sans D1. CI couvre ces deux runtimes et les packages Electron sur macOS/Windows/Linux.

À poursuivre : UI des invitations et des rôles d'organisation, déplacement de ressources entre les deux stores global/projet, meilleure couverture des opérations CLI spécialisées. Aucun fournisseur OAuth réel ni service public n'a été provisionné ou déployé ; renseigner les bindings et secrets Cloudflare puis déployer selon le guide. Les installateurs restent non signés. Ne pas présenter les liens unlisted comme privés.

# Reprise du projet Preflight — 4 octobre 2026

## État courant et règles de reprise

La dernière demande utilisateur donne priorité à une application desktop couvrant le CLI : skills, MCP, projets, loadouts, benchmark, collaboration, équipe, doctor et auth. Il autorise le travail autonome sans questions et les commits/pushes progressifs. La capture Skillscout sert d'inspiration visuelle, pas de spécification fonctionnelle supplémentaire.

Le travail desktop est sur **`codex/implement-adk-tui`**, base `b185631`, premier lot poussé `caf2d38`. Le dépôt distant redirige vers `https://github.com/arhunsaday/preflight`. Vérifier les références actuelles avant toute suite ; les paragraphes historiques ci-dessous décrivent une session antérieure et leur affirmation « travail sur main » ne décrit pas ce lot. Aucun merge, déploiement Cloudflare ou publication npm n'a été effectué pendant ce lot.

**Préserver `preflight.config.json`, fichier utilisateur non suivi présent dans le checkout.** Ne pas l'ajouter au commit ni le remplacer. Le changement initial de package-lock concernait les indicateurs peer et a été conservé lors du fast-forward puis intégré à l'installation des dépendances desktop.

## Livré dans ce lot

- Audit et fast-forward des huit commits de l'autre agent : adoption, TUI, registre MCP tolérant, vraies installations, partage par scope/loadout, doctor connecté, acceptation et Worker smoke étaient déjà livrés. Baseline vérifiée : 94 tests.
- Electron/React/electron-vite avec interface native à trois panneaux inspirée de la capture : liste/détail des skills et MCP, catalogue/détection/adoption, formulaires CRUD, profils, projets, loadouts, doctor, usage, benchmarks, partage, compte, roster local et activité. Console sans shell pour les commandes restantes.
- Projets choisis par dialogue natif, sans initialisation implicite. Schémas/services/transactions CLI réutilisés par un worker isolé ; renderer sandboxé sans Node, preload restreint, validation dans main. Aperçus à reçus uniques, expiration, contexte immuable, contrôle de l'état et relecture des inputs avant confirmation.
- Partage JSON et Worker : connexion propriétaire via nouveau `GET /api/account`, publication/import/révocation réels, token chiffré safeStorage ou session-only. Token absent des snapshots, configs projet et environnements d'installateurs/agents.
- Packaging electron-builder, icône reproductible, test Electron Playwright sur projet/home/userData jetables ; CI vérifie bundles Node 22/24 et workflows natifs macOS, puis paquet natif.
- Revue indépendante : credentials hérités, changements de projet/compte, inputs importés modifiés et fermeture pendant supervision ont été corrigés avec régressions. Export JSON montre maintenant le fichier avant/après et refuse sa confirmation si la destination change. Suppression du timeout global qui pouvait abandonner des processus détachés ; le CLI conserve ses timeouts de sous-processus.

Points d'entrée : `desktop/main/controller.ts` (sécurité/aperçus/settings), `desktop/main/index.ts` (Electron/IPC/worker), `desktop/engine.ts` (snapshot réel), `desktop/renderer/`, `desktop/worker.ts`, `scripts/desktop-smoke.mjs`, `electron-builder.yml`. Design et plan dans `docs-internal/superpowers/{specs,plans}/2026-10-04-desktop*.md`. Guide utilisateur dans `PREFLIGHT.md`.

## Validation et limites

- `npm run check` : 108 tests / 18 fichiers, lint/types/build passent.
- `npm run desktop:check` et workflows Electron réels passent : init, ajout, déplacement global, édition, profils, doctor, loadouts, console, équipe locale, auth/publication/import/révocation et changement de projet.
- Python : 33 tests ; `python3 scripts/kit.py check` : zéro problème.
- Worker navigateur compilé ; Wrangler KV/R2 local : 11 contrôles passent (dont account autorisé/non autorisé).
- Paquet `.app` macOS arm64 construit sans signature. Windows/Linux sont des cibles configurées, pas validées sur leurs OS.
- Le roster équipe est **local, sans invitations, contrôle d'accès ni synchronisation**. Auth est le **jeton propriétaire du Worker existant**, sans OIDC/signup multi-utilisateur. Aucune métrique ou identité de démonstration n'est livrée dans les écrans.
- Aucun benchmark payant d'agent n'est lancé. Les scénarios humains de longue durée et les intégrations externes non testées restent ceux du bilan historique.
- Pas d'annulation d'opération, d'auto-update, de signature/notarisation ou de distribution publique. Une fermeture normale attend les moteurs actifs ; un arrêt forcé de l'OS conserve les limites habituelles du CLI.

## Prochaines tranches

1. Vérifier le résultat de la CI du dernier commit desktop, puis poursuivre les tests natifs Windows/Linux et préparer des installateurs signés/notarisés selon les comptes disponibles.
2. Remplacer le roster local par un vrai backend multi-utilisateur (invitations, rôles, politiques) et OIDC seulement si cette tranche est choisie ; ne pas présenter le roster actuel comme de l'administration d'organisation.
3. Déployer le Worker avec les bindings réels et domaine, puis exécuter un vrai benchmark A/B avec des agents et budgets explicites. Aucun accès Cloudflare ou crédit d'agent n'est présumé.
4. Continuer les écarts de `ACCEPTANCE.md`, notamment catalogues externes et validation humaine. Le desktop ne change pas les capacités des adaptateurs Claude/Cursor.

Commandes : `npm run desktop:dev`, `npm run desktop:check`, `npm run desktop:smoke`, `CSC_IDENTITY_AUTO_DISCOVERY=false npm run desktop:pack`. Pour valider le paquet, passer `PREFLIGHT_DESKTOP_EXECUTABLE` au smoke avec le chemin `desktop-release/mac-arm64/Preflight.app/Contents/MacOS/Preflight` sur cette machine. Tous les tests d'écriture doivent utiliser un projet/home jetables.

---

## Historique — session CLI/TUI du 24 septembre 2026

## Demande et règles de travail

Implémenter le projet décrit dans `PLAN.md`, sans demander de précisions à l’utilisateur. Il a ensuite demandé de **committer et pousser au fur et à mesure**, puis de pousser directement sur `main`. Travailler par lots vérifiés. Ne pas confondre « code local livré » et « toute la roadmap réalisée ». Aucune garantie d’absence totale de bugs n’est possible.

Dépôt : `https://github.com/arhunsaday/preflight`. **Le travail est sur `main`** depuis `6f5f2df` : `codex/implement-preflight-tui` a été avancée en fast-forward sur `main`, sans commit de fusion, et les deux références sont identiques. La branche de travail subsiste mais n'est plus la destination.

Lire `PLAN.md` pour l’objectif produit et `PREFLIGHT.md` pour les commandes, la matrice de support et les limitations. Le journal local `.superpowers/sdd/PLAN/progress.md` est ignoré par Git et certaines anciennes conclusions y sont dépassées : **les plugins Claude sont maintenant pris en charge et les pushes autorisés**. Ce document sert de reprise portable.

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
| Compléments | Retrofit AGENTS et détection de stack, délégation Git, packaging npm, documentation et CI Node 22/24 | `src/retrofit.ts`, `PREFLIGHT.md`, `.github/workflows/` |

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

Deux informations que l'ancienne interface n'avait pas : les invocations mesurées par ressource (skills comptés comme le fait `usage`, serveurs MCP via les noms `mcp__<serveur>__<outil>`, rien du tout si aucun transcript), et l'état « appliqué » comparé à `preflight.lock.json`, qui distingue un état désiré arrivé par Git ou édité à la main d'un état déjà écrit dans les fichiers du harness.

### CI

La CI de la branche échouait **avant cette session** (`3977b3e` comprise), sur le job `verify` : `scripts/loadouts.py` considérait comme connue une skill présente dans le magasin local `~/.agents/skills`, si bien que six items de loadout résolvaient sur la machine d'origine et nulle part ailleurs. Un item qui n'est pas embarqué dans ce dépôt déclare maintenant son dépôt d'origine (`"external": "owner/repo"`), validé contre `skills/install-third-party.sh`, et `materializeLoadout` rapporte la commande d'installation. `eli5-succinct` a été **retiré** du loadout `junior` : absent du dépôt, de l'installeur et de la liste des skills installées, rien ne pouvait le résoudre.

Runs 17, 18 et 19 verts sur Node 22 et 24 plus `verify`. C'est la première CI verte de la branche.

### Adoption de l'existant

`unmanaged` liste ce qu'un harnais contient et que le profil actif ne gère pas ; `adopt` l'amène sous gestion **là où il est**. La ressource enregistre `adoptedBy` et `adoptedPath` (relatif à la base du harnais), l'adaptateur vise ce chemin, et un fichier dont le contenu correspond déjà n'est pas réécrit : la transaction n'ajoute que l'entrée de configuration et l'empreinte du lockfile, donc la dérive est détectée ensuite. `delete` retire le fichier, `rollback` le remet. Un chemin adopté qui tente de sortir du répertoire du harnais est ignoré au profit du chemin géré par Preflight. Les types portés par un fichier de réglages s'adoptent en reconnaissant l'entrée déjà présente ; l'écriture des hooks est devenue idempotente pour ne pas dupliquer celle qu'on adopte.

Vérifié avec un vrai installateur, dans un HOME isolé : `npx skills@latest add vercel-labs/agent-skills --skill deploy-to-vercel --agent claude-code -g -y` installe **un vrai répertoire dans `~/.claude/skills`**, sans magasin `~/.agents/skills`. Preflight le détecte comme non géré et l'adopte, empreinte du fichier inchangée. Le magasin partagé que documente `skills/THIRD-PARTY.md` relève donc d'une version ou d'options antérieures ; là où il existe, les skills y sont atteintes par lien symbolique et l'adoption les refuse explicitement, puisqu'Preflight n'écrit jamais au travers d'un lien.

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
   - `npx skills@latest add … -g -y` : installe un vrai répertoire dans `~/.claude/skills` ; Preflight le détecte et l'adopte, empreinte inchangée. Un défaut corrigé au passage : `--agent` ne prend qu'un argument.
   - `mcpm install <nom> --force` : installe réellement le serveur, `mcpm ls` le confirme. Deux défauts corrigés : la commande était `add`, qui n'existe pas, et sans `--force` elle attend une confirmation au clavier qu'Preflight ne peut pas donner.
   - `npm install -- <paquet>` : exécuté, code de sortie 0, paquet présent.
   - `claude plugin install` : la CLI Claude a été installée et l'argv vérifié — `--scope` accepte bien `user`, `project`, `local`, et un marketplace inexistant échoue proprement avec le message de la CLI. Non installé pour de vrai faute de marketplace de test. Constat important : `-y` est **requis sans TTY**, mais il accepte la commande déclarée par la marketplace sans la montrer à personne ; Preflight ne le passe pas à votre place et le dit dans la note du plan.
   - `brew` : pas de macOS ici, non exécuté.
   Rien n'a été testé sur une configuration Claude/Cursor personnelle réelle ; le TUI a été exercé de bout en bout sur des projets jetables.
4. Exécuter un véritable benchmark agent A/B et recueillir les métriques ; le runner et les dix tâches sont implémentés, mais aucun run payant d’agent n’a été lancé.
5. ~~Revue ciblée des ajouts~~ : faite. Le registre MCP (deux défauts corrigés), les plugins Claude et la délégation d'installation ont été relus ; la délégation passait deux agents à un drapeau qui n'en prend qu'un, corrigé et testé. Le TUI a été relu à la main et exercé dans un PTY, sans revue indépendante.

### Priorité 2 — écarts fonctionnels connus

- **MCP.Directory** : ingestion directe absente. Les requêtes directes ont renvoyé HTTP 403 ; aucune API publique documentée exploitable n’a été trouvée. Chercher une intégration officielle autorisée, sans inventer de contrat ni contourner le blocage.
- ~~**Ressources déjà installées**~~ : `unmanaged` et `adopt` existent. L'adoption est explicite, prévisualisée, ne déplace pas le fichier et ne le réécrit pas quand son contenu correspond déjà ; la vue **Detected** du TUI l'expose avec `a`. Le stockage partagé `~/.agents/skills` n'est toujours pas un emplacement géré par les adaptateurs : seules les ressources dans les répertoires des harnais sont détectées, donc adoptables.
- **Couverture des catalogues** : limites de 100 résultats par source, recherche GitHub par chemins, assets distants textuels et bornés uniquement. La découverte locale ne couvre pas nécessairement chaque type dans chaque format externe.
- **Robustesse MCP** : la conversion couvre HTTP/SSE et npm/PyPI standard épinglés. Tester davantage de variantes de packages et d’arguments ; les types de packages non pris en charge restent explicites. ~~Le schéma valide le lot entier~~ : corrigé — les entrées sont validées une par une, celles qu'Preflight ne sait pas lire sont comptées et signalées, et le registre retient la version qu'il marque courante.
- **Interface** : une commande en cours n'est pas annulable ; les touches sont ignorées pendant son exécution. `verify` et `install` s'affichent en JSON brut coloré, pas en panneau structuré.
- ~~Reprendre les critères de `PLAN.md` point par point~~ : fait, dans `ACCEPTANCE.md`. Six écarts y sont retenus, trois autres ont été corrigés plutôt que consignés.

### Configuration externe et roadmap différée

- Déploiement public du partage : renseigner le compte Cloudflare, KV, R2, le token et le domaine. `wrangler.jsonc` contient des identifiants de remplacement. Rien n’est déployé ; `share.example.com` est un nom provisoire, le domaine reste à choisir (clients : `PREFLIGHT_SHARE_URL`).
- skills.sh nécessite `VERCEL_OIDC_TOKEN` ; GitHub peut utiliser `GITHUB_TOKEN`. Ne jamais committer les secrets.
- Authentification multi-utilisateur/OIDC, administration d’organisations, catalogue/politiques hébergés, synchronisation cloud, analytique de maturité, facturation et marketplace : non implémentés, roadmap future.
- Les validations humaines du plan (acceptation des loadouts, synchronisation sur deux machines pendant une semaine, accord entre pruning mesuré et jugement humain) restent à effectuer ; des tests automatisés ne les remplacent pas.

## Limites à préserver

- Les opérations Git et package managers déléguées ne sont pas couvertes par le rollback local Preflight.
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
tmux new-session -d -s preflight -x 120 -y 36 "node dist/cli.js ui --root /tmp/demo --home /tmp/demo/home"
sleep 2; tmux send-keys -t preflight 2; sleep 1; tmux capture-pane -p -t preflight; tmux kill-session -t preflight
```

Utiliser un répertoire projet/home temporaire pour les tests d’écriture via le service. Les tests existants montrent les fixtures et les contextes injectés. Les logs de développement locaux sont dans `.superpowers/sdd/PLAN/`, mais ne sont pas transportés par Git.
