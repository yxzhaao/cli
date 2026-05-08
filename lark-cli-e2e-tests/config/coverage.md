# Config CLI E2E Coverage

## Metrics
- Denominator: 5 leaf commands
- Covered: 4
- Coverage: 80%

## Summary
- `TestConfig_UnconfiguredWorkflow`: covers `config` behavior before initialization, including `show/default-as/strict-mode` errors and `config init --app-id ... --brand ...` guidance.
- `TestConfig_ProfileWorkflow`: covers multi-profile configuration workflows, including selected-profile `show/default-as/strict-mode/remove`, profile lifecycle commands, and `config init --help`.
- Blocked area: `TestConfig_InitWorkflow` remains checked in but currently skips because `config init --new` enters a browser-backed app creation flow that triggers tenant review and cannot complete deterministically in automation.

## Command Table
| Status | Cmd | Type | Testcase | Key parameter shapes | Notes / uncovered reason |
| --- | --- | --- | --- | --- | --- |
| ✕ | `config init` | resource | `config_unconfigured_workflow_test.go::TestConfig_UnconfiguredWorkflow`; `config_profile_workflow_test.go::TestConfig_ProfileWorkflow`; `config_init_workflow_test.go::TestConfig_InitWorkflow` | `--app-id --brand`; help includes `--app-secret-stdin --lang --name --new --profile` | current suite proves guidance/help only; successful `--new` flow is blocked by tenant review and skipped |
| ✓ | `config show` | resource | `config_unconfigured_workflow_test.go::TestConfig_UnconfiguredWorkflow`; `config_profile_workflow_test.go::TestConfig_ProfileWorkflow` | baseline; `--profile` | |
| ✓ | `config default-as` | resource | `config_unconfigured_workflow_test.go::TestConfig_UnconfiguredWorkflow`; `config_profile_workflow_test.go::TestConfig_ProfileWorkflow` | read path; set `user/bot/auto`; `--profile` | |
| ✓ | `config strict-mode` | resource | `config_unconfigured_workflow_test.go::TestConfig_UnconfiguredWorkflow`; `config_profile_workflow_test.go::TestConfig_ProfileWorkflow` | set `bot/user/off`; query; `--global`; `--reset`; `--profile` | |
| ✓ | `config remove` | resource | `config_profile_workflow_test.go::TestConfig_ProfileWorkflow` | `--profile` | |
