// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT

package auth

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	envArtifactDir        = "ARTIFACT_DIR"
	envAuthLoginScript    = "LARK_E2E_AUTH_LOGIN_SCRIPT"
	envBrowserUserDataDir = "LARK_E2E_BROWSER_USER_DATA_DIR"
)

const (
	authOverallTime = 4 * time.Minute
)

func repoRootDir() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("get working directory: %w", err)
	}
	for {
		if _, statErr := os.Stat(filepath.Join(dir, "lark-cli-e2e-tests")); statErr == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("repo root not found from %q", dir)
		}
		dir = parent
	}
}

func makeArtifactDir(prefix string) (string, error) {
	root, err := os.MkdirTemp("", prefix)
	if err != nil {
		return "", fmt.Errorf("create artifact root: %w", err)
	}
	return root, nil
}

func writeArtifact(path string, data []byte) error {
	return os.WriteFile(path, data, 0o600)
}

func resolveAuthLoginScriptPath(root string) string {
	override := strings.TrimSpace(os.Getenv(envAuthLoginScript))
	if override != "" {
		if filepath.IsAbs(override) {
			return override
		}
		return filepath.Join(root, override)
	}
	return filepath.Join(root, "lark-cli-e2e-tests", "browser", "auth-login-domain-all.js")
}

func runBrowserAuthByScript(ctx context.Context, artifactDir string) ([]byte, error) {
	root, err := repoRootDir()
	if err != nil {
		return nil, err
	}

	scriptPath := resolveAuthLoginScriptPath(root)
	if _, statErr := os.Stat(scriptPath); statErr != nil {
		return nil, fmt.Errorf("auth interaction script not found: %s: %w", scriptPath, statErr)
	}

	browserDir := filepath.Join(root, "lark-cli-e2e-tests", "browser")
	args := []string{
		scriptPath,
		"--domain", "all",
		"--timeout-ms", strconv.FormatInt(authOverallTime.Milliseconds(), 10),
	}
	if userDataDir := strings.TrimSpace(os.Getenv(envBrowserUserDataDir)); userDataDir != "" {
		args = append(args, "--user-data-dir", userDataDir)
	}
	if _, statErr := os.Stat(filepath.Join(root, "lark-cli")); statErr == nil {
		args = append(args, "--cli-path", filepath.Join(root, "lark-cli"))
	}

	cmd := exec.CommandContext(ctx, "node", args...)
	cmd.Dir = browserDir
	cmd.Env = append(os.Environ(), envArtifactDir+"="+artifactDir)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err = cmd.Run()
	_ = writeArtifact(filepath.Join(artifactDir, "auth-login-domain-all.stdout.log"), stdout.Bytes())
	_ = writeArtifact(filepath.Join(artifactDir, "auth-login-domain-all.stderr.log"), stderr.Bytes())
	if err != nil {
		return nil, fmt.Errorf("auth interaction script failed: %w", err)
	}
	return stdout.Bytes(), nil
}
