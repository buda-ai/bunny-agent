#!/bin/bash

# SandAgent Benchmark Runner
# Usage: ./run-benchmark.sh [options]
#
# Options:
#   --runner <name>     Runner to test: pi, claude, codex, gemini (default: both)
#   --model <name>      Model to use (overrides default)
#   --runs <n>          Number of runs per config (default: 1)
#   --dataset <name>    Dataset: smoking, gaia (default: smoking)
#   --transport <mode>  Smoking: cli (default) | daemon (Sandock + in-sandbox daemon)
#   --daemon-url <url>  Optional in-sandbox daemon base URL
#
# Examples:
#   ./run-benchmark.sh --runner pi --runs 3
#   ./run-benchmark.sh --runner claude --model "global.anthropic.claude-sonnet-4-5-20250929-v1:0"
#   ./run-benchmark.sh --runs 3  # Test both runners
#   ./run-benchmark.sh --runner codex --model "gpt-5.2"
#   ./run-benchmark.sh --runner gemini --model "gemini-2.5-flash"
#   ./run-benchmark.sh --transport daemon --runner pi

set -e

# Load .env file with automatic export
if [ -f ".env" ]; then
  set -a  # Automatically export all variables
  source .env
  set +a  # Disable automatic export
  echo "✅ Loaded .env"
else
  echo "❌ .env file not found. Please create .env from .env.example"
  exit 1
fi

# ============================================
# DEFAULT MODELS - Edit these to change defaults
# ============================================
DEFAULT_PI_MODEL="openai:gpt-5.2"
DEFAULT_CLAUDE_MODEL="bedrock-claude-sonnet-4-6"
DEFAULT_CODEX_MODEL="gpt-5.2"
DEFAULT_GEMINI_MODEL="gemini-2.5-flash"
# ============================================

# Default values
RUNNER="both"
RUNS=1
DATASET="smoking"
MODEL=""
TRANSPORT="cli"
DAEMON_URL_FLAG=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --runner)
      RUNNER="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    --runs)
      RUNS="$2"
      shift 2
      ;;
    --dataset)
      DATASET="$2"
      shift 2
      ;;
    --transport)
      TRANSPORT="$2"
      shift 2
      ;;
    --daemon-url)
      DAEMON_URL_FLAG="$2"
      shift 2
      ;;
    --help|-h)
      echo "Usage: ./run-benchmark.sh [options]"
      echo ""
      echo "Options:"
      echo "  --runner <name>     Runner: pi, claude, codex, gemini, both (default: both)"
      echo "  --model <name>      Model to use"
      echo "  --runs <n>          Number of runs (default: 1)"
      echo "  --dataset <name>    Dataset: smoking, gaia (default: smoking)"
      echo "  --transport <mode>  Smoking: cli | daemon — Sandock + in-sandbox daemon (default: cli)"
      echo "  --daemon-url <url>  Optional daemon base URL"
      echo ""
      echo "Default Models:"
      echo "  Pi:     $DEFAULT_PI_MODEL"
      echo "  Claude: $DEFAULT_CLAUDE_MODEL"
      echo "  Codex:  $DEFAULT_CODEX_MODEL"
      echo "  Gemini: $DEFAULT_GEMINI_MODEL"
      echo ""
      echo "Examples:"
      echo "  ./run-benchmark.sh --runner pi --runs 3"
      echo "  ./run-benchmark.sh --runner claude --model 'global.anthropic.claude-sonnet-4-5-20250929-v1:0'"
      echo "  ./run-benchmark.sh --runner codex --model 'gpt-5.2'"
      echo "  ./run-benchmark.sh --runner gemini --model 'gemini-2.5-flash'"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ "$TRANSPORT" = "sandock" ]; then
  echo "⚠️  --transport sandock is deprecated; using daemon (Sandock + in-sandbox daemon)"
  TRANSPORT="daemon"
fi

# Check if benchmark-sandagent is built
if [ ! -f "packages/benchmark-sandagent/dist/cli.js" ]; then
  echo "❌ benchmark-sandagent not built. Run: cd packages/benchmark-sandagent && pnpm build"
  exit 1
fi

# Create working directory
WORK_DIR="/tmp/sandagent-benchmark"
mkdir -p "$WORK_DIR"
echo "📁 Working directory: $WORK_DIR"
echo ""

# Save project root before cd
PROJECT_ROOT="$(pwd)"

cd "$WORK_DIR"

echo "🏖️  SandAgent Benchmark Runner"
echo "=============================="
echo "Runner: $RUNNER"
echo "Runs: $RUNS"
echo "Dataset: $DATASET"
echo "Transport: $TRANSPORT"
  if [ -n "$MODEL" ]; then
    echo "Model: $MODEL"
  else
  echo "Models:"
  if [ "$RUNNER" = "both" ] || [ "$RUNNER" = "pi" ]; then
    echo "  Pi:     $DEFAULT_PI_MODEL"
  fi
  if [ "$RUNNER" = "both" ] || [ "$RUNNER" = "claude" ]; then
    echo "  Claude: $DEFAULT_CLAUDE_MODEL"
  fi
  if [ "$RUNNER" = "both" ] || [ "$RUNNER" = "codex" ]; then
    echo "  Codex:  $DEFAULT_CODEX_MODEL"
  fi
  if [ "$RUNNER" = "both" ] || [ "$RUNNER" = "gemini" ]; then
    echo "  Gemini: $DEFAULT_GEMINI_MODEL"
  fi
fi
echo ""

BENCH_EXTRA=(--transport "$TRANSPORT")
if [ -n "$DAEMON_URL_FLAG" ]; then
  BENCH_EXTRA+=(--daemon-url "$DAEMON_URL_FLAG")
fi

# Function to run benchmark
run_benchmark() {
  local runner=$1
  local model=$2
  local run_num=$3
  
  echo "🔄 Run #$run_num - $runner + $model"
  
  if [ "$runner" = "pi" ]; then
    PROJECT_ROOT="$PROJECT_ROOT" \
    AI_MODEL="$model" \
    OPENAI_API_KEY="$OPENAI_API_KEY" \
    OPENAI_BASE_URL="$OPENAI_BASE_URL" \
    node "$PROJECT_ROOT/packages/benchmark-sandagent/dist/cli.js" run --runner pi "${BENCH_EXTRA[@]}"
  elif [ "$runner" = "claude" ]; then
    PROJECT_ROOT="$PROJECT_ROOT" \
    AI_MODEL="$model" \
    ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
    ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_AUTH_TOKEN" \
    ANTHROPIC_BEDROCK_BASE_URL="$ANTHROPIC_BEDROCK_BASE_URL" \
    LITELLM_MASTER_KEY="$LITELLM_MASTER_KEY" \
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS="$CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS" \
    CLAUDE_CODE_USE_BEDROCK="$CLAUDE_CODE_USE_BEDROCK" \
    CLAUDE_CODE_SKIP_BEDROCK_AUTH="$CLAUDE_CODE_SKIP_BEDROCK_AUTH" \
    node "$PROJECT_ROOT/packages/benchmark-sandagent/dist/cli.js" run --runner claude "${BENCH_EXTRA[@]}"
  elif [ "$runner" = "codex" ]; then
    PROJECT_ROOT="$PROJECT_ROOT" \
    AI_MODEL="$model" \
    OPENAI_API_KEY="$OPENAI_API_KEY" \
    CODEX_API_KEY="${CODEX_API_KEY:-$OPENAI_API_KEY}" \
    OPENAI_BASE_URL="$OPENAI_BASE_URL" \
    node "$PROJECT_ROOT/packages/benchmark-sandagent/dist/cli.js" run --runner codex "${BENCH_EXTRA[@]}"
  elif [ "$runner" = "gemini" ]; then
    PROJECT_ROOT="$PROJECT_ROOT" \
    AI_MODEL="$model" \
    GEMINI_API_KEY="$GEMINI_API_KEY" \
    GOOGLE_API_KEY="${GOOGLE_API_KEY:-}" \
    GOOGLE_GEMINI_BASE_URL="${GOOGLE_GEMINI_BASE_URL:-$GEMINI_BASE_URL}" \
    node "$PROJECT_ROOT/packages/benchmark-sandagent/dist/cli.js" run --runner gemini "${BENCH_EXTRA[@]}"
  fi
  
  echo ""
}

# Run benchmarks
for i in $(seq 1 $RUNS); do
  if [ "$RUNNER" = "both" ] || [ "$RUNNER" = "pi" ]; then
    PI_MODEL="${MODEL:-$DEFAULT_PI_MODEL}"
    run_benchmark "pi" "$PI_MODEL" "$i"
    sleep 2
  fi
  
  if [ "$RUNNER" = "both" ] || [ "$RUNNER" = "claude" ]; then
    CLAUDE_MODEL="${MODEL:-$DEFAULT_CLAUDE_MODEL}"
    run_benchmark "claude" "$CLAUDE_MODEL" "$i"
    sleep 2
  fi

  if [ "$RUNNER" = "both" ] || [ "$RUNNER" = "codex" ]; then
    CODEX_MODEL="${MODEL:-$DEFAULT_CODEX_MODEL}"
    run_benchmark "codex" "$CODEX_MODEL" "$i"
    sleep 2
  fi

  if [ "$RUNNER" = "both" ] || [ "$RUNNER" = "gemini" ]; then
    GEMINI_MODEL="${MODEL:-$DEFAULT_GEMINI_MODEL}"
    run_benchmark "gemini" "$GEMINI_MODEL" "$i"
    sleep 2
  fi
done

echo "✅ Benchmark complete!"
echo "📊 Results: $PROJECT_ROOT/benchmark-results/sandagent/$DATASET/"
