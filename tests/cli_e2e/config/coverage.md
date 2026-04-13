# Config CLI E2E Coverage

## Metrics
- Denominator: 5 leaf commands
- Covered: 5
- Coverage: 100%

## Summary
- `TestConfig_UnconfiguredWorkflow`: covers `config` behavior before initialization, including `show/default-as/strict-mode` errors and `config init --app-id ... --brand ...` guidance.
- `TestConfig_ProfileWorkflow`: covers multi-profile configuration workflows, including selected-profile `show/default-as/strict-mode/remove`, profile lifecycle commands, and `config init --help`.

## Command Table
| Status | Cmd | Type | Testcase | Key parameter shapes | Notes / uncovered reason |
| --- | --- | --- | --- | --- | --- |
| ✓ | `config init` | resource | `config_unconfigured_workflow_test.go::TestConfig_UnconfiguredWorkflow`; `config_profile_workflow_test.go::TestConfig_ProfileWorkflow` | `--app-id --brand`; help includes `--app-secret-stdin --lang --name --new --profile` | browser-backed `--new` flow intentionally excluded from this subset |
| ✓ | `config show` | resource | `config_unconfigured_workflow_test.go::TestConfig_UnconfiguredWorkflow`; `config_profile_workflow_test.go::TestConfig_ProfileWorkflow` | baseline; `--profile` | |
| ✓ | `config default-as` | resource | `config_unconfigured_workflow_test.go::TestConfig_UnconfiguredWorkflow`; `config_profile_workflow_test.go::TestConfig_ProfileWorkflow` | read path; set `user/bot/auto`; `--profile` | |
| ✓ | `config strict-mode` | resource | `config_unconfigured_workflow_test.go::TestConfig_UnconfiguredWorkflow`; `config_profile_workflow_test.go::TestConfig_ProfileWorkflow` | set `bot/user/off`; query; `--global`; `--reset`; `--profile` | |
| ✓ | `config remove` | resource | `config_profile_workflow_test.go::TestConfig_ProfileWorkflow` | `--profile` | |
