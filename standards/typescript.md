# TypeScript

## Types

- **`unknown`, never `any`.** `any` disables the checker at exactly the boundary
  where you most need it. Narrow with a type guard or a schema parse.
- **No `as`** outside tests and genuinely unrepresentable cases. An assertion is
  a claim the compiler cannot verify — if it is wrong, nothing tells you.
- **`satisfies` over annotation** when you want inference *and* a constraint:
  `const config = {...} satisfies Config`.
- **Discriminated unions over optional fields.** `{ status: 'ok', data } |
  { status: 'error', error }` makes the impossible state unrepresentable;
  `{ data?, error? }` does not.
- **`readonly` on anything you do not intend to mutate**, especially arrays in
  public signatures.
- Prefer `type` for unions and function shapes, `interface` for object contracts
  that others may extend. Be consistent; either choice beats mixing.

## Errors

- **Never `catch (e) { console.log(e) }` and continue.** Either handle it,
  or let it propagate to something that will.
- `catch (e: unknown)` — TypeScript 4.4+ types it that way. Narrow before use.
- A `Result<T, E>` type beats exceptions for expected failures (validation, not
  found). Reserve `throw` for genuinely exceptional states.
- **Never swallow a rejected promise.** A floating promise is a silent failure;
  `@typescript-eslint/no-floating-promises` catches them.

## Module boundaries

- **No deep imports** into another module's internals — export a public surface
  and import from it.
- **Shared types live in one package**, not duplicated per consumer.
- No circular imports. If two modules need each other, a third thing wants to
  exist.

## Runtime validation

Types vanish at runtime. Every external input — HTTP body, env var, file,
message — is parsed by a schema (`zod`, `valibot`, `typebox`) at the boundary,
never trusted because the TypeScript type says so.

```ts
const Env = z.object({ DATABASE_URL: z.string().url(), PORT: z.coerce.number() });
export const env = Env.parse(process.env);   // fail at boot, not at 3am
```

## Config

```jsonc
{
  "strict": true,
  "noUncheckedIndexedAccess": true,   // arr[i] is T | undefined — it always was
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "verbatimModuleSyntax": true
}
```

`noUncheckedIndexedAccess` is the highest-value flag not enabled by `strict`,
and the most annoying. Turn it on anyway.

## Tests

- **Typed mocks** at the collaborator boundary — a mock that does not track the
  real interface keeps passing after the interface changes.
- Fixtures as constants at the top of the file.
- `.spec.ts` colocated with its source.
- `@total-typescript/shoehorn` for partial test data instead of `as`.
