# Audit d'acceptation — `PLAN.md` critère par critère

**Ce document répond à une seule question : qu'est-ce que le plan promet, et qu'est-ce que le dépôt fait réellement ?** Chaque ligne porte sa preuve — un test nommé, un fichier, ou une mesure prise sur cette machine. Un critère sans preuve vérifiable est marqué comme non vérifié, pas comme livré.

Établi le 24 septembre 2026 sur `codex/implement-preflight-tui`, à `3bbbbc2`. `npm run check` : 81 tests dans 16 fichiers. Suite Python : 33 tests. `scripts/kit.py check` : 0 problème. CI verte sur Node 22 et 24.

Légende : **✔** livré et vérifié · **◐** partiel, l'écart est nommé · **✘** absent.

---

## P0 — la boucle centrale

| Critère (§7) | | Preuve |
| --- | --- | --- |
| Recherche sur tous les types et toutes les sources | ◐ | Catalogue embarqué : 94 entrées, 8 des 9 types. `plugin` absent faute de source de marketplace interrogeable. Sources distantes : registre MCP, skills.sh, GitHub par commit épinglé. |
| Inspecter avant d'installer | ✔ | `inspect`, `inspect-file`, `catalog-inspect`, `inspect-json` ; le panneau de détail du TUI montre provenance, commit épinglé, `allowed-tools`, configuration et contenu. Test : *includes supporting files in local skill inspection*. |
| CRUD sur les neuf types | ✔ | `create`, `update`, `delete`, `fork` ; test *previews CRUD, applies scope changes, and restores both state and harness files*. |
| Portée globale ↔ projet en action de premier rang | ✔ | `move <id> <scope>`, touche `m` dans le TUI. Test *moves a resource between scopes only after the preview is confirmed*. |
| Profils : créer, changer, comparer | ✔ | `profiles create/switch/diff`, vue Profils. Tests dans `tests/service.test.ts`. |
| Installation déléguée aux gestionnaires existants | ✔ | `install` imprime l'argv exact, `--execute` délègue sans shell. Tests *delegates installs as argv without a shell*, *runs a bounded subprocess and reports failure*. `skills`, `mcpm` et `npm` ont été exécutés pour de vrai contre leurs CLI réelles ; trois défauts d'argv en sont sortis, corrigés et figés par des tests. `brew` et `claude plugin install` restent non exécutés faute de macOS et de la CLI Claude. |
| Dry-run, diff et rollback sur chaque écriture | ✔ | Test *dry run writes nothing and rollback refuses to destroy later edits*, *rolls back earlier files if a later write fails*, *recovers a pending transaction without overwriting later human edits*. |
| Deux adaptateurs derrière l'interface, avec tests de conformité | ✔ | `tests/conformance.test.ts` : pour chaque adaptateur, **chaque capacité déclarée** doit survivre écriture, relecture, retrait et rollback, et chaque type non déclaré doit être refusé. La suite a trouvé deux défauts en naissant : `target()` répondait pour des types que l'adaptateur ne déclare pas, et la relecture des hooks ne conserve pas de nom propre. |
| Détection en lecture seule d'abord : installé, cassé, non câblé | ✔ | `detect` et `doctor`. Un lien symbolique mort est rapporté comme ressource cassée (vérifié à la main sur un `SKILL.md` pointant dans le vide) ; un lien vivant est refusé à l'écriture, pas rapporté. `unmanaged` et `adopt` amènent l'existant sous gestion sans le déplacer. |

---

## P1 — le coin

| Critère (§7) | | Preuve |
| --- | --- | --- |
| Doctor : usage, coût de contexte, conflits, posture de sécurité, pruning | ✔ | `src/analysis.ts` : `secret`, `broad-permissions`, `trigger-conflict`, `context-estimate`, `mcp-unwired`, `hook-unwired`, `no-hooks`, plus `settings.json` utilisateur et projet. Tests *reports read denial bypass risks and secrets from harness settings*, *counts observed invocations without inventing usage from plain mentions*. |
| Liens de partage, codes courts, aperçu avant application | ✔ | Codes à six caractères sans glyphes ambigus, page d'inspection listant chaque ressource et les variables requises, formulaire de comparaison. Tests *publishes inspectable shares, enforces ownership and revocation*, *shares only validated resources and previews changes*. |
| Loadouts rôle × stack, expliqués | ✔ | `loadouts list/show --explain/install` ; chaque item porte son `why`. Tests *resolves layered loadouts and rejects cycles*, *names the upstream installer for a loadout skill the catalogue lacks*. |
| Retrofit d'un dépôt existant | ✔ | `retrofit` génère `AGENTS.md` et `.preflight/commands.json` sans exécuter le code du dépôt. Test *detects stack from manifests without running repo code*. |
| Benchmark A/B local | ✔ | Dix tâches épinglées, clone et home isolés par tâche, taux de réussite, durée, tokens et interventions. Le runner complet est exercé par *benchmarks a pinned local repository in isolated checkouts* : clone git réel sur révision épinglée, home isolé, configuration appliquée, tâche, fichier de métriques, vérificateur. **Aucun run d'agent réel — donc payant — n'a été lancé.** |

---

## Architecture (§3)

| Critère | | Preuve |
| --- | --- | --- |
| Un seul schéma Zod pilote tout | ✔ | `src/schema.ts` sert la CLI, le TUI et le Worker. Le formulaire du TUI valide avec `ResourceSchema` ; test *round-trips a resource through the form*. |
| Pas de base locale | ✔ | `preflight.config.json`, `preflight.lock.json`, `.preflight/` : fichiers simples, diffables. |
| Un adaptateur défaillant se dégrade sans casser les autres | ✔ | Tests *isolates a broken adapter*, *does not remove a healthy harness when another adapter fails*. |
| `capabilities` honnête | ✔ | Le détail du TUI marque chaque harnais ✔/✖ pour le type affiché ; `apply` émet un avertissement « catalogued only ». Matrice de support dans `PREFLIGHT.md`. |
| Le TUI n'est jamais le seul chemin | ✔ | Chaque action porte sa commande ; test *exposes every interface action as a real CLI command*. |

---

## Partage (§4)

| Critère | | Preuve |
| --- | --- | --- |
| La page montre le contenu avant application | ✔ | `src/worker.ts` : chaque ressource, sa source, ses variables requises, plus un formulaire de diff. |
| Les secrets ne voyagent jamais, refus au schéma | ✔ | `SharePayloadSchema` refuse à la création. Tests *rejects secrets buried in arrays*, *rejects bearer headers, URL credentials and command-line secrets*, *allows pinned GitHub commit provenance in shares*. |
| Codes courts, six caractères, insensibles à la casse, sans glyphes ambigus | ✔ | `src/sharing.ts`, alphabet `23456789abcdefghjkmnpqrstuvwxyz`. |
| Portée partageable : config entière, loadout, skill seule, bloc MCP, drop-in projet | ✔ | Config entière, ressource seule (`--id`), loadout résolu (`--loadout`, refusé tant qu'il ne résout pas), drop-in de portée (`--scope project`). |
| Expiration, public/non listé, révocable | ✔ | Test *publishes inspectable shares, enforces ownership and revocation*. |

---

## Préparation équipe (§5)

| Critère | | Preuve |
| --- | --- | --- |
| Identifiant stable et URI de source par ressource | ✔ | `id` et `source` obligatoires au schéma. |
| Service de partage multi-tenant dès la première ligne | ✔ | `ownerId` dans l'enregistrement de recherche et dans la clé de stockage ; publication et révocation vérifient le propriétaire. |
| `apply` est un pipeline avec un point de politique | ✔ | `PreflightService(context, policy)` ; aucune politique par défaut. |
| Journal d'audit dès le départ | ✔ | `.preflight/audit.jsonl` : acteur, partage d'origine, identifiant de transaction, chemins modifiés. |

---

## Mesure et analyse (§6)

| Critère | | Preuve |
| --- | --- | --- |
| Usage mesuré depuis les transcripts, visible dans l'interface | ✔ | Barre d'état : skills utilisées sur installées ; panneau de détail : invocations par ressource. Absence de transcripts = usage inconnu, jamais « inutilisé ». |
| Analyse de configuration | ✔ | Coût de contexte (estimation par caractères, pas un tokenizer), conflits de déclencheurs (correspondance exacte de description), posture de sécurité, hooks non câblés, liens morts. `doctor --connect` teste chaque serveur MCP activé et remplace « connexion non testée » par le résultat réel ; sans ce drapeau, le doctor ne démarre aucun programme. |
| Benchmark local, jeu de tâches fixe | ✔ | Dix tâches ; l'interface accepte un autre manifeste comme source de tâches. |

---

## Survie (§8)

| Critère | | Preuve |
| --- | --- | --- |
| Dire à voix haute quels harnais sont supportés | ✔ | Matrice de support dans `PREFLIGHT.md`, par type et par harnais. |
| Chaque écriture réversible | ◐ | Les écritures Preflight le sont. Les installateurs délégués et les opérations Git ne le sont pas, et le disent avant de s'exécuter. |
| Le nombre mesuré est visible | ✔ | Barre d'état et panneau de détail, dès la première ouverture. |

---

## Ce que le plan demandait de vérifier avant de construire (§11)

| Question | | Réponse |
| --- | --- | --- |
| Un seul schéma peut-il exprimer deux harnais très différents ? | ✔ | Oui, avec `capabilities` pour dire ce qu'un harnais ne fait pas. Cursor ne prend ni hooks, ni subagents, ni plugins ; l'interface le montre au lieu de le cacher. |
| Ink tient-il à 500 lignes ? | ✔ | Oui, avec une liste bornée : ~20 ms par image rendue, une rafale de 60 touches se résout en une seule image. `tests/ui-scale.test.tsx`. |
| Quelqu'un acceptera-t-il un loadout écrit par un autre ? | ✘ | Non vérifié. Demande deux développeurs et une conversation, pas un test. |
| La synchronisation par Git suffit-elle ? | ✘ | Non vérifié. Demande deux machines pendant une semaine. |
| Le pruning mesuré est-il d'accord avec le jugement ? | ✘ | Non vérifié. Demande de comparer les propositions à une opinion humaine sur une vraie configuration. |

---

## Écarts retenus

1. **`plugin` absent du catalogue embarqué** — aucune source de marketplace interrogeable, et ce dépôt n'a aucun plugin à semer. Les plugins restent créables à la main et installables par délégation.
2. **Trois validations humaines** (§11) — aucune n'a été faite ; aucun test ne les remplace. Elles demandent deux développeurs, deux machines et une semaine.
3. **Un run de benchmark avec un vrai agent** — le runner complet est exercé de bout en bout avec un agent factice ; un run réel engage des appels modèle payants et relève d'une décision de l'auteur.
4. **`brew` et une installation de plugin réelle** — pas de macOS ici, et aucun marketplace de test. L'argv des deux est vérifié ; `skills`, `mcpm` et `npm` ont bien été exécutés.
5. **MCP.Directory** — HTTP 403, aucune API publique documentée.
6. **Déploiement Cloudflare** — demande le compte, KV, R2 et le token de l'auteur. Le Worker, lui, passe un smoke complet sur un runtime Wrangler local.

## Écarts corrigés plutôt que consignés

Neuf défauts trouvés en écrivant cet audit et en exécutant les vraies CLI :

1. Une entrée illisible supprimait toute une source de résultats.
2. Le registre MCP retenait une version arbitraire ; il retient celle qu'il marque courante.
3. Une status line ne pouvait pas porter son script.
4. `target()` répondait pour des types qu'un adaptateur ne déclare pas.
5. Aucune conformité ne couvrait les capacités déclarées ; elle les couvre toutes.
6. Un loadout et un drop-in de portée n'étaient pas partageables.
7. Le doctor ne pouvait pas tester les connexions MCP, même sur demande.
8. La délégation `skills` passait deux agents à un drapeau qui n'en prend qu'un.
9. La délégation MCP appelait `mcpm add`, qui n'existe pas, sans le drapeau non interactif qu'il faut.
