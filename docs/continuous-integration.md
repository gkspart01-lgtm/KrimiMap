# Continuous integration

The intended CI job runs type/format checks, unit tests, the static build and
the Playwright smoke tests. It is **not active yet**: the branch that introduced
it was pushed with a GitHub token that has no `workflow` scope, and GitHub
refuses to create or update files under `.github/workflows/` without that scope.

## Activating it

Either

- run `gh auth refresh -h github.com -s workflow` (interactive, browser once),
  then add the file below at `.github/workflows/ci.yml` and push, or
- paste the same file through the GitHub web UI (Settings → Actions is enabled
  by default).

## `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npm run build

      - name: Install Playwright browser
        run: npx playwright install --with-deps chromium

      - name: End-to-end smoke tests
        run: npm run test:e2e
```

Until CI exists, run the same sequence locally before opening a pull request:

```bash
npm ci && npm run check && npm test && npm run build
```

`npm run test:e2e` needs a Chromium build; it is skipped on machines that
cannot install Playwright's browser dependencies.
