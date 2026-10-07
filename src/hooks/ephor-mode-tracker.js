#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { getDefaultTier, saveDefaultTier, safeWriteFlag, readFlag, VALID_TIERS } = require('./ephor-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR
  || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.ephor-state');
const driftPath = path.join(claudeDir, '.ephor-drift');

const TIER_RULES = {
  counsel:
    'Complete sentences. Aphorisms/metaphors permitted when they compress meaning. ' +
    'Philosophical framing on setbacks. No hedging.',
  ephor:
    'Imperative sentences. Drop filler/hedging/articles when unambiguous. ' +
    'One idea per sentence. Code alone when code suffices.',
  spartan:
    'Single-clause sentences only. No conjunctions. No articles. ' +
    'Headers over paragraphs. No prose around code unless genuinely ambiguous.',
  leonidas:
    'ALL CAPS prose. Code blocks unchanged. ' +
    'Complete sentences. Aphorisms/metaphors permitted. Philosophical framing.',
};

function loadTierContent(tier) {
  try {
    return fs.readFileSync(
      path.join(__dirname, '..', 'tiers', `${tier}.md`),
      'utf8'
    );
  } catch (e) { return ''; }
}

const EPHOR_CMD_PATTERNS = [
  /^\/ephor(?:\s|$)/,
  /^\/stoic-ephor:ephor(?:\s|$)/,
];

function parseEphorArg(prompt) {
  for (const pat of EPHOR_CMD_PATTERNS) {
    if (pat.test(prompt)) {
      const parts = prompt.split(/\s+/);
      return parts[1] || '';
    }
  }
  return null;
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').trim().toLowerCase();
    let tierSwitched = null;

    // --- /ephor slash commands (highest priority) ---
    // Matches raw `/ephor [tier]` and fully-qualified `/stoic-ephor:ephor [tier]`
    const ephorArg = parseEphorArg(prompt);
    if (ephorArg !== null) {
      const arg = ephorArg;
      let tier = null;

      if (!arg) {
        tier = 'ephor';
      } else if (arg === 'off' || arg === 'stop' || arg === 'disable') {
        tier = 'off';
      } else if (VALID_TIERS.includes(arg) && arg !== 'off') {
        tier = arg;
      }

      if (tier && tier !== 'off') {
        safeWriteFlag(flagPath, tier);
        saveDefaultTier(tier);
        tierSwitched = tier;
      } else if (tier === 'off') {
        try { fs.unlinkSync(flagPath); } catch (e) { /* may not exist */ }
        saveDefaultTier('off');
      }
    }

    // --- Natural language deactivation ---
    if (/\b(stop|disable|deactivate|turn off)\b.*\bephor\b/i.test(prompt) ||
        /\bephor\b.*\b(stop|disable|deactivate|turn off)\b/i.test(prompt) ||
        /\bnormal mode\b/i.test(prompt)) {
      try { fs.unlinkSync(flagPath); } catch (e) { /* may not exist */ }
    }

    // --- Natural language activation ---
    if (/\b(activate|enable|turn on|start)\b.*\bephor\b/i.test(prompt) ||
        /\bephor\b.*\b(mode|activate|enable|turn on|start)\b/i.test(prompt) ||
        /\bstoic mode\b/i.test(prompt)) {
      if (!/\b(stop|disable|turn off|deactivate)\b/i.test(prompt)) {
        const tier = getDefaultTier();
        if (tier !== 'off') {
          safeWriteFlag(flagPath, tier);
          tierSwitched = tier;
        }
      }
    }

    // --- Check for drift detected by response hook ---
    let driftCorrection = '';
    try {
      const st = fs.lstatSync(driftPath);
      if (st.isFile() && !st.isSymbolicLink() && st.size <= 64) {
        const drift = fs.readFileSync(driftPath, 'utf8').trim();
        if (drift) {
          const violations = drift.split(',');
          const parts = [];
          if (violations.includes('preamble')) parts.push('opening pleasantries');
          if (violations.includes('postamble')) parts.push('closing offers');
          if (parts.length > 0) {
            driftCorrection =
              ' CORRECTION: Your last response included ' + parts.join(' and ') +
              '. The Ephor does not greet, hedge, or offer. Correct immediately.';
          }
          try { fs.unlinkSync(driftPath); } catch (e) { /* may not exist */ }
        }
      }
    } catch (e) { /* no drift file */ }

    // --- Per-turn reinforcement when active ---
    const activeTier = readFlag(flagPath);
    if (activeTier && activeTier !== 'off') {
      let context;

      if (tierSwitched) {
        const tierContent = loadTierContent(tierSwitched);
        context =
          'STOIC EPHOR — SWITCHING TO TIER: ' + tierSwitched.toUpperCase() + '.\n\n' +
          (tierContent || (TIER_RULES[tierSwitched] || '')) + '\n\n' +
          'Apply these rules starting NOW. No preamble/postamble/pleasantries. ' +
          'Code unchanged. Confidence over apology.';
      } else {
        const rules = TIER_RULES[activeTier] || '';
        context =
          'STOIC EPHOR ACTIVE (' + activeTier + '). ' +
          rules + ' ' +
          'No preamble/postamble/pleasantries. Code unchanged. Confidence over apology.';
      }

      if (driftCorrection) context += driftCorrection;

      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: context,
        },
      }));
    }
  } catch (e) {
    // Silent fail — hook must never block the prompt
  }
});
