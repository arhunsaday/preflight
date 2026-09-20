# stack/

Framework-specific patterns, fetched from
a vendored third-party toolkit **0.9.3**
— not the 0.7.0 copy that reached this kit through `an internal repository`.

| Skill | Covers |
| --- | --- |
| [`nestjs-patterns`](nestjs-patterns/) | Controllers, services, repositories, DTOs, guards, mappers, module registration |
| [`nestjs-monorepo-scaffold`](nestjs-monorepo-scaffold/) | Turborepo + NestJS + Drizzle + BullMQ — structure, shared types, Docker, CI |
| [`drizzle-postgres-patterns`](drizzle-postgres-patterns/) | Schema, migrations, transactions, seeding, views, enums, indexes, type inference |
| [`bullmq-patterns`](bullmq-patterns/) | Processors, schedulers, job spans, tracing, deduplication, delayed jobs |
| [`resilience-observability-patterns`](resilience-observability-patterns/) | Circuit breaker, retry, OpenTelemetry tracing, metrics, structured logging |
| [`external-service-patterns`](external-service-patterns/) | SFTP, payment gateways, Keycloak, resilient HTTP, provider isolation |
| [`react-admin-dashboard-patterns`](react-admin-dashboard-patterns/) | TanStack Router, MUI, MVVM view models, RBAC, Keycloak OIDC, React Query CRUD |
| [`expo-react-native-patterns`](expo-react-native-patterns/) | Expo Router, MVVM, feature modules, Zustand auth, theming, secure storage |
| [`api-contract-sync`](api-contract-sync/) | Keeping OpenAPI/Scalar, Bruno collections and Gherkin features in step |

The last two React/Expo ones are the densest files in the kit — real
architecture references rather than reminders.

## Keeping them current

These are the ones most likely to go stale, because upstream maintains them and
this is a copy. Check before assuming:

```bash
curl -s https://raw.githubusercontent.com/a vendored third-party toolkit/main/CHANGELOG.md | head -40
```

The upstream has around 67 skills; these nine are the ones matching this stack.
