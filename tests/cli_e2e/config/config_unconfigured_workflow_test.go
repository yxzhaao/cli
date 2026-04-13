// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT

package config

import (
	"context"
	"strings"
	"testing"
	"time"

	clie2e "github.com/larksuite/cli/tests/cli_e2e"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const configUnconfiguredScenarioTimeout = 2 * time.Minute

// Workflow Coverage:
//
//	| t.Run | Command |
//	| --- | --- |
//	| `show default config guidance` | `config show`, `config default-as`, `config strict-mode`, `config init --app-id ... --brand ...` |
func TestConfig_UnconfiguredWorkflow(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), configUnconfiguredScenarioTimeout)
	t.Cleanup(cancel)

	configDir := t.TempDir()
	t.Setenv("LARKSUITE_CLI_CONFIG_DIR", configDir)
	t.Setenv("LARK_CLI_CREDENTIALS_FILE", "")

	t.Run("show default config guidance", func(t *testing.T) {
		showRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "show"},
		})
		require.NoError(t, err)
		assertConfigNeedsInit(t, showRes)

		defaultAsRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "default-as"},
		})
		require.NoError(t, err)
		defaultAsRes.AssertExitCode(t, 2)
		assert.Contains(t, strings.ToLower(defaultAsRes.Stdout+defaultAsRes.Stderr), "not configured")

		strictModeRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "strict-mode"},
		})
		require.NoError(t, err)
		strictModeRes.AssertExitCode(t, 2)
		assert.Contains(t, strings.ToLower(strictModeRes.Stdout+strictModeRes.Stderr), "not configured")

		initRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "init", "--app-id", "cli_config_e2e", "--brand", "feishu"},
		})
		require.NoError(t, err)
		initRes.AssertExitCode(t, 2)
		assert.Contains(t, initRes.Stdout+initRes.Stderr, "config init --new")
		assert.Contains(t, initRes.Stdout+initRes.Stderr, "verification URL")
	})
}

func assertConfigNeedsInit(t *testing.T, result *clie2e.Result) {
	t.Helper()
	assert.Equal(t, 0, result.ExitCode, "stdout:\n%s\nstderr:\n%s", result.Stdout, result.Stderr)
	combined := strings.ToLower(result.Stdout + result.Stderr)
	assert.Contains(t, combined, "config init")
	assert.Contains(t, combined, "not configured yet")
}
