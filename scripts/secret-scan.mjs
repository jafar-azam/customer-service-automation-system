#!/usr/bin/env node
/**
 * Secret scanner — runs in the pre-commit hook, in CI, and over the entire git
 * history before release (step 37).
 *
 * Why hand-written instead of installing gitleaks: the pre-commit hook has to
 * work on a fresh clone on Windows, macOS and Linux with nothing but `npm ci`.
 * A hook that depends on a separately installed Go binary is a hook that gets
 * skipped, and a skipped hook is worse than no hook because it is believed.
 * CI additionally runs gitleaks as a second opinion.
 *
 * An audited escape hatch exists: a line containing `secret-scan:allow` is
 * skipped. It is used by this scanner's own tests, and every other use has to
 * be justified in review.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MAX_FILE_BYTES = 1_024 * 1_024;
const ALLOW_MARKER = 'secret-scan:allow';

/** Paths that cannot contain our secrets and would only produce noise. */
const SKIP_PATHS = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)coverage\//,
  /(^|\/)\.git\//,
  /^data\//,
  /^reference\//,
  /^docs\/research\//,
  /^package-lock\.json$/,
  /^LICENSE$/,
  /\.(png|jpe?g|webp|avif|gif|pdf|woff2?|wav|mp3|gguf|safetensors|onnx|bz2|gz|zip|tar)$/i,
];

/**
 * Values that look like secrets but are deliberately committed placeholders.
 * Matched case-insensitively against the captured value.
 */
const PLACEHOLDER = [
  'change-me',
  'changeme',
  'placeholder',
  'example',
  'replace-me',
  'replaceme',
  'your-',
  'your_',
  'dummy',
  'redacted',
  'insert-',
  'openssl',
  'generate',
  'xxxx',
  'secret-here',
  'notasecret',
  '0000000000',
  '1234567890',
];

/**
 * Each rule is deliberately narrow: a provider-specific shape produces almost
 * no false positives, which is what keeps the hook from being disabled.
 * `value` is the capture group holding the sensitive part, for redaction.
 */
export const RULES = [
  { id: 'private-key', value: 0, re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY(?: BLOCK)?-----/g },
  { id: 'aws-access-key-id', value: 0, re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'github-token', value: 0, re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
  { id: 'google-api-key', value: 0, re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'slack-token', value: 0, re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { id: 'openai-key', value: 0, re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: 'anthropic-key', value: 0, re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'twilio-account-sid', value: 0, re: /\bAC[0-9a-f]{32}\b/g },
  { id: 'twilio-api-key', value: 0, re: /\bSK[0-9a-f]{32}\b/g },
  { id: 'meta-access-token', value: 0, re: /\bEAA[A-Za-z0-9]{40,}\b/g },
  { id: 'jwt', value: 0, re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  {
    id: 'connection-string-credentials',
    value: 1,
    re: /\b(?:mongodb(?:\+srv)?|redis|rediss|amqps?|postgres(?:ql)?|mysql|https?):\/\/[^\s:/@]+:([^\s:/@]{3,})@/g,
  },
  {
    /* Broad rules, gated on a secret-ish *identifier* plus the placeholder and
       entropy checks below. The name part allows an arbitrary prefix so that
       ACCESS_TOKEN_SECRET and PHONE_ENCRYPTION_KEY match — `\bsecret\b` does
       not, because `_` is a word character. A bare `key:` is deliberately not
       matched (too common in object literals); `_key` / `-key` is. */
    id: 'assigned-secret',
    value: 3,
    re: /([A-Za-z0-9_.-]*(?:api[_-]?key|[_-]key|secret|token|password|passwd|pwd|pepper|credential))\s*[:=]\s*(['"`])([^'"`\n]{12,})\2/gi,
    broad: true,
  },
  {
    /* The same, for unquoted `NAME=value` lines as found in .env files. */
    id: 'assigned-secret-env',
    value: 2,
    re: /^\s*(?:export\s+)?([A-Za-z0-9_.-]*(?:api[_-]?key|[_-]key|secret|token|password|passwd|pwd|pepper|credential))\s*=\s*([^\s'"`#]{12,})\s*$/gi,
    broad: true,
  },
];

/** Shannon entropy in bits per character. */
export function entropy(value) {
  const counts = new Map();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

export function isPlaceholder(value) {
  const v = value.toLowerCase();
  if (PLACEHOLDER.some((p) => v.includes(p))) return true;
  /* A value made of one repeated character, or wrapped in <angle brackets>,
     is a template, not a credential. */
  if (/^<.*>$/.test(value)) return true;
  if (new Set(value).size <= 2) return true;
  /* `mongodb://user:${MONGODB_APP_PASSWORD}@host` and `Demo-${hex(8)}` are
     references to a secret, not the secret. Strip every ${...} / $VAR / %VAR%
     and judge what is left: if there is almost nothing, there was no literal. */
  const withoutInterpolation = value
    .replace(/\$\{[^}]*\}/g, '')
    .replace(/\$[A-Za-z_]\w*/g, '')
    .replace(/%[A-Za-z_]\w*%/g, '');
  if (withoutInterpolation.length < 8) return true;
  return false;
}

export function redact(value) {
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 8, 24))}${value.slice(-4)}`;
}

/**
 * @returns {{rule: string, line: number, preview: string}[]}
 */
export function scanText(text) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes(ALLOW_MARKER)) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line)) !== null) {
        const value = m[rule.value] ?? m[0];
        /* Rules that capture an inner value (a password inside a connection
           string, the right-hand side of an assignment) must tolerate the
           placeholders we deliberately commit in .env.example. Rules that match
           a whole provider-issued credential shape never do: there is no
           legitimate reason for one of those to appear at all. */
        if (rule.value > 0 && isPlaceholder(value)) continue;
        if (rule.broad) {
          /* Below this, a value is a word or a path, not a credential.
             Tuned so `password = "Tr0ub4dor&3xyz"` still trips the rule. */ // secret-scan:allow
          if (entropy(value) < 2.6 && value.length < 24) continue;
        }
        findings.push({ rule: rule.id, line: index + 1, preview: redact(value) });
      }
    }
  });
  return findings;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1_024 * 1_024 });
}

function shouldSkip(path) {
  return SKIP_PATHS.some((re) => re.test(path));
}

function isProbablyBinary(buffer) {
  return buffer.includes(0);
}

function filesFromGit(mode) {
  const out =
    mode === 'staged'
      ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
      : git(['ls-files']);
  return out
    .split('\n')
    .filter(Boolean)
    .filter((p) => !shouldSkip(p));
}

function scanWorkingTree(mode) {
  const findings = [];
  for (const path of filesFromGit(mode)) {
    let buf;
    try {
      if (statSync(path).size > MAX_FILE_BYTES) continue;
      buf = readFileSync(path);
    } catch {
      continue; // deleted between listing and reading
    }
    if (isProbablyBinary(buf)) continue;
    for (const f of scanText(buf.toString('utf8'))) {
      findings.push({ ...f, where: `${path}:${String(f.line)}` });
    }
  }
  return findings;
}

/** Every blob ever committed, for the pre-publication audit in step 37. */
function scanHistory() {
  const findings = [];
  const objects = git(['rev-list', '--objects', '--all'])
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const space = l.indexOf(' ');
      return space === -1 ? null : { sha: l.slice(0, space), path: l.slice(space + 1) };
    })
    .filter((o) => o !== null && o.path !== '' && !shouldSkip(o.path));

  const seen = new Set();
  for (const { sha, path } of objects) {
    if (seen.has(sha)) continue;
    seen.add(sha);
    let content;
    try {
      /* `rev-list --objects` lists trees as well as blobs, and `cat-file blob`
         fails on a tree. Git's complaint goes to stderr, so stderr is dropped
         rather than letting a clean scan print a screenful of "bad file". */
      content = execFileSync('git', ['cat-file', 'blob', sha], {
        maxBuffer: MAX_FILE_BYTES * 4,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      continue; // not a blob, or unreadable
    }
    if (content.length > MAX_FILE_BYTES || isProbablyBinary(content)) continue;
    for (const f of scanText(content.toString('utf8'))) {
      findings.push({ ...f, where: `${path}@${sha.slice(0, 8)}:${String(f.line)}` });
    }
  }
  return { findings, blobs: seen.size };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const mode = args.has('--staged') ? 'staged' : args.has('--history') ? 'history' : 'tracked';

  const { findings, blobs } =
    mode === 'history' ? scanHistory() : { findings: scanWorkingTree(mode), blobs: undefined };

  if (findings.length === 0) {
    const scope =
      mode === 'history' ? `${String(blobs ?? 0)} blobs in full git history` : `${mode} files`;
    console.log(`secret-scan: clean (${scope})`);
    return;
  }

  console.error(`secret-scan: ${String(findings.length)} potential secret(s) found\n`);
  for (const f of findings) {
    console.error(`  ${f.where}  [${f.rule}]  ${f.preview}`);
  }
  console.error(
    [
      '',
      'Nothing is printed in full, but these values must not be committed.',
      'If a match is a deliberate placeholder, make it look like one (change-me-...)',
      `or add the marker ${ALLOW_MARKER} on that line and justify it in review.`,
    ].join('\n'),
  );
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
