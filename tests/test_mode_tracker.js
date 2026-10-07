const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('ephor-mode-tracker (UserPromptSubmit hook)', () => {
  let tmpDir;
  const hookPath = path.join(__dirname, '..', 'src', 'hooks', 'ephor-mode-tracker.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ephor-tracker-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runHook(prompt, env = {}) {
    const input = JSON.stringify({ prompt });
    const result = execFileSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input,
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

  it('writes flag on /ephor command', () => {
    runHook('/ephor');
    const flag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(flag, 'ephor');
  });

  it('bare /ephor resets to ephor even when different tier is persisted', () => {
    const xdgDir = path.join(tmpDir, 'xdg-config');
    // Persist counsel first
    runHook('/ephor counsel', { XDG_CONFIG_HOME: xdgDir });
    const configPath = path.join(xdgDir, 'stoic-ephor', 'config.json');
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.defaultTier, 'counsel');

    // Bare /ephor should reset to ephor and persist it
    runHook('/ephor', { XDG_CONFIG_HOME: xdgDir });
    const flag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(flag, 'ephor');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.defaultTier, 'ephor');
  });

  it('switches tier on /ephor spartan', () => {
    runHook('/ephor spartan');
    const flag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(flag, 'spartan');
  });

  it('writes flag on fully-qualified /stoic-ephor:ephor (no args)', () => {
    runHook('/stoic-ephor:ephor');
    const flag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(flag, 'ephor');
  });

  it('switches tier on fully-qualified /stoic-ephor:ephor counsel', () => {
    runHook('/stoic-ephor:ephor counsel');
    const flag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(flag, 'counsel');
  });

  it('handles /stoic-ephor:ephor off', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook('/stoic-ephor:ephor off');
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-state')), false);
  });

  it('emits switching context on bare /stoic-ephor:ephor', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'counsel');
    const output = runHook('/stoic-ephor:ephor');
    const parsed = JSON.parse(output);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('SWITCHING TO TIER: EPHOR'));
  });

  it('bare /stoic-ephor:ephor resets to ephor from counsel', () => {
    const xdgDir = path.join(tmpDir, 'xdg-config');
    runHook('/stoic-ephor:ephor counsel', { XDG_CONFIG_HOME: xdgDir });
    const configPath = path.join(xdgDir, 'stoic-ephor', 'config.json');
    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.defaultTier, 'counsel');

    runHook('/stoic-ephor:ephor', { XDG_CONFIG_HOME: xdgDir });
    const flag = fs.readFileSync(path.join(tmpDir, '.ephor-state'), 'utf8');
    assert.equal(flag, 'ephor');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.defaultTier, 'ephor');
  });

  it('does not match /ephoral as an ephor command', () => {
    runHook('/ephoral');
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-state')), false);
  });

  it('removes flag on /ephor off', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook('/ephor off');
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-state')), false);
  });

  it('removes flag on "stop ephor"', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook('stop ephor');
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-state')), false);
  });

  it('removes flag on "normal mode"', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook('normal mode');
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-state')), false);
  });

  it('emits per-turn reinforcement when active', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    const output = runHook('how do I fix this bug');
    const parsed = JSON.parse(output);
    assert.ok(parsed.hookSpecificOutput);
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('STOIC EPHOR ACTIVE'));
  });

  it('does not emit reinforcement when inactive', () => {
    const output = runHook('how do I fix this bug');
    if (output.trim()) {
      const parsed = JSON.parse(output);
      assert.equal(parsed.hookSpecificOutput, undefined);
    }
  });

  it('ignores unknown tier argument', () => {
    runHook('/ephor invalidtier');
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-state')), false);
  });

  it('includes tier-specific rules in reinforcement', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'spartan');
    const output = runHook('how do I fix this bug');
    const parsed = JSON.parse(output);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('Single-clause'));
    assert.ok(ctx.includes('No conjunctions'));
  });

  it('includes ephor-specific rules for ephor tier', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    const output = runHook('explain this');
    const parsed = JSON.parse(output);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('Imperative sentences'));
    assert.ok(ctx.includes('Code alone when code suffices'));
  });

  it('emits full tier content on tier switch via /ephor', () => {
    runHook('/ephor spartan');
    const output = runHook('/ephor spartan');
    const parsed = JSON.parse(output);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('SWITCHING TO TIER: SPARTAN'));
    assert.ok(ctx.includes('Single-clause sentences only'));
  });

  it('emits full tier content on mid-session switch to counsel', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    const output = runHook('/ephor counsel');
    const parsed = JSON.parse(output);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('SWITCHING TO TIER: COUNSEL'));
    assert.ok(ctx.includes('Aphorisms and metaphors permitted'));
  });

  it('includes drift correction when drift flag exists', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    fs.writeFileSync(path.join(tmpDir, '.ephor-drift'), 'preamble');
    const output = runHook('another question');
    const parsed = JSON.parse(output);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('CORRECTION'));
    assert.ok(ctx.includes('opening pleasantries'));
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-drift')), false);
  });

  it('includes both preamble and postamble in drift correction', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    fs.writeFileSync(path.join(tmpDir, '.ephor-drift'), 'preamble,postamble');
    const output = runHook('next question');
    const parsed = JSON.parse(output);
    const ctx = parsed.hookSpecificOutput.additionalContext;
    assert.ok(ctx.includes('opening pleasantries'));
    assert.ok(ctx.includes('closing offers'));
  });

  it('clears drift flag after correction', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    fs.writeFileSync(path.join(tmpDir, '.ephor-drift'), 'postamble');
    runHook('question one');
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-drift')), false);
    const output = runHook('question two');
    const parsed = JSON.parse(output);
    assert.ok(!parsed.hookSpecificOutput.additionalContext.includes('CORRECTION'));
  });

  it('persists tier to user config on /ephor <tier> switch', () => {
    const configDir = path.join(tmpDir, 'stoic-ephor-config');
    runHook('/ephor counsel', { XDG_CONFIG_HOME: configDir });
    const configPath = path.join(configDir, 'stoic-ephor', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.defaultTier, 'counsel');
  });

  it('does not persist on /ephor off', () => {
    const configDir = path.join(tmpDir, 'stoic-ephor-config');
    fs.mkdirSync(path.join(configDir, 'stoic-ephor'), { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'stoic-ephor', 'config.json'),
      JSON.stringify({ defaultTier: 'counsel' })
    );
    runHook('/ephor off', { XDG_CONFIG_HOME: configDir });
    const config = JSON.parse(
      fs.readFileSync(path.join(configDir, 'stoic-ephor', 'config.json'), 'utf8')
    );
    assert.equal(config.defaultTier, 'off');
  });
});
