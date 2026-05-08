// Copyright (c) 2026 Lark Technologies Pte. Ltd.
// SPDX-License-Identifier: MIT

package contact

import (
	"context"
	"testing"

	clie2e "github.com/larksuite/cli/lark-cli-e2e-tests"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

type verifiedUserIdentity struct {
	OpenID string
	Name   string
}

func requireVerifiedUserIdentity(t *testing.T, ctx context.Context) verifiedUserIdentity {
	t.Helper()

	statusResult, err := clie2e.RunCmd(ctx, clie2e.Request{
		Args: []string{"auth", "status", "--verify"},
	})
	require.NoError(t, err)

	if statusResult.ExitCode != 0 {
		t.Skipf("requires verified user-capable environment; auth status failed: stderr=%s stdout=%s", statusResult.Stderr, statusResult.Stdout)
	}
	if gjson.Get(statusResult.Stdout, "identity").String() != "user" {
		t.Skipf("requires verified user identity; auth status: %s", statusResult.Stdout)
	}
	if !gjson.Get(statusResult.Stdout, "verified").Bool() {
		t.Skipf("requires verified user token; auth status: %s", statusResult.Stdout)
	}

	openID := gjson.Get(statusResult.Stdout, "userOpenId").String()
	if openID == "" {
		t.Skipf("requires verified user open_id; auth status: %s", statusResult.Stdout)
	}

	return verifiedUserIdentity{
		OpenID: openID,
		Name:   gjson.Get(statusResult.Stdout, "userName").String(),
	}
}
