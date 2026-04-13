// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT

package config

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	clie2e "github.com/larksuite/cli/tests/cli_e2e"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

const configProfileScenarioTimeout = 2 * time.Minute

// Workflow Coverage:
//
//	| t.Run | Command |
//	| --- | --- |
//	| `inspect config on selected profile` | `config --help --profile test1`, `config show --profile test1`, `config init --app-id ... --brand ... --profile test1`, `config init --help` |
//	| `switch profile and toggle back` | `profile list`, `profile use test1`, `profile use -`, `config show` |
//	| `update default identity and strict mode on selected profile` | `config default-as user|bot|auto --profile test1`, `config default-as --profile test1`, `config strict-mode bot|user|off --profile test1`, `config strict-mode --global user`, `config strict-mode --reset --profile test1` |
//	| `rename and remove profile` | `profile rename test1 qa`, `profile remove qa`, `config remove --profile test1` |
func TestConfig_ProfileWorkflow(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), configProfileScenarioTimeout)
	t.Cleanup(cancel)

	configDir := t.TempDir()
	t.Setenv("LARKSUITE_CLI_CONFIG_DIR", configDir)
	t.Setenv("LARK_CLI_CREDENTIALS_FILE", "")
	require.NoError(t, writeSeedMultiProfileConfig(configDir))

	t.Run("inspect config on selected profile", func(t *testing.T) {
		helpRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "--help", "--profile", "test1"},
		})
		require.NoError(t, err)
		helpRes.AssertExitCode(t, 0)
		assert.Contains(t, helpRes.Stdout, "Global CLI configuration management")

		initRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "init", "--app-id", "cli_config_e2e", "--brand", "feishu", "--profile", "test1"},
		})
		require.NoError(t, err)
		initRes.AssertExitCode(t, 2)
		assert.Contains(t, initRes.Stdout+initRes.Stderr, "config init --new")

		initHelpRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "init", "--help"},
		})
		require.NoError(t, err)
		initHelpRes.AssertExitCode(t, 0)
		combined := initHelpRes.Stdout + initHelpRes.Stderr
		for _, flag := range []string{"--app-id", "--app-secret-stdin", "--brand", "--lang", "--name", "--new", "--profile"} {
			assert.Contains(t, combined, flag)
		}

		showRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "show", "--profile", "test1"},
		})
		require.NoError(t, err)
		showRes.AssertExitCode(t, 0)
		assert.Equal(t, "test1", gjson.Get(showRes.Stdout, "profile").String(), "stdout:\n%s", showRes.Stdout)
		assert.Equal(t, "cli_config_test1_e2e", gjson.Get(showRes.Stdout, "appId").String(), "stdout:\n%s", showRes.Stdout)
	})

	t.Run("switch profile and toggle back", func(t *testing.T) {
		listRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"profile", "list"},
		})
		require.NoError(t, err)
		listRes.AssertExitCode(t, 0)
		assert.Contains(t, listRes.Stdout, "default")
		assert.Contains(t, listRes.Stdout, "test1")

		useRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"profile", "use", "test1"},
		})
		require.NoError(t, err)
		useRes.AssertExitCode(t, 0)

		showRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "show"},
		})
		require.NoError(t, err)
		showRes.AssertExitCode(t, 0)
		assert.Equal(t, "test1", gjson.Get(showRes.Stdout, "profile").String())

		backRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"profile", "use", "-"},
		})
		require.NoError(t, err)
		backRes.AssertExitCode(t, 0)

		finalShowRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "show"},
		})
		require.NoError(t, err)
		finalShowRes.AssertExitCode(t, 0)
		assert.Equal(t, "default", gjson.Get(finalShowRes.Stdout, "profile").String())
	})

	t.Run("update default identity and strict mode on selected profile", func(t *testing.T) {
		for _, identity := range []string{"user", "bot", "auto"} {
			setRes, setErr := clie2e.RunCmd(ctx, clie2e.Request{
				Args: []string{"config", "default-as", identity, "--profile", "test1"},
			})
			require.NoError(t, setErr)
			setRes.AssertExitCode(t, 0)
			assert.Contains(t, setRes.Stdout+setRes.Stderr, "Default identity set to")

			getRes, getErr := clie2e.RunCmd(ctx, clie2e.Request{
				Args: []string{"config", "default-as", "--profile", "test1"},
			})
			require.NoError(t, getErr)
			getRes.AssertExitCode(t, 0)
			assert.Contains(t, strings.TrimSpace(getRes.Stdout), "default-as: "+identity)
		}

		for _, mode := range []string{"bot", "user", "off"} {
			setRes, setErr := clie2e.RunCmd(ctx, clie2e.Request{
				Args: []string{"config", "strict-mode", mode, "--profile", "test1"},
			})
			require.NoError(t, setErr)
			setRes.AssertExitCode(t, 0)

			getRes, getErr := clie2e.RunCmd(ctx, clie2e.Request{
				Args: []string{"config", "strict-mode", "--profile", "test1"},
			})
			require.NoError(t, getErr)
			getRes.AssertExitCode(t, 0)
			assert.Contains(t, getRes.Stdout, "strict-mode: "+mode)
		}

		globalRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "strict-mode", "user", "--global"},
		})
		require.NoError(t, err)
		globalRes.AssertExitCode(t, 0)

		resetRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "strict-mode", "--reset", "--profile", "test1"},
		})
		require.NoError(t, err)
		resetRes.AssertExitCode(t, 0)

		finalRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "strict-mode", "--profile", "test1"},
		})
		require.NoError(t, err)
		finalRes.AssertExitCode(t, 0)
		assert.Contains(t, finalRes.Stdout, "strict-mode: user")
	})

	t.Run("rename and remove profile", func(t *testing.T) {
		renameRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"profile", "rename", "test1", "qa"},
		})
		require.NoError(t, err)
		renameRes.AssertExitCode(t, 0)

		listRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"profile", "list"},
		})
		require.NoError(t, err)
		listRes.AssertExitCode(t, 0)
		names := gjson.Get(listRes.Stdout, "#.name").Array()
		var got []string
		for _, item := range names {
			got = append(got, item.String())
		}
		assert.Contains(t, got, "qa")
		assert.NotContains(t, got, "test1")

		removeProfileRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"profile", "remove", "qa"},
		})
		require.NoError(t, err)
		removeProfileRes.AssertExitCode(t, 0)

		removeConfigRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "remove", "--profile", "test1"},
		})
		require.NoError(t, err)
		removeConfigRes.AssertExitCode(t, 0)
		assert.Contains(t, removeConfigRes.Stdout+removeConfigRes.Stderr, "Configuration removed")

		showRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"config", "show", "--profile", "test1"},
		})
		require.NoError(t, err)
		assertConfigNeedsInit(t, showRes)

		finalListRes, err := clie2e.RunCmd(ctx, clie2e.Request{
			Args: []string{"profile", "list"},
		})
		require.NoError(t, err)
		finalListRes.AssertExitCode(t, 0)
		finalNames := gjson.Get(finalListRes.Stdout, "#.name").Array()
		var finalGot []string
		for _, item := range finalNames {
			finalGot = append(finalGot, item.String())
		}
		assert.NotContains(t, finalGot, "qa")
	})
}

func writeSeedMultiProfileConfig(configDir string) error {
	cfg := map[string]any{
		"currentApp":  "default",
		"previousApp": "test1",
		"apps": []map[string]any{
			{
				"name":      "default",
				"appId":     "cli_config_default_e2e",
				"appSecret": "secret_default",
				"brand":     "feishu",
				"lang":      "zh",
				"users":     []any{},
			},
			{
				"name":      "test1",
				"appId":     "cli_config_test1_e2e",
				"appSecret": "secret_test1",
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
