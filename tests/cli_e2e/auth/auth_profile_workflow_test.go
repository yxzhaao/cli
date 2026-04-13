// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT

package auth

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	clie2e "github.com/larksuite/cli/tests/cli_e2e"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

const authProfileScenarioTimeout = 2 * time.Minute

// Workflow Coverage:
//
//	| t.Run | Command |
//	| --- | --- |
//	| `auth help and status on selected profile` | `auth --help --profile foo`, `auth status --verify --profile foo` |
//	| `auth command lifecycle on selected profile` | `auth check --scope ... --profile foo`, `auth list --profile foo`, `auth logout --profile foo`, `auth scopes --help --profile foo` |
func TestAuth_ProfileWorkflow(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), authProfileScenarioTimeout)
	t.Cleanup(cancel)

	configDir := t.TempDir()
	t.Setenv("LARKSUITE_CLI_CONFIG_DIR", configDir)
	t.Setenv("LARK_CLI_CREDENTIALS_FILE", "")
	require.NoError(t, writeAuthSeedMultiProfileConfig(configDir))

	t.Run("auth help and status on selected profile", func(t *testing.T) {
		helpRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "--help", "--profile", "foo"},
		})
		require.NoError(t, err)
		helpRes.AssertExitCode(t, 0)
		assert.Contains(t, helpRes.Stdout, "OAuth credentials and authorization management")

		statusRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "status", "--verify", "--profile", "foo"},
		})
		require.NoError(t, err)
		statusRes.AssertExitCode(t, 0)
		assert.Equal(t, "cli_auth_e2e_foo", gjson.Get(statusRes.Stdout, "appId").String(), "stdout:\n%s", statusRes.Stdout)
		assert.Equal(t, "bot", gjson.Get(statusRes.Stdout, "identity").String(), "stdout:\n%s", statusRes.Stdout)
	})

	t.Run("auth command lifecycle on selected profile", func(t *testing.T) {
		checkRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "check", "--scope", "im:message.send_as_user", "--profile", "foo"},
		})
		require.NoError(t, err)
		checkRes.AssertExitCode(t, 1)
		assert.Equal(t, "not_logged_in", gjson.Get(checkRes.Stdout, "error").String(), "stdout:\n%s", checkRes.Stdout)

		listRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "list", "--profile", "foo"},
		})
		require.NoError(t, err)
		listRes.AssertExitCode(t, 0)
		assert.Contains(t, listRes.Stdout+listRes.Stderr, "No logged-in users")

		logoutRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "logout", "--profile", "foo"},
		})
		require.NoError(t, err)
		logoutRes.AssertExitCode(t, 0)
		assert.Contains(t, logoutRes.Stdout+logoutRes.Stderr, "Not logged in")

		scopesRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"auth", "scopes", "--help", "--profile", "foo"},
		})
		require.NoError(t, err)
		scopesRes.AssertExitCode(t, 0)
		assert.Contains(t, scopesRes.Stdout+scopesRes.Stderr, "--format")
		assert.Contains(t, scopesRes.Stdout+scopesRes.Stderr, "--profile")
	})
}

func writeAuthSeedMultiProfileConfig(configDir string) error {
	cfg := map[string]any{
		"currentApp": "default",
		"apps": []map[string]any{
			{
				"name":      "default",
				"appId":     "cli_auth_e2e_default",
				"appSecret": "secret_for_e2e_default",
				"brand":     "feishu",
				"lang":      "zh",
				"users":     []any{},
			},
			{
				"name":      "foo",
				"appId":     "cli_auth_e2e_foo",
				"appSecret": "secret_for_e2e_foo",
				"brand":     "feishu",
				"lang":      "zh",
				"users":     []any{},
			},
		},
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(configDir, "config.json"), append(data, '\n'), 0o600)
}
