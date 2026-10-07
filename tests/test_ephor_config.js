const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let configModule;

describe('ephor-config', () => {
  const originalEnv = { ...process.env };
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ephor-test-'));
    delete require.cache[require.resolve('../src/hooks/ephor-config.js')];
    delete process.env.EPHOR_DEFAULT_TIER;
    process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'xdg-config');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns "ephor" as default when no config exists', () => {
    configModule = require('../src/hooks/ephor-config.js');
    const result = configModule.getDefaultTier();
    assert.equal(result, 'ephor');
  });

  it('respects EPHOR_DEFAULT_TIER environment variable', () => {
    process.env.EPHOR_DEFAULT_TIER = 'spartan';
    configModule = require('../src/hooks/ephor-config.js');
    const result = configModule.getDefaultTier();
    assert.equal(result, 'spartan');
  });

  it('rejects invalid tier from env', () => {
    process.env.EPHOR_DEFAULT_TIER = 'invalid_tier';
    configModule = require('../src/hooks/ephor-config.js');
    const result = configModule.getDefaultTier();
    assert.equal(result, 'ephor');
  });

  it('VALID_TIERS contains all expected tiers', () => {
    configModule = require('../src/hooks/ephor-config.js');
    assert.deepEqual(
      configModule.VALID_TIERS.sort(),
      ['counsel', 'ephor', 'leonidas', 'off', 'spartan'].sort()
    );
  });

  it('safeWriteFlag writes content and readFlag reads it back', () => {
    configModule = require('../src/hooks/ephor-config.js');
    const flagPath = path.join(tmpDir, '.ephor-state');
    configModule.safeWriteFlag(flagPath, 'spartan');
    const result = configModule.readFlag(flagPath);
    assert.equal(result, 'spartan');
  });

  it('readFlag returns null for symlinks', () => {
    configModule = require('../src/hooks/ephor-config.js');
    const realFile = path.join(tmpDir, 'real');
    fs.writeFileSync(realFile, 'ephor');
    const linkPath = path.join(tmpDir, 'link');
    fs.symlinkSync(realFile, linkPath);
    const result = configModule.readFlag(linkPath);
    assert.equal(result, null);
  });

  it('readFlag returns null for invalid tier content', () => {
    configModule = require('../src/hooks/ephor-config.js');
    const flagPath = path.join(tmpDir, '.ephor-state');
    fs.writeFileSync(flagPath, 'not_a_valid_tier');
    const result = configModule.readFlag(flagPath);
    assert.equal(result, null);
  });

  it('readFlag returns null for oversized files', () => {
    configModule = require('../src/hooks/ephor-config.js');
    const flagPath = path.join(tmpDir, '.ephor-state');
    fs.writeFileSync(flagPath, 'a'.repeat(200));
    const result = configModule.readFlag(flagPath);
    assert.equal(result, null);
  });

  it('saveDefaultTier writes tier to user config file', () => {
    process.env.XDG_CONFIG_HOME = tmpDir;
    configModule = require('../src/hooks/ephor-config.js');
    configModule.saveDefaultTier('counsel');
    const configPath = path.join(tmpDir, 'stoic-ephor', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.defaultTier, 'counsel');
  });

  it('saveDefaultTier overwrites existing config tier', () => {
    process.env.XDG_CONFIG_HOME = tmpDir;
    const configDir = path.join(tmpDir, 'stoic-ephor');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ defaultTier: 'ephor' })
    );
    configModule = require('../src/hooks/ephor-config.js');
    configModule.saveDefaultTier('spartan');
    const config = JSON.parse(
      fs.readFileSync(path.join(configDir, 'config.json'), 'utf8')
    );
    assert.equal(config.defaultTier, 'spartan');
  });

  it('saveDefaultTier rejects invalid tier', () => {
    process.env.XDG_CONFIG_HOME = tmpDir;
    configModule = require('../src/hooks/ephor-config.js');
    configModule.saveDefaultTier('invalid');
    const configPath = path.join(tmpDir, 'stoic-ephor', 'config.json');
    assert.equal(fs.existsSync(configPath), false);
  });

  it('getDefaultTier reads tier saved by saveDefaultTier', () => {
    process.env.XDG_CONFIG_HOME = tmpDir;
    configModule = require('../src/hooks/ephor-config.js');
    configModule.saveDefaultTier('counsel');
    const result = configModule.getDefaultTier();
    assert.equal(result, 'counsel');
  });
});
