---
name: new-feature
description: Use when a change needs a new feature folder (a new page, panel or capability that no existing feature owns), or when asked to add a feature. Decides whether a new feature is right, runs pnpm new:feature, and fills in the manifest, README and tests so CI's features and featuremap checks pass.
---

# new-feature

A feature is a folder under `src/features/<id>/` with a public `index.ts`, a `feature.manifest.ts`, a README and tests. Features never import each other (CI's `boundaries` check), so the folder is the unit agents work inside and the unit the trust ladder reasons about.

**Always use the generator.** Never create a feature folder by hand: `pnpm features` fails on a folder that's missing a piece, and the registry (`src/features/registry.ts`) is generated.

## First: does it need a new feature?

Read `FEATURE_MAP.md`. Most changes belong in an existing feature.

| The change | Where it goes |
|---|---|
| Changes something an existing feature shows or does | That feature. Not a new one. |
| Needs code from two features | `src/shared/`, and only the shared part. Features still don't import each other. |
| A new page or panel with its own data and behaviour that no feature owns | A new feature. |

At trust level 2 and above, agents may create features with the generator. A new feature with `server/` code needs level 3. Below level 2, a new feature is a human's call.

## Create it

```
pnpm new:feature <id> [--route /path]
```

- `<id>` is kebab-case, starts with a letter, at most 30 characters, and isn't `registry`, `shared`, `app` or `api`.
- `--route` defaults to `/<id>`. If `src/app/<route>/page.tsx` already exists, the generator skips it and tells you to compose the feature there by hand.
- It writes the manifest, `index.ts`, a panel component, a small `lib/` function with a unit test, an e2e test, the README, the route page, and the regenerated registry.

## Then fill it in

1. **`feature.manifest.ts`**: replace the placeholders. `title`, `summary`, `uiLocation` (plain English, relative to landmarks a person can see) and `howToReach` (numbered steps from `/`). Then `selectors`, `flows`, `routes` and `dataTables`. Set `riskLevel` honestly: `medium` or `high` when it touches data or other visitors' content. The `maintain-feature-map` skill has the rules.
2. **README.md**: what it does, its invariants (what must stay true), and its structure.
3. **Replace the sample** `lib/format-heading.ts` and its test with real logic and real tests, or delete both when the feature has no logic.
4. **Add the link** a visitor uses to reach it (usually the top navigation), if it has its own route.
5. Run:

```
pnpm featuremap
pnpm check                 # typecheck, lint, boundaries, features, featuremap, unit tests
pnpm verify:flow <id>.<flow>
```

Read the flow's screenshots (the `verify-app` skill) before calling it done.

## Anti-patterns

- Copying an existing feature folder instead of running the generator.
- A new feature for a tweak to an existing one, because "it's cleaner". It splits ownership and makes the map harder to read.
- Importing another feature's internals. Use its `index.ts` from `src/app/`, or move the shared part to `src/shared/`.
- Leaving the generator's placeholder text in `uiLocation` or `howToReach`. The map is only useful when it's true.
