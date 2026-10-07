const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('e2e smoke test', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ephor-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const env = () => ({
    ...process.env,
    CLAUDE_CONFIG_DIR: tmpDir,
    XDG_CONFIG_HOME: path.join(tmpDir, 'xdg-config'),
  });

  it('full activation flow: activate → track → reinforce → deactivate', () => {
    const activatePath = path.join(__dirname, '..', 'src', 'hooks', 'ephor-activate.js');
    const trackerPath = path.join(__dirname, '..', 'src', 'hooks', 'ephor-mode-tracker.js');

    // 1. SessionStart activates with default tier
    const activateOut = execFileSync(process.execPath, [activatePath], {
      encoding: 'utf8', env: env(), timeout: 5000,
    });
    assert.ok(activateOut.includes('STOIC EPHOR ACTIVE'));
    assert.ok(activateOut.includes('ephor'));

    // 2. Flag file exists
    const flag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(flag, 'ephor');

    // 3. User sends a normal prompt → per-turn reinforcement
    const trackOut = execFileSync(process.execPath, [trackerPath], {
      encoding: 'utf8',
      input: JSON.stringify({ prompt: 'explain this code' }),
      env: env(),
      timeout: 5000,
    });
    const parsed = JSON.parse(trackOut);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('STOIC EPHOR ACTIVE'));

    // 4. User switches to spartan
    execFileSync(process.execPath, [trackerPath], {
      encoding: 'utf8',
      input: JSON.stringify({ prompt: '/ephor spartan' }),
      env: env(),
      timeout: 5000,
    });
    const newFlag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(newFlag, 'spartan');

    // 5. User deactivates
    execFileSync(process.execPath, [trackerPath], {
      encoding: 'utf8',
      input: JSON.stringify({ prompt: '/ephor off' }),
      env: env(),
      timeout: 5000,
    });
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-state')), false);

    // 6. No reinforcement after deactivation
    const silentOut = execFileSync(process.execPath, [trackerPath], {
      encoding: 'utf8',
      input: JSON.stringify({ prompt: 'another question' }),
      env: env(),
      timeout: 5000,
    });
    assert.equal(silentOut.trim(), '');
  });

  it('tier persists across simulated session restart', () => {
    const activatePath = path.join(__dirname, '..', 'src', 'hooks', 'ephor-activate.js');
    const trackerPath = path.join(__dirname, '..', 'src', 'hooks', 'ephor-mode-tracker.js');

    // 1. Activate default (ephor)
    execFileSync(process.execPath, [activatePath], {
      encoding: 'utf8', env: env(), timeout: 5000,
    });

    // 2. Switch to counsel mid-session
    execFileSync(process.execPath, [trackerPath], {
      encoding: 'utf8',
      input: JSON.stringify({ prompt: '/ephor counsel' }),
      env: env(),
      timeout: 5000,
    });

    // 3. Simulate session end — delete session flag
    try { fs.unlinkSync(path.join(tmpDir, '.ephor-state')); } catch (e) {}

    // 4. Simulate new session — activate reads persisted config
    const restartOut = execFileSync(process.execPath, [activatePath], {
      encoding: 'utf8', env: env(), timeout: 5000,
    });
    assert.ok(restartOut.includes('STOIC EPHOR ACTIVE'));
    assert.ok(restartOut.includes('counsel'));
    const flag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(flag, 'counsel');
  });
});
