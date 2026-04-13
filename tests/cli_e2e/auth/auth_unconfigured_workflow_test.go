// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT

package auth

import (
	"context"
	"testing"
	"time"

	clie2e "github.com/larksuite/cli/tests/cli_e2e"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const authUnconfiguredScenarioTimeout = 2 * time.Minute

// Workflow Coverage:
//
//	| t.Run | Command |
//	| --- | --- |
//	| `auth commands without config` | `auth login --no-wait --json`, `auth status`, `auth list`, `auth logout`, `auth check --scope`, `auth scopes` |
func TestAuth_UnconfiguredWorkflow(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), authUnconfiguredScenarioTimeout)
	t.Cleanup(cancel)

	configDir := t.TempDir()
	t.Setenv("LARKSUITE_CLI_CONFIG_DIR", configDir)
	t.Setenv("LARK_CLI_CREDENTIALS_FILE", "")

	t.Run("auth commands without config", func(t *testing.T) {
		loginRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "login", "--no-wait", "--json"},
		})
		require.NoError(t, err)
		loginRes.AssertExitCode(t, 2)
		assert.Contains(t, loginRes.Stdout+loginRes.Stderr, "not configured")

		statusRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "status"},
		})
		require.NoError(t, err)
		statusRes.AssertExitCode(t, 2)
		assert.Contains(t, statusRes.Stdout+statusRes.Stderr, "not configured")

		listRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "list"},
		})
		require.NoError(t, err)
		listRes.AssertExitCode(t, 0)
		assert.Contains(t, listRes.Stdout+listRes.Stderr, "Not configured yet")

		logoutRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "logout"},
		})
		require.NoError(t, err)
		logoutRes.AssertExitCode(t, 0)
		assert.Contains(t, logoutRes.Stdout+logoutRes.Stderr, "No configuration found")

		checkRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "check", "--scope", "im:message.send_as_user"},
		})
		require.NoError(t, err)
		checkRes.AssertExitCode(t, 2)
		assert.Contains(t, checkRes.Stdout+checkRes.Stderr, "not configured")

		scopesRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "scopes"},
		})
		require.NoError(t, err)
		scopesRes.AssertExitCode(t, 2)
		assert.Contains(t, scopesRes.Stdout+scopesRes.Stderr, "not configured")
	})
}
