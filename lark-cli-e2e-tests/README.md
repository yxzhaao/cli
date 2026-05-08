# CLI E2E Tests

This directory contains the standalone copy of the `lark-cli` end-to-end test framework and the first migrated testcase domains.

Its purpose is to verify real CLI workflows from a user-facing perspective: run the compiled binary, execute commands end to end, and catch regressions that are not obvious from unit tests alone.

## What Is Here

- `core.go`, `core_test.go`: the shared E2E test harness and its own tests
- `auth/`: migrated auth workflows and coverage notes
- `config/`: migrated config workflows and coverage notes
- `browser/`: Playwright and Node helpers used by browser-backed auth/config flows

## Run

```bash
make build
go test ./lark-cli-e2e-tests/... -count=1
```

## Browser Flows

Browser-backed flows require local Playwright dependencies:

```bash
cd lark-cli-e2e-tests/browser
npm install
npx playwright install chromium
```

- `auth/auth_login_workflow_test.go` now always runs the scripted browser login flow.
- `config/config_init_workflow_test.go` remains checked in but skips because tenant-side app review blocks deterministic automation.
- Set `LARK_E2E_BROWSER_USER_DATA_DIR` only when you explicitly want to reuse a local Playwright profile; the default path is a fresh temp directory per run.
