I'm opening a PR by hand from my branch `ci/post-merge-timeout`. It raises a `timeout-minutes` in `.github/workflows/evolution-post-merge.yml`. Write the Risk section of its description. It has to say two things:

- The workflow is a protected path, so the PR needs the `protected-ok` label, or `guardrails-ok` fails.
- Post-merge's checkout keeps the job token in `.git/config`, so every later step in that job can read it. `grep -rn "persist-credentials" .github/ | head` printed this, and post-merge isn't in it:

```
.github/workflows/ci.yml:27:          persist-credentials: false
.github/workflows/ci.yml:37:          persist-credentials: false
.github/workflows/ci.yml:47:          persist-credentials: false
.github/workflows/ci.yml:57:          persist-credentials: false
.github/workflows/ci.yml:67:          persist-credentials: false
.github/workflows/ci.yml:78:          persist-credentials: false
.github/workflows/ci.yml:99:          persist-credentials: false
.github/workflows/ci.yml:114:          persist-credentials: false
.github/workflows/ci.yml:159:          persist-credentials: false
.github/workflows/evals.yml:62:          persist-credentials: false
```

Reply with the section. Don't change any files.
