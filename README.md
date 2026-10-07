# Stoic Ephor

Grammatically correct Stoic brevity for Claude Code and Codex. Cuts 40-70% of output tokens by eliminating every word that doesn't earn its place — while maintaining impeccable grammar.

Unlike [Caveman](https://github.com/JuliusBrussee/caveman) (which drops grammar for compression), the Ephor keeps sentences correct and dignified. No broken English, no dropped articles where ambiguity would result, no fragments unless the tier allows them.

## Install

```bash
git clone https://github.com/meyrevived/stoic-ephor.git
cd stoic-ephor
bash install.sh
```

## Usage

```
/ephor              # Activate at default tier (ephor)
/ephor counsel      # Switch to philosophical tier
/ephor spartan      # Maximum compression
/ephor leonidas     # counsel but ALL CAPS
/ephor off          # Deactivate
```

Also responds to natural language: "stoic mode", "activate ephor", "stop ephor", "normal mode".

## Tiers

| Tier       | Style                                                                | Expected Savings |
| ---------- | -------------------------------------------------------------------- | ---------------- |
| `counsel`  | Full Stoic philosopher — aphorisms, metaphors, philosophical framing | 20-35%           |
| `ephor`    | Laconic authority — stripped to load-bearing words (default)         | 40-55%           |
| `spartan`  | Maximum dignified compression — outline-like, no connecting prose    | 55-70%           |
| `leonidas` | `counsel` but ALL CAPS                                               | 20-35%           |

## Examples

**Prompt:** "Why does this Go interface feel wrong?"

**Vanilla Claude:**
> Sure, I'd be happy to help! The issue you're running into is actually a pretty common one in Go. Your interface is likely too large, which is sometimes called a "fat interface" antipattern. Basically, when you define an interface with many methods, you're forcing every implementor to provide all of them, even when they only need a subset. This goes against Go's philosophy of small, composable interfaces. You might want to consider breaking it up into smaller, more focused interfaces that can be composed together. This is often referred to as the Interface Segregation Principle. Let me know if you'd like me to show you how to refactor it!

**Counsel tier:**
> The interface demands too much of its implementors — a form of coupling disguised as abstraction. In Go, the smallest interface that captures a behavior is the correct one. An interface with seven methods is seven promises every implementor must keep, whether relevant or not. Split by capability: a `Reader` reads, a `Closer` closes, a `ReadCloser` composes both. The obstacle reveals the path — your large interface, broken apart, becomes the composable design Go rewards.

**Ephor tier:**
> Interface is too large. Every method is a promise every implementor must keep. Split by capability — `Reader` reads, `Closer` closes. Compose with embedding.

**Spartan tier:**
> Interface too large. Split by capability. Compose with embedding.

**Leonidas tier:**
> THE INTERFACE DEMANDS TOO MUCH OF ITS IMPLEMENTORS. IN GO, THE SMALLEST INTERFACE THAT CAPTURES A BEHAVIOR IS THE CORRECT ONE. SPLIT BY CAPABILITY. COMPOSE WITH EMBEDDING. THE OBSTACLE REVEALS THE PATH.


## Context Window Impact 

| Component                                                | Words | Chars  | When              |
| -------------------------------------------------------- | ----- | ------ | ----------------- |
| SessionStart (SKILL.md body + ephor tier)                | ~839  | ~5.5KB | Once per session  |
| SessionStart (SKILL.md body + counsel tier — worst case) | ~966  | ~6.2KB | Once per session  |
| Per-turn reinforcement                                   | ~22   | ~150B  | Every user prompt |

  Token estimate: The SessionStart payload is roughly 1,000-1,200 tokens (using the ~0.75 words/token heuristic for mixed prose+markdown). The per-turn reinforcement is roughly 30-40 tokens.

  For context, Claude's working window is ~200K tokens. The SessionStart cost is ~0.5-0.6% of the context window. The per-turn reinforcement is (~0.02%).

## Configuration

Tier changes via `/ephor <tier>` persist automatically — the next session starts with your last chosen tier. Bare `/ephor` resets to the default `ephor` tier.

Resolution order (highest priority first):

1. **Environment variable:** `EPHOR_DEFAULT_TIER=spartan`
2. **Repo-local config:** `.ephor.json` or `.ephor/config.json` (walks up from cwd)
   ```json
   { "defaultTier": "spartan" }
   ```
3. **User config:** `~/.config/stoic-ephor/config.json` (auto-updated on `/ephor <tier>`)
4. **Default:** `ephor`

## Statusline

The installer automatically configures a status line that displays the active tier — `[EPHOR]` at default, `[EPHOR:COUNSEL]` when switched. Updates immediately on `/ephor <tier>`. Shows nothing when ephor is off.

If you already have a status line configured, the installer preserves it and prints integration instructions instead.

### Adding to an Existing Status Line

Call the helper script from within your own status line script:

```bash
#!/bin/bash
# your-statusline.sh
input=$(cat)

# Your existing status line content
MODEL=$(echo "$input" | jq -r '.model.display_name')

# Add ephor tier
EPHOR=$(bash /path/to/stoic-ephor/src/hooks/ephor-statusline.sh)

echo "[$MODEL] $EPHOR"
```

### Manual Setup

If you skipped the installer:

```json
{
  "statusLine": {
    "type": "command",
    "command": "bash /path/to/stoic-ephor/src/hooks/ephor-statusline.sh"
  }
}
```

## Uninstall

```bash
node bin/install.js --uninstall
```

## Philosophy

Three maxims govern the Ephor:

1. **Dichotomy of Control.** Act only on what is in your power to refactor or fix.
2. **Objective Representation.** A bug is a mechanical misalignment, not "catastrophic."
3. **The Obstacle is the Way.** Constraints define the correct path.

## License

MIT
