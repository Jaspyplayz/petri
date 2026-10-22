# Agent mistakes

Every observed agent mistake gets an entry: what happened, evidence, root cause, category, and the fix rung reached (design → hard rule → skill → CLAUDE.md). Phase 7 adds the `postmortem` skill and eval cases; these first entries come from building Phase 1.

## 2026-10-22 · CSS Modules silently empty under the Tailwind Turbopack rule

- **What happened:** The blob's wobble/breathe animations and scale origin never applied. `styles.creature` was `undefined`, so the SVG groups had no class. Unit and e2e tests were green because they only checked counters.
- **Evidence:** Phase 1 exit check on `pnpm dev`: the blob floated ~38 px above its shadow; computed `transform-origin: 0px 0px`, `class=null`. The production CSS still contained the rules, but the JS mapping was empty.
- **Root cause:** `next.config.ts` (copied from the create-next-app template) applied the `@tailwindcss/turbopack` loader to `"*.css"`, which also captured `*.module.css` and turned off CSS Modules for them.
- **Category:** config / silent styling failure
- **Fix rung:** (a) design: the loader rule is now scoped to `globals.css`. (b) hard rule: `blob.e2e.ts` asserts the computed `animationName` contains `breathe`, then `wobble` after a poke, and that the blob sits on its shadow. Shown to fail (`["none","none"]`) with the old rule.
- **Follow-up (Phase 3/4):** `verify:flow` should flag elements whose `className` contains `undefined`, so any feature catches this class of bug.

## 2026-10-22 · Hydration "mismatch" caused by Playwright screenshots, not the app

- **What happened:** A screenshot taken right after `page.goto` (load event, before hydration) logged a React hydration error on the blob name input: `style={{caret-color:"transparent"}}`.
- **Evidence:** It reproduced 3/3 with Playwright's default `caret: "hide"` and 0/3 with `caret: "initial"` or with no screenshot (probe script, Phase 1 exit check).
- **Root cause:** Playwright hides the text caret by writing an inline style on inputs. If that happens before React hydrates, React sees an attribute the server didn't render.
- **Category:** verification tooling false positive
- **Fix rung:** (c) skill/tooling: `verify:flow` and `verify:script` (Phase 3) must take screenshots with `caret: "initial"`. A hard check for that goes in the verify CLI's own tests.
