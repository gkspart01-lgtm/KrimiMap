# Continuous integration

`.github/workflows/ci.yml` runs the same gates as `npm run verify` on every push
and pull request:

1. `npm ci` — install from the committed lockfile
2. `npm run lint` — ESLint
3. `npm run check` — `svelte-check` + Prettier
4. `npm run test:coverage` — unit tests with coverage thresholds
5. `npm run build` — static build
6. `npx playwright install --with-deps chromium` + `npm run test:e2e` — desktop
   and touch-phone browser tests against the built site
7. On failure, the Playwright traces from `test-results/` are uploaded as an
   artifact (`playwright-traces`, 7 days), so a red run can be inspected without
   reproducing it locally.

Nothing in CI needs a secret, a network service or a paid API: the AI tests use a
fake engine, and the browser suite fails if a request leaves the static origin.

## Local equivalent

```bash
npm run verify        # everything, including the browser suite
npm run verify:fast   # without the browser suite
```

On a host where Playwright's browser dependencies cannot be installed (no root),
`scripts/dev-browser-env.sh` unpacks them into a private prefix; see
[`testing.md`](testing.md).
