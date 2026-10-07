const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('ephor-response-check (AssistantResponse hook)', () => {
  let tmpDir;
  const hookPath = path.join(__dirname, '..', 'src', 'hooks', 'ephor-response-check.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ephor-response-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runHook(response, env = {}) {
    // Each detection test exercises the tenth-response path explicitly.
    fs.writeFileSync(path.join(tmpDir, '.ephor-check-count'), '9');
    const input = JSON.stringify({ response });
    return execFileSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input,
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: tmpDir,
        ...env,
      },
      timeout: 5000,
    });
  }

  it('does nothing when ephor is inactive', () => {
    runHook("Sure, I'd be happy to help! Here's the answer.");
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-drift')), false);
  });

  it('detects preamble "Sure,"', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("Sure, I can explain that. The interface is too large.");
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(drift.includes('preamble'));
  });

  it('detects preamble "Of course!"', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'spartan');
    runHook("Of course! Here is the fix.");
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(drift.includes('preamble'));
  });

  it('detects preamble "I\'d be happy to"', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("I'd be happy to help with that problem.");
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(drift.includes('preamble'));
  });

  it('detects postamble "Let me know if"', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("The fix is to use a mutex.\nLet me know if you have any questions.");
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(drift.includes('postamble'));
  });

  it('detects postamble "Hope this helps"', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("Use context.WithCancel.\nHope this helps!");
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(drift.includes('postamble'));
  });

  it('detects both preamble and postamble', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("Sure, here's the answer.\nThe fix is X.\nLet me know if you need more help.");
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(drift.includes('preamble'));
    assert.ok(drift.includes('postamble'));
  });

  it('does not flag clean responses', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("Interface is too large. Split by capability. Compose with embedding.");
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-drift')), false);
  });

  it('does not flag technical uses of trigger words', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("The sure way to avoid this is to use a lock.");
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-drift')), false);
  });

  it('handles empty response gracefully', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook('');
    assert.equal(fs.existsSync(path.join(tmpDir, '.ephor-drift')), false);
  });

  it('handles message.content format', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    fs.writeFileSync(path.join(tmpDir, '.ephor-check-count'), '9');
    const input = JSON.stringify({ message: { content: "Sure, I can do that." } });
    execFileSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input,
      env: { ...process.env, CLAUDE_CONFIG_DIR: tmpDir },
      timeout: 5000,
    });
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(drift.includes('preamble'));
  });

  it('handles Codex last_assistant_message format', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    fs.writeFileSync(path.join(tmpDir, '.ephor-check-count'), '9');
    const input = JSON.stringify({
      last_assistant_message: 'Sure, I can do that.',
    });
    execFileSync(process.execPath, [hookPath], {
      encoding: 'utf8',
      input,
      env: { ...process.env, CLAUDE_CONFIG_DIR: tmpDir },
      timeout: 5000,
    });
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(drift.includes('preamble'));
  });

  it('accumulates drift across consecutive responses', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("Sure, here is the answer.");
    const first = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(first.includes('preamble'));
    assert.ok(!first.includes('postamble'));

    runHook("The fix is X.\nLet me know if you need anything else.");
    const second = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(second.includes('preamble'));
    assert.ok(second.includes('postamble'));
  });

  it('does not duplicate violations on repeated same-type drift', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("Sure, first answer.");
    runHook("Of course! Second answer.");
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    const preambleCount = drift.split(',').filter(v => v === 'preamble').length;
    assert.equal(preambleCount, 1);
  });

  it('clean response does not clear existing drift flag', () => {
    fs.writeFileSync(path.join(tmpDir, '.ephor-state'), 'ephor');
    runHook("Sure, here is the fix.");
    assert.ok(fs.existsSync(path.join(tmpDir, '.ephor-drift')));

    runHook("Interface too large. Split by capability.");
    assert.ok(fs.existsSync(path.join(tmpDir, '.ephor-drift')));
    const drift = fs.readFileSync(path.join(tmpDir, '.ephor-drift'), 'utf8');
    assert.ok(drift.includes('preamble'));
  });
});
