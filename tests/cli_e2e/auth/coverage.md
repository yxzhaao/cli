# Auth CLI E2E Coverage

## Metrics
- Denominator: 6 leaf commands
- Covered: 6
- Coverage: 100%

## Summary
- `TestAuth_UnconfiguredWorkflow`: covers `auth` command behavior before any config exists, including no-config guidance for `login/status/list/logout/check/scopes`.
- `TestAuth_ProfileWorkflow`: covers multi-profile `auth` behavior on a selected profile, including `status/check/list/logout/scopes` and login input validation on that profile.

## Command Table
| Status | Cmd | Type | Testcase | Key parameter shapes | Notes / uncovered reason |
| --- | --- | --- | --- | --- | --- |
| ✓ | `auth login` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow` | `--no-wait --json` | browser-backed success flow intentionally excluded from this subset |
| ✓ | `auth status` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | baseline; `--verify`; `--profile` | |
| ✓ | `auth check` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | `--scope`; `--profile` | |
| ✓ | `auth list` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | baseline; `--profile` | |
| ✓ | `auth logout` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | baseline; `--profile` | |
| ✓ | `auth scopes` | resource | `auth_unconfigured_workflow_test.go::TestAuth_UnconfiguredWorkflow`; `auth_profile_workflow_test.go::TestAuth_ProfileWorkflow` | baseline; `--format`/`--profile` via help path | live scope query itself depends on outbound network |
