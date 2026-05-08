#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');

function parseArgs(argv) {
  const args = {
    cliPath: '',
    domain: 'all',
    headless: true,
    session: '',
    timeoutMs: 180000,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'lark-cli-e2e-auth-')),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cli-path') {
      args.cliPath = String(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (arg === '--domain') {
      args.domain = String(argv[i + 1] || 'all');
      i += 1;
      continue;
    }
    if (arg === '--headless') {
      args.headless = true;
      continue;
    }
    if (arg === '--session') {
      args.session = String(argv[i + 1] || '');
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      args.timeoutMs = Number(argv[i + 1] || '180000');
      i += 1;
      continue;
    }
    if (arg === '--user-data-dir') {
      args.userDataDir = path.resolve(argv[i + 1] || fs.mkdtempSync(path.join(os.tmpdir(), 'lark-cli-e2e-auth-')));
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node auth-login-domain-all.js [options]

Options:
  --cli-path <path>        lark-cli binary path (default: auto-detect ./lark-cli in repo root)
  --domain <name>          auth domain, default: all
  --session <value>        inject browser cookie: session
  --user-data-dir <path>   Playwright persistent profile path
  --headless               run browser in headless mode
  --timeout-ms <ms>        timeout for browser auth, default: 180000

Env:
  FEISHU_SESSION           same as --session

Behavior:
  - auto-load .env.session in current dir if exists
  - if FEISHU_SESSION missing, auto-fetch from LARK_SESSION_* env vars when available
`);
}

function stripQuotes(v) {
  const s = String(v || '').trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#')) continue;
    const idx = raw.indexOf('=');
    if (idx <= 0) continue;
    const key = raw.slice(0, idx).trim();
    const val = stripQuotes(raw.slice(idx + 1));
    if (!key) continue;
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = val;
    }
  }
}

function hydrateArgsFromEnv(args) {
  if (!args.session) args.session = process.env.FEISHU_SESSION || '';
}

// #region debug-point A:args-env
const debugEvent = (hypothesisId, location, msg, data = {}) => {
  (() => {
    let url = 'http://127.0.0.1:7777/event';
    let sessionId = 'browser-session-injection';
    try {
      const envText = fs.readFileSync(path.join(process.cwd(), '..', '..', '.dbg', 'browser-session-injection.env'), 'utf8');
      url = envText.match(/DEBUG_SERVER_URL=(.+)/)?.[1] || url;
      sessionId = envText.match(/DEBUG_SESSION_ID=(.+)/)?.[1] || sessionId;
    } catch {}
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, runId: 'pre-fix', hypothesisId, location, msg: `[DEBUG] ${msg}`, data, ts: Date.now() }),
    }).catch(() => {});
  })();
};
// #endregion

function findRepoRoot(fromDir) {
  let dir = fromDir;
  while (true) {
    if (fs.existsSync(path.join(dir, '.git')) && fs.existsSync(path.join(dir, 'cmd'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`repo root not found from ${fromDir}`);
    }
    dir = parent;
  }
}

function resolveCliPath(inputPath, repoRoot) {
  if (inputPath) return path.resolve(inputPath);
  const guessed = path.join(repoRoot, 'lark-cli');
  if (fs.existsSync(guessed)) return guessed;
  const fromPath = spawnSync('which', ['lark-cli'], { encoding: 'utf8' });
  if (fromPath.status === 0) {
    const p = String(fromPath.stdout || '').trim();
    if (p) return p;
  }
  throw new Error('lark-cli binary not found. Build first (`make build`), install `lark-cli` in PATH, or pass --cli-path');
}

function runCLI(cliPath, args) {
  const ret = spawnSync(cliPath, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (ret.error) {
    throw ret.error;
  }

  if (ret.status !== 0) {
    const errOut = String(ret.stderr || ret.stdout || '').trim();
    throw new Error(`command failed: ${cliPath} ${args.join(' ')}\n${errOut}`);
  }

  return {
    stdout: String(ret.stdout || ''),
    stderr: String(ret.stderr || ''),
  };
}

function extractAuthPayload(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    throw new Error(`cannot parse JSON from auth login --no-wait: ${String(err)}`);
  }

  const verificationURL = parsed.verification_url || '';
  const deviceCode = parsed.device_code || '';
  if (!verificationURL || !deviceCode) {
    throw new Error(`missing verification_url/device_code in output: ${stdout}`);
  }

  return { verificationURL, deviceCode };
}

function findSession(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (typeof obj.session === 'string' && obj.session) return obj.session;
  const queue = [obj];
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur || typeof cur !== 'object') continue;
    if (typeof cur.session === 'string' && cur.session) return cur.session;
    for (const v of Object.values(cur)) {
      if (v && typeof v === 'object') queue.push(v);
    }
  }
  return '';
}

function getSessionAPIConfigFromEnv() {
  return {
    url: process.env.LARK_SESSION_URL || 'https://lark-bbq.bytedance.net/testing/open_api/v1/lark-sessions',
    accessToken: process.env.LARK_SESSION_ACCESS_TOKEN || '',
    unit: process.env.LARK_SESSION_UNIT || 'cn',
    env: process.env.LARK_SESSION_ENV || 'online',
    mobile: process.env.LARK_SESSION_MOBILE || '',
    password: process.env.LARK_SESSION_PASSWORD || '',
    code: process.env.LARK_SESSION_CODE || '',
    tenantId: process.env.LARK_SESSION_TENANT_ID || '',
    useCache: String(process.env.LARK_SESSION_USE_CACHE || 'true').toLowerCase() !== 'false',
    appId: process.env.LARK_SESSION_APP_ID || '',
    userId: process.env.LARK_SESSION_USER_ID || '',
  };
}

function canFetchSession(cfg) {
  return Boolean(cfg.accessToken && cfg.mobile && cfg.password && cfg.code && cfg.tenantId && cfg.appId && cfg.userId);
}

async function maybeFetchSessionFromAPI() {
  const cfg = getSessionAPIConfigFromEnv();
  if (!canFetchSession(cfg)) return '';

  const payload = {
    unit: cfg.unit,
    env: cfg.env,
    mobile: cfg.mobile,
    password: cfg.password,
    code: cfg.code,
    tenant_id: cfg.tenantId,
    use_cache: cfg.useCache,
    app_id: Number(cfg.appId),
    user_id: cfg.userId,
  };

  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'X-Access-Token': cfg.accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`session api failed: HTTP ${resp.status} ${t}`);
  }

  const bodyText = await resp.text();
  let body = {};
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { raw: bodyText };
  }

  return findSession(body);
}

function buildCookieDomains(host) {
  const domains = new Set([host, `.${host}`]);

  if (host.endsWith('feishu.cn')) {
    domains.add('accounts.feishu.cn');
    domains.add('.accounts.feishu.cn');
    domains.add('.feishu.cn');
  }

  if (host.endsWith('larksuite.com')) {
    domains.add('accounts.larksuite.com');
    domains.add('.accounts.larksuite.com');
    domains.add('.larksuite.com');
  }

  return Array.from(domains);
}

async function injectSessionCookie(context, session, verificationURL) {
  if (!session) return;

  const target = new URL(verificationURL);
  const domains = buildCookieDomains(target.hostname);
  const names = ['session', 'sl_session', 'session_list'];
  const cookies = [];

  for (const domain of domains) {
    for (const name of names) {
      cookies.push({
        name,
        value: session,
        domain,
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      });
    }
  }

  await context.addCookies(cookies);
}

async function clickAuthorize(page) {
  const checkboxPatterns = [/同意|协议|条款|已阅读|agree|terms|policy/i];
  const patterns = [
    /授权|同意|允许|确认|继续|完成|去授权|下一步|提交/i,
    /authorize|accept|allow|approve|continue|confirm|done|next|submit|grant/i,
  ];

  const roots = [page, ...page.frames()];

  for (const root of roots) {
    for (const p of checkboxPatterns) {
      const box = root.getByRole('checkbox', { name: p }).first();
      if (await box.isVisible({ timeout: 800 }).catch(() => false)) {
        await box.click({ timeout: 5000 }).catch(() => undefined);
      }
      const textNode = root.getByText(p).first();
      if (await textNode.isVisible({ timeout: 500 }).catch(() => false)) {
        await textNode.click({ timeout: 5000 }).catch(() => undefined);
      }
    }
  }

  for (const root of roots) {
    for (const p of patterns) {
      const btn = root.getByRole('button', { name: p }).first();
      if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
        try {
          await btn.click({ timeout: 15000 });
        } catch (err) {
          await btn.click({ timeout: 5000, force: true }).catch(() => undefined);
          if (await waitForAuthSuccess(page, 3000).then(() => true).catch(() => false)) return;
          throw err;
        }
        return;
      }
      const textNode = root.getByText(p).first();
      if (await textNode.isVisible({ timeout: 1200 }).catch(() => false)) {
        await textNode.click({ timeout: 10000 }).catch(() => undefined);
        return;
      }
    }
  }

  for (const root of roots) {
    const fallback = root.locator("button, [role='button']").first();
    if (await fallback.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fallback.click({ timeout: 10000 }).catch(() => undefined);
      return;
    }
    const clicked = await root.evaluate((keywords) => {
      const collect = (start) => {
        const out = [];
        const stack = [start];
        while (stack.length > 0) {
          const cur = stack.pop();
          if (!cur) continue;
          if (cur.nodeType === Node.ELEMENT_NODE) out.push(cur);
          const sr = cur.shadowRoot;
          if (sr) stack.push(sr);
          const children = cur.children || [];
          for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
        }
        return out;
      };

      const nodes = collect(document).filter((el) => {
        const tag = (el.tagName || '').toLowerCase();
        if (tag === 'button' || tag === 'a' || tag === 'span' || tag === 'div' || tag === 'label') return true;
        if (el.getAttribute && el.getAttribute('role') === 'button') return true;
        if (tag === 'input') {
          const type = (el.getAttribute('type') || '').toLowerCase();
          return type === 'button' || type === 'submit';
        }
        return false;
      });

      for (const node of nodes) {
        const text = (node.textContent || '').trim().toLowerCase();
        if (!text) continue;
        if (!keywords.some((k) => text.includes(k))) continue;
        const rect = node.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return true;
      }
      return false;
    }, ['授权', '同意', '允许', '确认', '继续', 'authorize', 'accept', 'allow', 'approve', 'continue']).catch(() => false);
    if (clicked) return;
  }

  throw new Error('authorize button not found');
}

async function hasAuthorizeAction(page) {
  const patterns = [/授权|同意|允许|确认|继续|下一步|提交/i, /authorize|accept|allow|approve|continue|next|submit|grant/i];
  const roots = [page, ...page.frames()];
  for (const root of roots) {
    for (const p of patterns) {
      const btn = root.getByRole('button', { name: p }).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) return true;
    }
  }
  return false;
}

async function waitForAuthSuccess(page, timeoutMs) {
  const successTextPatterns = [
    /授权成功|已成功授权|授权完成|已完成授权/i,
    /authorization successful|authorized successfully|authorization complete|you can close this page/i,
  ];
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const url = page.url();
    if (/success|complete|result|authorized|done/i.test(url)) {
      return;
    }

    for (const p of successTextPatterns) {
      const node = page.getByText(p).first();
      if (await node.isVisible({ timeout: 400 }).catch(() => false)) {
        return;
      }
    }

    await page.waitForTimeout(500);
  }
  throw new Error('authorization success signal not found after click');
}

async function waitForScopePageReady(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snapshot = await collectDOMSnapshot(page);
    const preview = String(snapshot.bodyPreview || '').toLowerCase();
    const loading = preview.includes('one moment, loading');
    const bodyTextLen = Number(snapshot.bodyTextLength || 0);
    if (!loading && bodyTextLen > 30) {
      return;
    }
    await page.waitForTimeout(500);
  }
}

async function collectClickableTexts(page) {
  return page.evaluate(() => {
    const collect = (start) => {
      const out = [];
      const stack = [start];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur) continue;
        if (cur.nodeType === Node.ELEMENT_NODE) out.push(cur);
        const sr = cur.shadowRoot;
        if (sr) stack.push(sr);
        const children = cur.children || [];
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
      }
      return out;
    };

    const nodes = collect(document).filter((el) => {
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'label') return true;
      const role = el.getAttribute ? el.getAttribute('role') : '';
      return role === 'button' || role === 'checkbox';
    });
    const out = [];
    for (const n of nodes) {
      const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const rect = n.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      out.push(t);
      if (out.length >= 40) break;
    }
    return out;
  }).catch(() => []);
}

async function collectDOMSnapshot(page) {
  return page.evaluate(() => ({
    title: document.title || '',
    readyState: document.readyState || '',
    htmlLength: (document.documentElement && document.documentElement.outerHTML ? document.documentElement.outerHTML.length : 0),
    bodyTextLength: (document.body && document.body.innerText ? document.body.innerText.length : 0),
    bodyPreview: (document.body && document.body.innerText ? document.body.innerText.slice(0, 200) : ''),
  })).catch(() => ({}));
}

async function runBrowserAuth(args, verificationURL) {
  // #region debug-point A:launch
  debugEvent('A', 'auth-login-domain-all.js:runBrowserAuth', 'launch persistent context', {
    headless: args.headless,
    userDataDir: args.userDataDir,
    verificationHost: new URL(verificationURL).hostname,
    hasSession: Boolean(args.session),
  });
  // #endregion
  const context = await chromium.launchPersistentContext(args.userDataDir, {
    headless: args.headless,
  });
  const page = context.pages()[0] || (await context.newPage());
  const artifactDir = process.env.ARTIFACT_DIR || path.join(process.cwd(), 'artifacts');
  const failureShot = path.join(artifactDir, 'auth-login-domain-all-failure.png');
  const consoleLogs = [];
  const pageErrors = [];
  const requestFails = [];

  page.on('console', (msg) => {
    if (consoleLogs.length < 20) consoleLogs.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    if (pageErrors.length < 20) pageErrors.push(String(err && err.message ? err.message : err));
  });
  page.on('requestfailed', (req) => {
    if (requestFails.length < 30) {
      const failure = req.failure();
      requestFails.push(`${req.url()} :: ${failure ? failure.errorText : 'unknown'}`);
    }
  });

  try {
    // #region debug-point C:before-inject
    debugEvent('C', 'auth-login-domain-all.js:beforeInject', 'before cookie inject', {
      cookieCount: (await context.cookies()).length,
    });
    // #endregion
    await injectSessionCookie(context, args.session, verificationURL);
    // #region debug-point C:after-inject
    debugEvent('C', 'auth-login-domain-all.js:afterInject', 'after cookie inject', {
      cookieCount: (await context.cookies()).length,
      accountCookies: (await context.cookies()).filter((c) => String(c.domain || '').includes('feishu')).map((c) => ({ name: c.name, domain: c.domain })),
    });
    // #endregion
    await page.goto(verificationURL, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
    // #region debug-point D:after-goto
    debugEvent('D', 'auth-login-domain-all.js:afterGoto', 'after goto verification url', {
      url: page.url(),
      title: await page.title().catch(() => ''),
      cookieCount: (await context.cookies()).length,
      bodyPreview: await page.evaluate(() => (document.body && document.body.innerText ? document.body.innerText.slice(0, 120) : '')).catch(() => ''),
    });
    // #endregion

    const currentURL = page.url();
    if (currentURL.includes('/accounts/page/login') || currentURL.includes('qrlogin')) {
      const mode = args.session ? 'session_cookie' : 'none';
      throw new Error(`still redirected to login page; auth_state=${mode}; url=${currentURL}`);
    }

    await waitForScopePageReady(page, Math.min(args.timeoutMs, 45000));

    for (let i = 0; i < 4; i += 1) {
      if (await waitForAuthSuccess(page, 1500).then(() => true).catch(() => false)) {
        return;
      }
      try {
        await clickAuthorize(page);
      } catch (err) {
        if (await waitForAuthSuccess(page, 3000).then(() => true).catch(() => false)) {
          return;
        }
        throw err;
      }
      // Prefer explicit success signal, but do not hard-block on pages that do not redirect.
      if (await waitForAuthSuccess(page, 12000).then(() => true).catch(() => false)) {
        return;
      }
      const cur = page.url();
      if (/\/page\/scope-authorization/i.test(cur)) {
        if (!(await hasAuthorizeAction(page))) {
          console.error('[browser] authorize action disappeared; continue to device-code polling');
          return;
        }
      }
      await page.waitForTimeout(1000);
    }
    await waitForAuthSuccess(page, args.timeoutMs);
  } catch (err) {
    // #region debug-point E:error
    debugEvent('E', 'auth-login-domain-all.js:catch', 'browser auth error', {
      url: page.url(),
      error: String(err && err.message ? err.message : err),
    });
    // #endregion
    fs.mkdirSync(artifactDir, { recursive: true });
    await page.screenshot({ path: failureShot, fullPage: true }).catch(() => undefined);
    const frames = page.frames().map((f) => f.url()).join('\n');
    const texts = (await collectClickableTexts(page)).join(' | ');
    const dom = await collectDOMSnapshot(page);
    throw new Error(`${String(err && err.message ? err.message : err)}\nurl=${page.url()}\nframes:\n${frames}\ndom=${JSON.stringify(dom)}\nclickables=${texts}\nconsole=${consoleLogs.join(' || ')}\npageerrors=${pageErrors.join(' || ')}\nrequestfailed=${requestFails.join(' || ')}\nscreenshot=${failureShot}`);
  } finally {
    await context.close();
  }
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const envFile = path.join(process.cwd(), '.env.session');
  loadDotEnvFile(envFile);
  hydrateArgsFromEnv(args);
  // #region debug-point A:entry
  debugEvent('A', 'auth-login-domain-all.js:entry', 'script entry', {
    headless: args.headless,
    userDataDir: args.userDataDir,
    hasSessionArg: Boolean(args.session),
    envHeadless: process.env.PLAYWRIGHT_HEADLESS || '',
  });
  // #endregion

  if (!args.session) {
    const fetchedSession = await maybeFetchSessionFromAPI();
    if (fetchedSession) {
      args.session = fetchedSession;
      console.error('[bootstrap] fetched session from session API env config');
      // #region debug-point B:fetched-session
      debugEvent('B', 'auth-login-domain-all.js:session', 'session fetched from api', {
        sessionLength: fetchedSession.length,
        sessionPrefix: fetchedSession.slice(0, 8),
      });
      // #endregion
    }
  }

  const repoRoot = findRepoRoot(process.cwd());
  const cliPath = resolveCliPath(args.cliPath, repoRoot);

  console.error(`[1/4] request device code: auth login --domain ${args.domain} --recommend --no-wait --json`);
  const noWait = runCLI(cliPath, ['auth', 'login', '--domain', args.domain, '--recommend', '--no-wait', '--json']);
  const { verificationURL, deviceCode } = extractAuthPayload(noWait.stdout);

  console.error('[2/4] run browser authorization with injected login state');
  await runBrowserAuth(args, verificationURL);

  console.error('[3/4] complete login by device code');
  runCLI(cliPath, ['auth', 'login', '--device-code', deviceCode]);

  console.error('[4/4] verify status');
  const status = runCLI(cliPath, ['auth', 'status', '--verify']);
  process.stdout.write(status.stdout);
})().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
