# Audit d'acceptation — `PLAN.md` critère par critère

**Ce document répond à une seule question : qu'est-ce que le plan promet, et qu'est-ce que le dépôt fait réellement ?** Chaque ligne porte sa preuve — un test nommé, un fichier, ou une mesure prise sur cette machine. Un critère sans preuve vérifiable est marqué comme non vérifié, pas comme livré.

Établi le 24 septembre 2026 sur `codex/implement-adk-tui`, à `3bbbbc2`. `npm run check` : 81 tests dans 16 fichiers. Suite Python : 33 tests. `scripts/kit.py check` : 0 problème. CI verte sur Node 22 et 24.

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
| Installation déléguée aux gestionnaires existants | ✔ | `install` imprime l'argv exact, `--execute` délègue sans shell. Tests *delegates installs as argv without a shell*, *runs a bounded subprocess and reports failure*. |
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
| Retrofit d'un dépôt existant | ✔ | `retrofit` génère `AGENTS.md` et `.adk/commands.json` sans exécuter le code du dépôt. Test *detects stack from manifests without running repo code*. |
| Benchmark A/B local | ✔ | Dix tâches épinglées, clone et home isolés par tâche, taux de réussite, durée, tokens et interventions. Tests *provides ten isolated, pinned agent tasks with independent verification*, *compares matching benchmarks and rejects different task sets*. **Aucun run d'agent réel n'a été lancé.** |

---

## Architecture (§3)

| Critère | | Preuve |
| --- | --- | --- |
| Un seul schéma Zod pilote tout | ✔ | `src/schema.ts` sert la CLI, le TUI et le Worker. Le formulaire du TUI valide avec `ResourceSchema` ; test *round-trips a resource through the form*. |
| Pas de base locale | ✔ | `adk.config.json`, `adk.lock.json`, `.adk/` : fichiers simples, diffables. |
| Un adaptateur défaillant se dégrade sans casser les autres | ✔ | Tests *isolates a broken adapter*, *does not remove a healthy harness when another adapter fails*. |
| `capabilities` honnête | ✔ | Le détail du TUI marque chaque harnais ✔/✖ pour le type affiché ; `apply` émet un avertissement « catalogued only ». Matrice de support dans `ADK.md`. |
| Le TUI n'est jamais le seul chemin | ✔ | Chaque action porte sa commande ; test *exposes every interface action as a real CLI command*. |

---

## Partage (§4)

| Critère | | Preuve |
| --- | --- | --- |
| La page montre le contenu avant application | ✔ | `src/worker.ts` : chaque ressource, sa source, ses variables requises, plus un formulaire de diff. |
| Les secrets ne voyagent jamais, refus au schéma | ✔ | `SharePayloadSchema` refuse à la création. Tests *rejects secrets buried in arrays*, *rejects bearer headers, URL credentials and command-line secrets*, *allows pinned GitHub commit provenance in shares*. |
| Codes courts, six caractères, insensibles à la casse, sans glyphes ambigus | ✔ | `src/sharing.ts`, alphabet `23456789abcdefghjkmnpqrstuvwxyz`. |
| Portée partageable : config entière, loadout, skill seule, bloc MCP, drop-in projet | ◐ | Config entière et ressource seule (`--id`). **Partager un loadout ou un drop-in projet en tant que tel n'existe pas.** |
| Expiration, public/non listé, révocable | ✔ | Test *publishes inspectable shares, enforces ownership and revocation*. |

---

## Préparation équipe (§5)

| Critère | | Preuve |
| --- | --- | --- |
| Identifiant stable et URI de source par ressource | ✔ | `id` et `source` obligatoires au schéma. |
| Service de partage multi-tenant dès la première ligne | ✔ | `ownerId` dans l'enregistrement de recherche et dans la clé de stockage ; publication et révocation vérifient le propriétaire. |
| `apply` est un pipeline avec un point de politique | ✔ | `AdkService(context, policy)` ; aucune politique par défaut. |
| Journal d'audit dès le départ | ✔ | `.adk/audit.jsonl` : acteur, partage d'origine, identifiant de transaction, chemins modifiés. |

---

## Mesure et analyse (§6)

| Critère | | Preuve |
| --- | --- | --- |
| Usage mesuré depuis les transcripts, visible dans l'interface | ✔ | Barre d'état : skills utilisées sur installées ; panneau de détail : invocations par ressource. Absence de transcripts = usage inconnu, jamais « inutilisé ». |
| Analyse de configuration | ◐ | Coût de contexte (estimation par caractères, pas un tokenizer), conflits de déclencheurs (correspondance exacte de description), posture de sécurité, hooks non câblés, liens morts. **Un serveur MCP qui échoue à se connecter n'est rapporté que par `verify --connect`, jamais par le doctor** — délibéré : le doctor ne démarre aucun programme. |
| Benchmark local, jeu de tâches fixe | ✔ | Dix tâches ; l'interface accepte un autre manifeste comme source de tâches. |

---

## Survie (§8)

| Critère | | Preuve |
| --- | --- | --- |
| Dire à voix haute quels harnais sont supportés | ✔ | Matrice de support dans `ADK.md`, par type et par harnais. |
| Chaque écriture réversible | ◐ | Les écritures ADK le sont. Les installateurs délégués et les opérations Git ne le sont pas, et le disent avant de s'exécuter. |
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

1. **`plugin` absent du catalogue embarqué** — aucune source de marketplace interrogeable. Les plugins restent créables à la main et installables par délégation.
3. **Partage d'un loadout ou d'un drop-in projet** — non implémenté.
4. **Connexion MCP hors du doctor** — délibéré, mais c'est un écart au texte du plan.
5. **Trois validations humaines** (§11) — aucune n'a été faite ; aucun test ne les remplace.
6. **Intégrations réelles** — Wrangler, installations Claude/Cursor réelles, run de benchmark payant : voir `HANDOFF.md`.

Trois écarts trouvés par cet audit ont été corrigés plutôt que consignés : une entrée illisible ne supprime plus toute une source de résultats, le registre MCP retient la version qu'il marque courante au lieu d'une version arbitraire, et une status line peut porter son script au lieu de pointer vers un fichier absent.
