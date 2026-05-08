# Auth CLI E2E Coverage

## Metrics
- Denominator: 6 leaf commands
- Covered: 5
- Coverage: 83%

## Summary
- `TestAuth_UnconfiguredWorkflow`: covers `auth` command behavior before any config exists, including no-config guidance for `login/status/list/logout/check/scopes`.
- `TestAuth_ProfileWorkflow`: covers multi-profile `auth` behavior on a selected profile, including `status/check/list/logout/scopes` and login input validation on that profile.
- `TestAuth_LoginWorkflow`: always runs the scripted browser login flow and validates verified auth status fields when session-backed browser automation is available.
- Blocked area: `auth scopes` is not counted as covered yet because current tests only prove `--help` output and unconfigured errors, not a successful live scope query.

## Command Table
| Status | Cmd | Type | Testcase | Key parameter shapes | Notes / uncovered reason |
| --- | --- | --- | --- | --- | --- |
| ✓ | `auth login` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_login_workflow_test.go::TestAuth_LoginWorkflow` | `--no-wait --json`; scripted domain login flow (`--domain all --recommend`) | interactive browser step is automated by script and no longer gated by skip |
| ✓ | `auth status` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | baseline; `--verify`; `--profile` | |
| ✓ | `auth check` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | `--scope`; `--profile` | |
| ✓ | `auth list` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | baseline; `--profile` | |
| ✓ | `auth logout` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | baseline; `--profile` | |
| ✕ | `auth scopes` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | baseline; `--format`/`--profile` via help path | current suite covers help and no-config behavior only; no successful live query assertion yet |
