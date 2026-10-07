#!/bin/bash
# stoic-ephor benchmark runner
# <!-- BENCHMARKING: removable -->
#
# Fires test prompts at the Claude API with and without each Ephor tier active.
# Compares output_tokens from API response metadata.
#
# Requirements:
#   - gcloud CLI authenticated (gcloud auth login)
#   - ANTHROPIC_VERTEX_PROJECT_ID environment variable set
#   - curl, jq installed
#
# Optional env vars:
#   EPHOR_BENCH_REGION  — Vertex AI region (default: us-east5)
#   EPHOR_BENCH_MODEL   — Claude model ID (default: claude-sonnet-4-6)
#
# Usage: bash benchmarks/run.sh [tier]
#   tier: counsel, ephor, spartan, leonidas, all (default: all)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROMPTS_FILE="$SCRIPT_DIR/prompts.json"
RESULTS_DIR="$SCRIPT_DIR/results"
MODEL="${EPHOR_BENCH_MODEL:-claude-haiku-4-5}"
REGION="${EPHOR_BENCH_REGION:-us-east5}"
PROJECT_ID="${ANTHROPIC_VERTEX_PROJECT_ID:-}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: ANTHROPIC_VERTEX_PROJECT_ID not set" >&2
  exit 1
fi

if ! command -v gcloud &>/dev/null; then
  echo "Error: gcloud CLI not found" >&2
  exit 1
fi

TOKEN=$(gcloud auth print-access-token 2>/dev/null) || true
if [ -z "$TOKEN" ] || [[ "$TOKEN" == ERROR* ]]; then
  echo "Error: gcloud auth failed — run 'gcloud auth login'" >&2
  exit 1
fi

VERTEX_URL="https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${REGION}/publishers/anthropic/models/${MODEL}:rawPredict"

TIER="${1:-all}"
TIERS=("counsel" "ephor" "spartan" "leonidas")
if [ "$TIER" != "all" ]; then
  TIERS=("$TIER")
fi

mkdir -p "$RESULTS_DIR"

SKILL_MD=$(cat "$SCRIPT_DIR/../skills/stoic-ephor/SKILL.md" 2>/dev/null | sed 's/^---$//' | sed '/^name:/d' | sed '/^description:/d' || echo "")

run_prompt() {
  local prompt="$1"
  local system="$2"
  local result

  result=$(curl -s "$VERTEX_URL" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(jq -n \
      --arg system "$system" \
      --arg prompt "$prompt" \
      '{anthropic_version: "vertex-2023-10-16", max_tokens: 2048, system: $system, messages: [{role: "user", content: $prompt}]}'
    )")

  echo "$result" | jq -r '.usage.output_tokens // "error"'
}

echo "Stoic Ephor Benchmark"
echo "Model: $MODEL"
echo "Region: $REGION"
echo "Project: $PROJECT_ID"
echo "========================"
echo ""

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULT_FILE="$RESULTS_DIR/benchmark_$TIMESTAMP.json"
echo '{"model":"'"$MODEL"'","timestamp":"'"$TIMESTAMP"'","results":[' > "$RESULT_FILE"

FIRST=true

for category in conversational documents; do
  PROMPTS=$(jq -r ".${category}[] | .id" "$PROMPTS_FILE")
  for id in $PROMPTS; do
    PROMPT=$(jq -r ".${category}[] | select(.id == \"$id\") | .prompt" "$PROMPTS_FILE")
    CAT=$(jq -r ".${category}[] | select(.id == \"$id\") | .category" "$PROMPTS_FILE")

    echo "Task: $id ($CAT)"

    VANILLA=$(run_prompt "$PROMPT" "You are a helpful assistant.")
    echo "  Vanilla:    $VANILLA tokens"

    for tier in "${TIERS[@]}"; do
      TIER_CONTENT=$(cat "$SCRIPT_DIR/../src/tiers/${tier}.md" 2>/dev/null || echo "")
      SYSTEM="STOIC EPHOR ACTIVE — tier: ${tier}\n\n${SKILL_MD}\n\n${TIER_CONTENT}"
      TIER_TOKENS=$(run_prompt "$PROMPT" "$SYSTEM")

      if [ "$VANILLA" != "error" ] && [ "$TIER_TOKENS" != "error" ]; then
        SAVINGS=$(echo "scale=1; (1 - $TIER_TOKENS / $VANILLA) * 100" | bc 2>/dev/null || echo "N/A")
        echo "  ${tier}:$(printf '%*s' $((12 - ${#tier})) '')$TIER_TOKENS tokens  (${SAVINGS}% savings)"
      else
        echo "  ${tier}:$(printf '%*s' $((12 - ${#tier})) '')$TIER_TOKENS tokens"
      fi

      if [ "$FIRST" = true ]; then FIRST=false; else echo ',' >> "$RESULT_FILE"; fi
      echo "{\"id\":\"$id\",\"category\":\"$CAT\",\"tier\":\"$tier\",\"vanilla\":$VANILLA,\"compressed\":$TIER_TOKENS}" >> "$RESULT_FILE"
    done
    echo ""
  done
done

echo ']}' >> "$RESULT_FILE"

echo "Results saved to $RESULT_FILE"
