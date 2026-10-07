#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultTier, safeWriteFlag } = require('./ephor-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR
  || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.ephor-state');

const tier = getDefaultTier();

if (tier === 'off') {
  try { fs.unlinkSync(flagPath); } catch (e) { /* may not exist */ }
  process.stdout.write('OK');
  process.exit(0);
}

safeWriteFlag(flagPath, tier);

let skillContent = '';
try {
  skillContent = fs.readFileSync(
    path.join(__dirname, '..', '..', 'skills', 'ephor', 'SKILL.md'),
    'utf8'
  );
} catch (e) { /* SKILL.md missing — degrade gracefully */ }

let tierContent = '';
try {
  tierContent = fs.readFileSync(
    path.join(__dirname, '..', 'tiers', `${tier}.md`),
    'utf8'
  );
} catch (e) { /* tier file missing — use fallback */ }

let output = `STOIC EPHOR ACTIVE — tier: ${tier}\n\n`;

if (skillContent) {
  const body = skillContent.replace(/^---[\s\S]*?---\s*/, '');
  output += body + '\n\n';
}

if (tierContent) {
  output += tierContent;
} else {
  output +=
    'Respond with grammatically correct Stoic brevity. ' +
    'All technical substance preserved. Every word must earn its place.\n\n' +
    '## Rules\n\n' +
    'No preamble, no postamble, no pleasantries, no hedging. ' +
    'Code blocks unchanged. Errors quoted exact. ' +
    'Confidence over apology. Active every response.\n\n' +
    'Current tier: **' + tier + '**. Switch: `/ephor <tier>`. ' +
    'Off: `/ephor off` or "normal mode".';
}

process.stdout.write(output);
