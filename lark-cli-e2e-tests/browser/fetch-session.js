#!/usr/bin/env node

const fs = require('node:fs');

function parseArgs(argv) {
  const args = {
    url: process.env.LARK_SESSION_URL || 'https://lark-bbq.bytedance.net/testing/open_api/v1/lark-sessions',
    accessToken: process.env.LARK_SESSION_ACCESS_TOKEN || '',
    unit: process.env.LARK_SESSION_UNIT || 'cn',
    env: process.env.LARK_SESSION_ENV || 'online',
    mobile: process.env.LARK_SESSION_MOBILE || '',
    password: process.env.LARK_SESSION_PASSWORD || '',
    code: process.env.LARK_SESSION_CODE || '',
    tenantId: process.env.LARK_SESSION_TENANT_ID || '',
    useCache: parseBool(process.env.LARK_SESSION_USE_CACHE, true),
    appId: process.env.LARK_SESSION_APP_ID || '',
    userId: process.env.LARK_SESSION_USER_ID || '',
    output: process.env.LARK_SESSION_OUTPUT || '',
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url') { args.url = String(argv[++i] || args.url); continue; }
    if (arg === '--access-token') { args.accessToken = String(argv[++i] || ''); continue; }
    if (arg === '--unit') { args.unit = String(argv[++i] || args.unit); continue; }
    if (arg === '--env') { args.env = String(argv[++i] || args.env); continue; }
    if (arg === '--mobile') { args.mobile = String(argv[++i] || ''); continue; }
    if (arg === '--password') { args.password = String(argv[++i] || ''); continue; }
    if (arg === '--code') { args.code = String(argv[++i] || ''); continue; }
    if (arg === '--tenant-id') { args.tenantId = String(argv[++i] || ''); continue; }
    if (arg === '--use-cache') { args.useCache = parseBool(argv[++i], true); continue; }
    if (arg === '--app-id') { args.appId = String(argv[++i] || ''); continue; }
    if (arg === '--user-id') { args.userId = String(argv[++i] || ''); continue; }
    if (arg === '--output') { args.output = String(argv[++i] || ''); continue; }
    if (arg === '--json') { args.json = true; continue; }
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
  }

  return args;
}

function parseBool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const t = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(t)) return true;
  if (['0', 'false', 'no', 'n'].includes(t)) return false;
  return fallback;
}

function printHelp() {
  console.log(`Usage:
  node fetch-session.js [options]

Required:
  --access-token <token>  (or LARK_SESSION_ACCESS_TOKEN)
  --mobile <mobile>       (or LARK_SESSION_MOBILE)
  --password <password>   (or LARK_SESSION_PASSWORD)
  --code <code>           (or LARK_SESSION_CODE)
  --tenant-id <id>        (or LARK_SESSION_TENANT_ID)
  --app-id <id>           (or LARK_SESSION_APP_ID)
  --user-id <id>          (or LARK_SESSION_USER_ID)

Optional:
  --url <url>             default: https://lark-bbq.bytedance.net/testing/open_api/v1/lark-sessions
  --unit <unit>           default: cn
  --env <env>             default: online
  --use-cache <bool>      default: true
  --output <path>         write extracted session to file (chmod 600)
  --json                  print full response JSON to stderr

Env aliases:
  LARK_SESSION_URL, LARK_SESSION_ACCESS_TOKEN, LARK_SESSION_UNIT, LARK_SESSION_ENV
  LARK_SESSION_MOBILE, LARK_SESSION_PASSWORD, LARK_SESSION_CODE
  LARK_SESSION_TENANT_ID, LARK_SESSION_USE_CACHE, LARK_SESSION_APP_ID, LARK_SESSION_USER_ID
  LARK_SESSION_OUTPUT
`);
}

function required(args) {
  const missing = [];
  if (!args.accessToken) missing.push('access-token');
  if (!args.mobile) missing.push('mobile');
  if (!args.password) missing.push('password');
  if (!args.code) missing.push('code');
  if (!args.tenantId) missing.push('tenant-id');
  if (!args.appId) missing.push('app-id');
  if (!args.userId) missing.push('user-id');
  return missing;
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

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const missing = required(args);
  if (missing.length > 0) {
    console.error(`missing required args: ${missing.join(', ')}`);
    process.exit(2);
  }

  const payload = {
    unit: args.unit,
    env: args.env,
    mobile: args.mobile,
    password: args.password,
    code: args.code,
    tenant_id: args.tenantId,
    use_cache: args.useCache,
    app_id: Number(args.appId),
    user_id: args.userId,
  };

  const resp = await fetch(args.url, {
    method: 'POST',
    headers: {
      'X-Access-Token': args.accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await resp.text();
  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    body = { raw: bodyText };
  }

  if (!resp.ok) {
    console.error(`request failed: HTTP ${resp.status}`);
    console.error(typeof body === 'object' ? JSON.stringify(body) : String(body));
    process.exit(1);
  }

  const session = findSession(body);
  if (!session) {
    console.error('session not found in response');
    if (args.json) console.error(JSON.stringify(body));
    process.exit(1);
  }

  if (args.output) {
    fs.writeFileSync(args.output, session + '\n', { mode: 0o600 });
    console.error(`session written: ${args.output}`);
  }

  if (args.json) {
    console.error(JSON.stringify(body));
  }

  process.stdout.write(session + '\n');
})().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
