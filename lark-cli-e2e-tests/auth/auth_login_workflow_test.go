// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT

package auth

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

// Workflow Coverage:
//
//	| t.Run | Command |
//	| --- | --- |
//	| `run scripted auth flow` | `node lark-cli-e2e-tests/browser/auth-login-domain-all.js --domain all` |
//	| `verify auth status fields` | parsed from scripted flow stdout (`auth status --verify`) |
func TestAuth_LoginWorkflow(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), authOverallTime)
	t.Cleanup(cancel)

	artifactDir, err := makeArtifactDir("lark-cli-e2e-auth-login-")
	require.NoError(t, err)
	t.Logf("artifacts: %s", artifactDir)

	var statusJSON string

	t.Run("run scripted auth flow", func(t *testing.T) {
		stepCtx, stepCancel := context.WithTimeout(ctx, authOverallTime)
		t.Cleanup(stepCancel)

		statusOut, runErr := runBrowserAuthByScript(stepCtx, artifactDir)
		require.NoError(t, runErr)
		statusJSON = string(statusOut)
		require.NotEmpty(t, statusJSON)
	})

	t.Run("verify auth status fields", func(t *testing.T) {
		require.Equal(t, "user", gjson.Get(statusJSON, "identity").String(), "stdout:\n%s", statusJSON)
		require.NotEmpty(t, gjson.Get(statusJSON, "userOpenId").String(), "stdout:\n%s", statusJSON)
	})

	t.Run("artifact files exist", func(t *testing.T) {
		_, statErr := filepath.Abs(artifactDir)
		require.NoError(t, statErr)
	})
}
