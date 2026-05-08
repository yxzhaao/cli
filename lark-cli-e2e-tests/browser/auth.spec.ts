import { test } from "@playwright/test";
import { doAuth } from "./do-auth";

test("complete oauth authorization", async ({ page }, testInfo) => {
  await doAuth(page, testInfo);
});

