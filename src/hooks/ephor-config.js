'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const VALID_TIERS = ['off', 'counsel', 'ephor', 'spartan', 'leonidas'];
const MAX_FLAG_BYTES = 64;

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'stoic-ephor');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'stoic-ephor'
    );
  }
  return path.join(os.homedir(), '.config', 'stoic-ephor');
}

function findRepoConfigPath(start) {
  try {
    let dir = path.resolve(start || process.cwd());
    const candidates = ['.ephor/config.json', '.ephor.json'];
    for (let i = 0; i < 64; i++) {
      for (const rel of candidates) {
        const p = path.join(dir, rel);
        try {
          const st = fs.lstatSync(p);
          if (st.isSymbolicLink() || !st.isFile()) continue;
          return p;
        } catch (e) { /* not present */ }
      }
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch (e) { /* defensive */ }
  return null;
}

function readTierFromConfigFile(configPath) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(raw);
    if (config && config.defaultTier &&
        VALID_TIERS.includes(String(config.defaultTier).toLowerCase())) {
      return String(config.defaultTier).toLowerCase();
    }
  } catch (e) { /* missing / invalid */ }
  return null;
}

function getDefaultTier() {
  const envTier = process.env.EPHOR_DEFAULT_TIER;
  if (envTier && VALID_TIERS.includes(envTier.toLowerCase())) {
    return envTier.toLowerCase();
  }

  const repoConfigPath = findRepoConfigPath(process.cwd());
  if (repoConfigPath) {
    const repoTier = readTierFromConfigFile(repoConfigPath);
    if (repoTier) return repoTier;
  }

  const userTier = readTierFromConfigFile(
    path.join(getConfigDir(), 'config.json')
  );
  if (userTier) return userTier;

  return 'ephor';
}

function safeWriteFlag(flagPath, content) {
  try {
    const flagDir = path.dirname(flagPath);
    fs.mkdirSync(flagDir, { recursive: true });

    let realFlagDir;
    try {
      const lstat = fs.lstatSync(flagDir);
      if (lstat.isSymbolicLink()) {
        realFlagDir = fs.realpathSync(flagDir);
        const realStat = fs.statSync(realFlagDir);
        if (!realStat.isDirectory()) return;
        if (typeof process.getuid === 'function') {
          if (realStat.uid !== process.getuid()) return;
        }
      } else {
        realFlagDir = flagDir;
      }
    } catch (e) { return; }

    const realFlagPath = path.join(realFlagDir, path.basename(flagPath));
    try {
      if (fs.lstatSync(realFlagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }

    const tempPath = path.join(
      realFlagDir,
      `.ephor-state.${process.pid}.${Date.now()}`
    );
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number'
      ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT
      | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(content));
      try { fs.fchmodSync(fd, 0o600); } catch (e) { /* best-effort */ }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, realFlagPath);
  } catch (e) { /* silent fail */ }
}

function readFlag(flagPath) {
  try {
    let st;
    try { st = fs.lstatSync(flagPath); } catch (e) { return null; }
    if (st.isSymbolicLink() || !st.isFile()) return null;
    if (st.size > MAX_FLAG_BYTES) return null;

    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number'
      ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_RDONLY | O_NOFOLLOW;
    let fd;
    let out;
    try {
      fd = fs.openSync(flagPath, flags);
      const buf = Buffer.alloc(MAX_FLAG_BYTES);
      const n = fs.readSync(fd, buf, 0, MAX_FLAG_BYTES, 0);
      out = buf.slice(0, n).toString('utf8');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }

    const raw = out.trim().toLowerCase();
    if (!VALID_TIERS.includes(raw)) return null;
    return raw;
  } catch (e) { return null; }
}

function saveDefaultTier(tier) {
  const normalized = String(tier).toLowerCase();
  if (!VALID_TIERS.includes(normalized)) return;
  try {
    const configDir = getConfigDir();
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, 'config.json');
    let config = {};
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) { /* missing or invalid — start fresh */ }
    config.defaultTier = normalized;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', {
      mode: 0o600,
    });
  } catch (e) { /* silent fail — non-critical */ }
}

module.exports = {
  VALID_TIERS,
  getDefaultTier,
  getConfigDir,
  findRepoConfigPath,
  saveDefaultTier,
  safeWriteFlag,
  readFlag,
};
