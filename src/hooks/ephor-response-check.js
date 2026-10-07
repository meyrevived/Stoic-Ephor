#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { readFlag, safeWriteFlag } = require('./ephor-config');

const claudeDir = process.env.CLAUDE_CONFIG_DIR
  || path.join(os.homedir(), '.claude');
const flagPath = path.join(claudeDir, '.ephor-state');
const driftPath = path.join(claudeDir, '.ephor-drift');
const counterPath = path.join(claudeDir, '.ephor-check-count');
const CHECK_INTERVAL = 10;
const TAIL_BYTES = 1024;

const PREAMBLES = [
  /^sure[,!.\s]/i,
  /^of course[,!.\s]/i,
  /^absolutely[,!.\s]/i,
  /^great question[,!.\s]/i,
  /^i'?d be happy to/i,
  /^let me help/i,
  /^i can help/i,
  /^that'?s a great/i,
];

const POSTAMBLES = [
  /let me know if (?:you )?(?:have|need|want)/i,
  /hope this helps/i,
  /feel free to (?:ask|reach|let)/i,
  /(?:i'?m )?happy to help (?:further|more)/i,
  /don'?t hesitate to/i,
];

function readCounter() {
  try {
    const val = parseInt(fs.readFileSync(counterPath, 'utf8').trim(), 10);
    return Number.isFinite(val) ? val : 0;
  } catch (e) { return 0; }
}

function writeCounter(n) {
  try { fs.writeFileSync(counterPath, String(n), { mode: 0o600 }); }
  catch (e) { /* best-effort */ }
}

function extractLastAssistantText(transcriptPath) {
  try {
    const stat = fs.statSync(transcriptPath);
    const start = Math.max(0, stat.size - TAIL_BYTES);
    const buf = Buffer.alloc(Math.min(TAIL_BYTES, stat.size));
    const fd = fs.openSync(transcriptPath, 'r');
    try {
      fs.readSync(fd, buf, 0, buf.length, start);
    } finally {
      fs.closeSync(fd);
    }
    const chunk = buf.toString('utf8');
    const lines = chunk.split('\n').filter(Boolean);
    if (start > 0) lines.shift();
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.role === 'assistant' && entry.message) {
          const msg = entry.message;
          if (typeof msg.content === 'string') return msg.content;
          if (Array.isArray(msg.content)) {
            return msg.content
              .filter(b => b.type === 'text')
              .map(b => b.text)
              .join('\n');
          }
        }
      } catch (e) { /* partial line or non-JSON */ }
    }
  } catch (e) { /* transcript unreadable */ }
  return '';
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const activeTier = readFlag(flagPath);
    if (!activeTier || activeTier === 'off') {
      process.exit(0);
      return;
    }

    const count = readCounter() + 1;
    writeCounter(count);
    if (count % CHECK_INTERVAL !== 0) {
      process.exit(0);
      return;
    }

    const data = JSON.parse(input);
    // Codex provides the completed response directly on Stop. Preserve the
    // legacy Claude-compatible shapes before falling back to a transcript tail.
    const response = typeof data.last_assistant_message === 'string'
      ? data.last_assistant_message
      : typeof data.response === 'string'
        ? data.response
        : data.message && typeof data.message.content === 'string'
          ? data.message.content
          : data.transcript_path
            ? extractLastAssistantText(data.transcript_path)
            : '';

    if (!response) {
      process.exit(0);
      return;
    }

    const firstLine = response.split('\n')[0] || '';
    const lastLines = response.split('\n').slice(-3).join(' ');

    const violations = [];
    for (const pat of PREAMBLES) {
      if (pat.test(firstLine)) {
        violations.push('preamble');
        break;
      }
    }
    for (const pat of POSTAMBLES) {
      if (pat.test(lastLines)) {
        violations.push('postamble');
        break;
      }
    }

    if (violations.length > 0) {
      const existing = new Set();
      try {
        const st = fs.lstatSync(driftPath);
        if (st.isFile() && !st.isSymbolicLink() && st.size <= 64) {
          fs.readFileSync(driftPath, 'utf8').trim().split(',')
            .forEach(v => { if (v) existing.add(v); });
        }
      } catch (e) { /* no existing drift file */ }
      violations.forEach(v => existing.add(v));
      safeWriteFlag(driftPath, Array.from(existing).join(','));
    }
  } catch (e) {
    // Silent fail — never block the response
  }
});
