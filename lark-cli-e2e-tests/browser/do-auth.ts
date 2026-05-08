import fs from "node:fs/promises";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { AuthPage } from "./auth-page";
import { CliAppPage } from "./cli-app-page";

type SessionAPIConfig = {
  url: string;
  accessToken: string;
  unit: string;
  env: string;
  mobile: string;
  password: string;
  code: string;
  tenantId: string;
  useCache: boolean;
  appId: string;
  userId: string;
};

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

// #region debug-point A:debug-client
function debugEvent(hypothesisId: string, location: string, msg: string, data: Record<string, unknown> = {}): void {
  void (async () => {
    let url = "http://127.0.0.1:7777/event";
    let sessionId = "browser-session-injection";
    try {
      const envText = await fs.readFile(path.join(process.cwd(), "..", "..", ".dbg", "browser-session-injection.env"), "utf8");
      url = envText.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || url;
      sessionId = envText.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || sessionId;
    } catch {}
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, runId: "pre-fix", hypothesisId, location, msg: `[DEBUG] ${msg}`, data, ts: Date.now() }),
    }).catch(() => undefined);
  })();
}
// #endregion

function findSession(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  if ("session" in value && typeof value.session === "string" && value.session) {
    return value.session;
  }

  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== "object") continue;
    if ("session" in current && typeof current.session === "string" && current.session) {
      return current.session;
    }
    queue.push(...Object.values(current));
  }
  return "";
}

function getSessionConfigFromEnv(): SessionAPIConfig {
  return {
    url: process.env.LARK_SESSION_URL || "https://lark-bbq.bytedance.net/testing/open_api/v1/lark-sessions",
    accessToken: process.env.LARK_SESSION_ACCESS_TOKEN || "",
    unit: process.env.LARK_SESSION_UNIT || "cn",
    env: process.env.LARK_SESSION_ENV || "online",
    mobile: process.env.LARK_SESSION_MOBILE || "",
    password: process.env.LARK_SESSION_PASSWORD || "",
    code: process.env.LARK_SESSION_CODE || "",
    tenantId: process.env.LARK_SESSION_TENANT_ID || "",
    useCache: String(process.env.LARK_SESSION_USE_CACHE || "true").toLowerCase() !== "false",
    appId: process.env.LARK_SESSION_APP_ID || "",
    userId: process.env.LARK_SESSION_USER_ID || "",
  };
}

function canFetchSession(config: SessionAPIConfig): boolean {
  return Boolean(
    config.accessToken &&
      config.mobile &&
      config.password &&
      config.code &&
      config.tenantId &&
      config.appId &&
      config.userId
  );
}

async function fetchSessionFromAPI(config: SessionAPIConfig): Promise<string> {
  const payload = {
    unit: config.unit,
    env: config.env,
    mobile: config.mobile,
    password: config.password,
    code: config.code,
    tenant_id: config.tenantId,
    use_cache: config.useCache,
    app_id: Number(config.appId),
    user_id: config.userId,
  };

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "X-Access-Token": config.accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body: unknown = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`session api failed: HTTP ${response.status} ${text}`);
  }

  const session = findSession(body);
  if (!session) {
    throw new Error("session api response has no session field");
  }
  return session;
}

function buildCookieDomains(host: string): string[] {
  const domains = new Set([host, `.${host}`]);
  if (host.endsWith("feishu.cn")) {
    domains.add("accounts.feishu.cn");
    domains.add(".accounts.feishu.cn");
    domains.add(".feishu.cn");
  }
  if (host.endsWith("larksuite.com")) {
    domains.add("accounts.larksuite.com");
    domains.add(".accounts.larksuite.com");
    domains.add(".larksuite.com");
  }
  return Array.from(domains);
}

async function injectSessionCookie(page: Page, authURL: string, session: string): Promise<void> {
  const target = new URL(authURL);
  const cookies = buildCookieDomains(target.hostname).flatMap((domain) =>
    ["session", "sl_session", "session_list"].map((name) => ({
      name,
      value: session,
      domain,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    }))
  );
  await page.context().addCookies(cookies);
}

export async function doAuth(page: Page, testInfo: TestInfo): Promise<void> {
  const authURL = process.env.AUTH_URL;
  const artifactDir = process.env.ARTIFACT_DIR || "artifacts";
  if (!authURL) {
    throw new Error("missing AUTH_URL");
  }
  await ensureDir(artifactDir);

  let session = process.env.FEISHU_SESSION || "";
  // #region debug-point A:entry
  debugEvent("A", "do-auth.ts:entry", "playwright auth entry", {
    authURL,
    hasSessionEnv: Boolean(session),
    userDataDir: process.env.PW_USER_DATA_DIR || "",
    headlessEnv: process.env.PLAYWRIGHT_HEADLESS || "",
  });
  // #endregion
  if (!session) {
    const config = getSessionConfigFromEnv();
    if (canFetchSession(config)) {
      session = await fetchSessionFromAPI(config);
      // #region debug-point B:fetched-session
      debugEvent("B", "do-auth.ts:fetchSession", "session fetched from api", {
        sessionLength: session.length,
        sessionPrefix: session.slice(0, 8),
      });
      // #endregion
    }
  }
  if (!session) {
    throw new Error("missing session: set FEISHU_SESSION or provide LARK_SESSION_*");
  }

  const authPage = /open\.feishu\.cn\/page\/cli(?:[/?#]|$)/i.test(authURL)
    ? new CliAppPage(page)
    : new AuthPage(page);
  try {
    // #region debug-point C:before-inject
    debugEvent("C", "do-auth.ts:beforeInject", "before cookie inject", {
      cookieCount: (await page.context().cookies()).length,
    });
    // #endregion
    await injectSessionCookie(page, authURL, session);
    // #region debug-point C:after-inject
    debugEvent("C", "do-auth.ts:afterInject", "after cookie inject", {
      cookieCount: (await page.context().cookies()).length,
      accountCookies: (await page.context().cookies()).filter((c) => String(c.domain || "").includes("feishu")).map((c) => ({ name: c.name, domain: c.domain })),
    });
    // #endregion
    await authPage.open(authURL);
    // #region debug-point D:after-open
    debugEvent("D", "do-auth.ts:afterOpen", "after auth page open", {
      url: page.url(),
      title: await page.title().catch(() => ""),
      bodyPreview: await page.evaluate(() => (document.body && document.body.innerText ? document.body.innerText.slice(0, 120) : "")).catch(() => ""),
    });
    // #endregion
    await authPage.completeAuth();
  } catch (error) {
    // #region debug-point E:error
    debugEvent("E", "do-auth.ts:catch", "playwright auth error", {
      url: page.url(),
      error: String(error),
    });
    // #endregion
    const shot = path.join(artifactDir, "failure.png");
    await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
    await testInfo.attach("browser-error", {
      body: String(error),
      contentType: "text/plain",
    });
    throw error;
  }
}
