#!/usr/bin/env node
// Release version policy: staging's app version is always one patch above main's.
//   main:    node scripts/release-version.cjs main --before <sha> [--flag minor|major]
//   staging: node scripts/release-version.cjs staging --main <version> [--dir <path>]
// Version strings only; build numbers (versionCode / buildNumber) climb separately per branch.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const parse = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v).trim());
  if (!m) throw new Error(`Bad version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const fmt = (p) => p.join('.');
const compare = (a, b) => {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
};
const bump = (v, kind) => {
  const [maj, min, pat] = parse(v);
  if (kind === 'major') return fmt([maj + 1, 0, 0]);
  if (kind === 'minor') return fmt([maj, min + 1, 0]);
  return fmt([maj, min, pat + 1]);
};

// flag major/minor -> bump prev; head above prev -> inherit head (staging's number came in
// with the merge); otherwise a hotfix straight on main -> patch-bump prev
function decideMainVersion({ prev, head, flag }) {
  if (flag === 'major' || flag === 'minor') return bump(prev, flag);
  if (compare(head, prev) > 0) return fmt(parse(head));
  return bump(prev, 'patch');
}

// main + 1 patch, never lower than staging's current version
function nextStagingVersion({ main, staging }) {
  const next = bump(main, 'patch');
  return staging && compare(staging, next) > 0 ? fmt(parse(staging)) : next;
}

// ── file helpers (targeted edits keep formatting; app.json uses tabs) ──
const readJson = (text) => JSON.parse(text);
const replaceNth = (text, re, replacement, count) => {
  let n = 0;
  return text.replace(re, (m, ...g) => (++n <= count ? replacement(m, ...g) : m));
};
function setVersions(dir, version) {
  const appPath = path.join(dir, 'app/app.json');
  const pkgPath = path.join(dir, 'app/package.json');
  const lockPath = path.join(dir, 'app/package-lock.json');
  const setV = (file, count) => {
    const before = fs.readFileSync(file, 'utf8');
    const after = replaceNth(before, /("version": ")[^"]*(")/g, (_m, a, b) => a + version + b, count);
    if (after === before && !before.includes(`"version": "${version}"`)) throw new Error(`No version in ${file}`);
    fs.writeFileSync(file, after);
  };
  setV(appPath, 1);
  setV(pkgPath, 1);
  setV(lockPath, 2); // root "version" and packages[""].version
}
function setBuild(dir, code) {
  const appPath = path.join(dir, 'app/app.json');
  let t = fs.readFileSync(appPath, 'utf8');
  t = t.replace(/("versionCode": )\d+/, `$1${code}`).replace(/("buildNumber": ")\d+(")/, `$1${code}$2`);
  fs.writeFileSync(appPath, t);
}
const readApp = (text) => {
  const e = readJson(text).expo;
  return { version: e.version, code: Number(e.android.versionCode), ios: Number(e.ios.buildNumber) };
};

function cli(argv) {
  const [cmd, ...rest] = argv;
  const opt = {};
  for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
  const root = process.cwd();
  if (cmd === 'main') {
    const head = readApp(fs.readFileSync(path.join(root, 'app/app.json'), 'utf8'));
    let prev = head;
    if (opt.before && !/^0+$/.test(opt.before)) {
      prev = readApp(execFileSync('git', ['show', `${opt.before}:app/app.json`], { encoding: 'utf8' }));
    }
    const version = decideMainVersion({ prev: prev.version, head: head.version, flag: opt.flag || '' });
    setVersions(root, version);
    setBuild(root, Math.max(prev.code, prev.ios) + 1);
    console.log(version);
  } else if (cmd === 'staging') {
    if (!opt.main) throw new Error('--main <version> required');
    const dir = path.resolve(opt.dir || root);
    const cur = readApp(fs.readFileSync(path.join(dir, 'app/app.json'), 'utf8'));
    const version = nextStagingVersion({ main: opt.main, staging: cur.version });
    setVersions(dir, version);
    console.log(version);
  } else {
    throw new Error('usage: release-version.cjs main --before <sha> [--flag minor|major] | staging --main <v> [--dir <path>]');
  }
}

if (require.main === module) {
  try {
    cli(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
module.exports = { decideMainVersion, nextStagingVersion, bump, compare };
