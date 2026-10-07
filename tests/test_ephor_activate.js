const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('ephor-activate (SessionStart hook)', () => {
  let tmpDir;
  const hookPath = path.join(__dirname, '..', 'src', 'hooks', 'ephor-activate.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ephor-hook-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runHook(env = {}) {
    const result = execFileSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: tmpDir,
        XDG_CONFIG_HOME: path.join(tmpDir, 'xdg-config'),
        ...env,
      },
      timeout: 5000,
    });
    return result;
  }

  it('emits OK when tier is "off"', () => {
    const output = runHook({ EPHOR_DEFAULT_TIER: 'off' });
    assert.equal(output, 'OK');
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-state')), false);
  });

  it('writes flag file and emits tier rules for default tier', () => {
    const output = runHook();
    assert.ok(output.includes('STOIC EPHOR ACTIVE'));
    assert.ok(output.includes('ephor'));
    const flag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(flag, 'ephor');
  });

  it('loads correct tier content for spartan', () => {
    const output = runHook({ EPHOR_DEFAULT_TIER: 'spartan' });
    assert.ok(output.includes('STOIC EPHOR ACTIVE'));
    assert.ok(output.includes('spartan'));
    assert.ok(output.includes('Single-clause sentences'));
  });

  it('includes philosophical foundation in output', () => {
    const output = runHook({ EPHOR_DEFAULT_TIER: 'counsel' });
    assert.ok(output.includes('Dichotomy of Control'));
  });
});
