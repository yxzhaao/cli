// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT

package config

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

const (
	envEnableBrowserAuth = "LARK_E2E_ENABLE_BROWSER_AUTH"
	envAuthURL           = "AUTH_URL"
	envArtifactDir       = "ARTIFACT_DIR"
)

const (
	browserTimeout    = 120 * time.Second
	configURLTimeout  = 30 * time.Second
	configExitTimeout = 120 * time.Second
	configOverallTime = 4 * time.Minute
)

var verificationURLPattern = regexp.MustCompile(`https?://[^\s"'<>]+`)

// Workflow Coverage:
//
//	| t.Run | Command |
//	| --- | --- |
//	| `start config init process` | `config init --new` |
//	| `extract verification url` | parse stdout/stderr stream |
//	| `authorize in browser` | `npx playwright test` |
//	| `wait process complete` | wait `config init --new` exit |
//	| `verify config fields` | `config show` |
func TestConfig_InitWorkflow(t *testing.T) {
	t.Skip("blocked: config init --new triggers tenant app review in browser flow; skip browser automation for now")

	if !browserAuthEnabled() {
		t.Skipf("set %s=1 to run browser authorization E2E", envEnableBrowserAuth)
	}

	ctx, cancel := context.WithTimeout(context.Background(), configOverallTime)
	t.Cleanup(cancel)

	artifactDir, err := makeArtifactDir("lark-cli-e2e-config-init-")
	require.NoError(t, err)
	t.Logf("artifacts: %s", artifactDir)

	tempHome, err := os.MkdirTemp("", "lark-cli-e2e-config-home-")
	require.NoError(t, err)
	t.Cleanup(func() { _ = os.RemoveAll(tempHome) })

	configDir := filepath.Join(tempHome, ".lark-cli")
	require.NoError(t, os.MkdirAll(configDir, 0o700))

	binaryPath, err := resolveBinaryPath()
	require.NoError(t, err)

	cmd := exec.CommandContext(ctx, binaryPath, "config", "init", "--new")
	cmdEnv := append(os.Environ(),
		"HOME="+tempHome,
		"USERPROFILE="+tempHome,
		"LARKSUITE_CLI_CONFIG_DIR="+configDir,
	)
	cmd.Env = cmdEnv

	stdoutPipe, err := cmd.StdoutPipe()
	require.NoError(t, err)
	stderrPipe, err := cmd.StderrPipe()
	require.NoError(t, err)

	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer
	urlCh := make(chan string, 1)
	var urlOnce sync.Once
	var wg sync.WaitGroup

	wg.Add(2)
	go streamAndCapture(&wg, stdoutPipe, &stdoutBuf, filepath.Join(artifactDir, "cli.stdout.log"), &urlOnce, urlCh)
	go streamAndCapture(&wg, stderrPipe, &stderrBuf, filepath.Join(artifactDir, "cli.stderr.log"), &urlOnce, urlCh)

	require.NoError(t, cmd.Start())

	var verificationURL string
	urlTimer := time.NewTimer(configURLTimeout)
	defer urlTimer.Stop()
	select {
	case verificationURL = <-urlCh:
	case <-urlTimer.C:
		_ = cmd.Process.Kill()
		wg.Wait()
		t.Fatalf("url_timeout: failed to detect verification URL in %s", configURLTimeout)
	}
	require.NotEmpty(t, verificationURL)

	browserCtx, browserCancel := context.WithTimeout(ctx, browserTimeout)
	t.Cleanup(browserCancel)
	err = runBrowserAuth(browserCtx, verificationURL, artifactDir)
	require.NoError(t, err, "browser_timeout: auth automation failed")

	waitDone := make(chan error, 1)
	go func() {
		waitDone <- cmd.Wait()
	}()

	exitTimer := time.NewTimer(configExitTimeout)
	defer exitTimer.Stop()
	select {
	case waitErr := <-waitDone:
		wg.Wait()
		require.NoError(t, waitErr, "cli_timeout: config init failed\nstdout:\n%s\nstderr:\n%s", stdoutBuf.String(), stderrBuf.String())
	case <-exitTimer.C:
		_ = cmd.Process.Kill()
		wg.Wait()
		t.Fatalf("cli_timeout: config init did not exit in %s", configExitTimeout)
	}

	showCmd := exec.CommandContext(ctx, binaryPath, "config", "show")
	showCmd.Env = cmdEnv
	var showStdout bytes.Buffer
	var showStderr bytes.Buffer
	showCmd.Stdout = &showStdout
	showCmd.Stderr = &showStderr
	require.NoError(t, showCmd.Run(), "config show failed: stderr=%s", showStderr.String())
	assert.NotEmpty(t, gjson.Get(showStdout.String(), "appId").String(), "stdout:\n%s", showStdout.String())
	assert.NotEmpty(t, gjson.Get(showStdout.String(), "appSecret").String(), "stdout:\n%s", showStdout.String())
	assert.NotEmpty(t, gjson.Get(showStdout.String(), "brand").String(), "stdout:\n%s", showStdout.String())
}

func streamAndCapture(
	wg *sync.WaitGroup,
	reader io.Reader,
	buffer *bytes.Buffer,
	logPath string,
	urlOnce *sync.Once,
	urlCh chan<- string,
) {
	defer wg.Done()

	logFile, err := os.Create(logPath)
	if err != nil {
		return
	}
	defer func() { _ = logFile.Close() }()

	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		_, _ = fmt.Fprintln(logFile, line)
		buffer.WriteString(line)
		buffer.WriteByte('\n')
		if url := extractVerificationURL(line); url != "" {
			urlOnce.Do(func() {
				urlCh <- url
			})
		}
	}
}

func resolveBinaryPath() (string, error) {
	if envPath := strings.TrimSpace(os.Getenv("LARK_CLI_BIN")); envPath != "" {
		return envPath, nil
	}
	return exec.LookPath("lark-cli")
}

func browserAuthEnabled() bool {
	v := strings.TrimSpace(os.Getenv(envEnableBrowserAuth))
	return strings.EqualFold(v, "1") || strings.EqualFold(v, "true")
}

func extractVerificationURL(raw string) string {
	matches := verificationURLPattern.FindAllString(raw, -1)
	for _, candidate := range matches {
		if strings.Contains(candidate, "user_code=") {
			return candidate
		}
	}
	return ""
}

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

func runBrowserAuth(ctx context.Context, url string, artifactDir string) error {
	root, err := repoRootDir()
	if err != nil {
		return err
	}
	browserDir := filepath.Join(root, "lark-cli-e2e-tests", "browser")

	cmd := exec.CommandContext(ctx, "npx", "playwright", "test", "--project=chromium", "--reporter=list")
	cmd.Dir = browserDir
	cmd.Env = append(os.Environ(),
		envAuthURL+"="+url,
		envArtifactDir+"="+artifactDir,
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err = cmd.Run()
	_ = writeArtifact(filepath.Join(artifactDir, "playwright.stdout.log"), stdout.Bytes())
	_ = writeArtifact(filepath.Join(artifactDir, "playwright.stderr.log"), stderr.Bytes())
	if err != nil {
		return fmt.Errorf("playwright auth failed: %w", err)
	}
	return nil
}
