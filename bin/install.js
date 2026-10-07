#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_NAME = 'stoic-ephor';

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const uninstall = args.includes('--uninstall') || args.includes('-u');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`stoic-ephor installer

Usage: node bin/install.js [flags]

Flags:
  --dry-run     Show what would happen without making changes
  --uninstall   Remove stoic-ephor from Claude Code settings
  --help        Show this help`);
    process.exit(0);
  }

  const claudeDir = process.env.CLAUDE_CONFIG_DIR
    || path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const pluginRoot = path.resolve(__dirname, '..');

  const pluginJson = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
  if (!fs.existsSync(pluginJson)) {
    console.error('Error: .claude-plugin/plugin.json not found at', pluginRoot);
    process.exit(1);
  }

  let settings = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Error reading settings:', e.message);
      process.exit(1);
    }
  }

  if (!settings.plugins) settings.plugins = [];

  if (uninstall) {
    const before = settings.plugins.length;
    settings.plugins = settings.plugins.filter(
      p => !(p === pluginRoot || (p && p.path === pluginRoot) ||
             (typeof p === 'string' && p.includes(PLUGIN_NAME)))
    );
    const removed = before - settings.plugins.length;
    if (removed === 0) {
      console.log('stoic-ephor not found in settings. Nothing to remove.');
      process.exit(0);
    }
    if (settings.statusLine && settings.statusLine.command &&
        settings.statusLine.command.includes('ephor-statusline')) {
      delete settings.statusLine;
    }
    if (dryRun) {
      console.log('[dry-run] Would remove stoic-ephor from', settingsPath);
      process.exit(0);
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    try {
      fs.unlinkSync(path.join(claudeDir, '.ephor-state'));
    } catch (e) {}
    console.log('Stoic Ephor removed. The discipline endures in memory.');
    process.exit(0);
  }

  const alreadyInstalled = settings.plugins.some(
    p => p === pluginRoot || (p && p.path === pluginRoot) ||
         (typeof p === 'string' && p.includes(PLUGIN_NAME))
  );

  const statuslineScript = path.join(pluginRoot, 'src', 'hooks', 'ephor-statusline.sh');
  let statuslineChanged = false;

  if (!settings.statusLine) {
    settings.statusLine = {
      type: 'command',
      command: 'bash ' + statuslineScript,
    };
    statuslineChanged = true;
  } else if (settings.statusLine.command &&
             !settings.statusLine.command.includes('ephor-statusline')) {
    console.log('Existing statusline detected — not overwriting.');
    console.log('To add tier visibility, source the helper in your statusline script:');
    console.log('  EPHOR=$(' + statuslineScript + ')');
    console.log('  echo "... $EPHOR"');
  }

  if (alreadyInstalled && !statuslineChanged) {
    console.log('Stoic Ephor already registered. The Ephor stands ready.');
    process.exit(0);
  }

  if (alreadyInstalled && statuslineChanged) {
    if (dryRun) {
      console.log('[dry-run] Would add statusline to', settingsPath);
      process.exit(0);
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    console.log('Added statusline to existing installation.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('[dry-run] Would add', pluginRoot, 'to', settingsPath);
    process.exit(0);
  }

  settings.plugins.push(pluginRoot);

  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  console.log('Stoic Ephor installed. The Ephor awaits your command.');
  console.log('  Activate: /ephor');
  console.log('  Tiers: counsel | ephor | spartan | leonidas');
  console.log('  Deactivate: /ephor off');
}

main();
