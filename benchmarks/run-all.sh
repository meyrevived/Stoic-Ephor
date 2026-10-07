#!/bin/bash
# stoic-ephor full benchmark suite
#
# Runs benchmarks across all models and tiers, 4 cycles each.
# Moves results into model-specific directories under benchmarks/results/.
#
# Requirements: same as run.sh (gcloud, jq, curl, ANTHROPIC_VERTEX_PROJECT_ID)
#
# Usage: bash benchmarks/run-all.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS_DIR="$SCRIPT_DIR/results"

declare -A MODELS=(
  ["Opus"]="claude-opus-4-6"
  ["Sonnet"]="claude-sonnet-4-6"
  ["Haiku"]="claude-haiku-4-5"
)

TIERS=("counsel" "ephor" "spartan" "leonidas")
CYCLES=4

for dir in Opus Sonnet Haiku; do
  mkdir -p "$RESULTS_DIR/$dir"
done

for cycle in $(seq 1 $CYCLES); do
  for model_dir in Opus Sonnet Haiku; do
    model_id="${MODELS[$model_dir]}"
    for tier in "${TIERS[@]}"; do
      echo "=== Cycle $cycle | $model_dir ($model_id) | $tier ==="

      EPHOR_BENCH_MODEL="$model_id" bash "$SCRIPT_DIR/run.sh" "$tier"

      latest=$(ls -t "$RESULTS_DIR"/benchmark_*.json 2>/dev/null | head -1)
      if [ -n "$latest" ]; then
        mv "$latest" "$RESULTS_DIR/$model_dir/"
        echo "Moved $(basename "$latest") -> results/$model_dir/"
      else
        echo "Warning: no result file found for $tier on $model_id" >&2
      fi

      echo ""
    done
  done
done

echo "Complete. $((CYCLES * 3 * 4)) benchmark runs across $CYCLES cycles."
