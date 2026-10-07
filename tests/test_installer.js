const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('installer', () => {
  let tmpDir;
  const installerPath = path.join(__dirname, '..', 'bin', 'install.js');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ephor-install-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runInstaller(args = [], env = {}) {
    return execFileSync(process.execPath, [installerPath, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: tmpDir,
        ...env,
      },
      timeout: 5000,
    });
  }

  it('installs plugin to settings.json', () => {
    const output = runInstaller();
    assert.ok(output.includes('installed'));
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8')
    );
    assert.ok(settings.plugins.length > 0);
  });

  it('detects already installed', () => {
    runInstaller();
    const output = runInstaller();
    assert.ok(output.includes('already'));
  });

  it('dry-run makes no changes', () => {
    const output = runInstaller(['--dry-run']);
    assert.ok(output.includes('dry-run'));
    assert.equal(
      fs.existsSync(path.join(tmpDir, 'settings.json')),
      false
    );
  });

  it('uninstall removes plugin', () => {
    runInstaller();
    const output = runInstaller(['--uninstall']);
    assert.ok(output.includes('removed'));
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8')
    );
    assert.equal(settings.plugins.length, 0);
  });

  it('installs statusLine when none exists', () => {
    runInstaller();
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8')
    );
    assert.ok(settings.statusLine);
    assert.equal(settings.statusLine.type, 'command');
    assert.ok(settings.statusLine.command.includes('ephor-statusline.sh'));
  });

  it('does not overwrite existing statusLine', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ statusLine: { type: 'command', command: 'my-custom-statusline.sh' } })
    );
    const output = runInstaller();
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8')
    );
    assert.equal(settings.statusLine.command, 'my-custom-statusline.sh');
    assert.ok(output.includes('statusline') || output.includes('status'));
  });

  it('uninstall removes statusLine if it points to ephor', () => {
    runInstaller();
    runInstaller(['--uninstall']);
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8')
    );
    assert.equal(settings.statusLine, undefined);
  });

  it('adds statusLine on re-run when plugin registered but statusLine missing', () => {
    // Simulate pre-existing install without statusLine (upgrade path)
    fs.mkdirSync(tmpDir, { recursive: true });
    const pluginRoot = path.resolve(__dirname, '..');
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({ plugins: [pluginRoot] })
    );
    const output = runInstaller();
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8')
    );
    assert.ok(settings.statusLine);
    assert.equal(settings.statusLine.type, 'command');
    assert.ok(settings.statusLine.command.includes('ephor-statusline.sh'));
    assert.ok(output.includes('statusline'));
  });

  it('uninstall preserves non-ephor statusLine', () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'settings.json'),
      JSON.stringify({
        plugins: [path.resolve(__dirname, '..')],
        statusLine: { type: 'command', command: 'my-custom-statusline.sh' },
      })
    );
    runInstaller(['--uninstall']);
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf8')
    );
    assert.equal(settings.statusLine.command, 'my-custom-statusline.sh');
  });
});
