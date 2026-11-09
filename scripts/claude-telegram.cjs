#!/usr/bin/env node
// Starts Claude Code with this machine's own Telegram bot on the channel.
//
// Each machine keeps its bot token in the repo-root .telegram.env (gitignored, so
// never shared). One bot token can only be polled by one machine at a time, which
// is why every system needs its own bot from @BotFather.
//
//   TELEGRAM_BOT_TOKEN=123456789:AAH...
//   TELEGRAM_STATE_DIR=/optional/override
//
// Usage: npm run telegram [-- <claude args>]
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.telegram.env');
const SETTINGS_FILE = 'scripts/telegram-settings.json'; // relative: the repo path may contain spaces
const CHANNEL = 'plugin:telegram@claude-plugins-official';
const TOKEN_KEY = 'TELEGRAM_BOT_TOKEN';
const STATE_DIR_KEY = 'TELEGRAM_STATE_DIR';
const TOKEN_FORMAT = /^\d+:[\w-]{30,}$/;
const DEFAULT_STATE_DIR = path.join(os.homedir(), '.claude', 'channels', 'telegram-tv-time-selfhosted');

function fail(message) {
  console.error(`claude-telegram: ${message}`);
  process.exit(1);
}

function readEnv(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match) values[match[1]] = match[2].trim();
  }
  return values;
}

if (!fs.existsSync(ENV_FILE)) {
  fail(`${ENV_FILE} not found. Create it with ${TOKEN_KEY}=<this machine's token from @BotFather>.`);
}
const env = readEnv(ENV_FILE);
const token = env[TOKEN_KEY];
if (!token || !TOKEN_FORMAT.test(token)) {
  fail(`${TOKEN_KEY} in ${ENV_FILE} is missing or malformed. Expected 123456789:AAH...`);
}

// The channel server reads its token from the state dir. Only the state dir path goes
// into Claude's environment, so the token never reaches the session's shell commands.
const stateDir = env[STATE_DIR_KEY] || DEFAULT_STATE_DIR;
fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const stateEnvFile = path.join(stateDir, '.env');
const otherLines = fs.existsSync(stateEnvFile)
  ? fs.readFileSync(stateEnvFile, 'utf8').split(/\r?\n/).filter(line => line && !line.startsWith(`${TOKEN_KEY}=`))
  : [];
fs.writeFileSync(stateEnvFile, [`${TOKEN_KEY}=${token}`, ...otherLines, ''].join('\n'), { mode: 0o600 });

const result = spawnSync('claude', ['--settings', SETTINGS_FILE, '--channels', CHANNEL, ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, [STATE_DIR_KEY]: stateDir },
  shell: process.platform === 'win32', // finds claude.exe and npm's claude.cmd alike
});
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);
