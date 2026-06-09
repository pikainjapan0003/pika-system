#!/usr/bin/env bash
set -e

CLAUDE_BIN="/home/runner/workspace/.config/npm/node_global/bin/claude"

if [ ! -x "$CLAUDE_BIN" ]; then
  echo "找不到 Claude Code：$CLAUDE_BIN"
  echo "請先執行：which claude"
  exit 1
fi

if [ -z "$MINIMAX_API_KEY" ]; then
  echo "目前沒有偵測到 MINIMAX_API_KEY。"
  echo "等一下貼 API Key 時畫面不會顯示，這是正常的。"
  read -rsp "請輸入 MiniMax API Key：" MINIMAX_API_KEY
  echo
fi

env \
  -u ANTHROPIC_API_KEY \
  ANTHROPIC_AUTH_TOKEN="$MINIMAX_API_KEY" \
  ANTHROPIC_BASE_URL="https://api.minimax.io/anthropic" \
  API_TIMEOUT_MS="3000000" \
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1" \
  ANTHROPIC_MODEL="MiniMax-M3" \
  ANTHROPIC_DEFAULT_SONNET_MODEL="MiniMax-M3" \
  ANTHROPIC_DEFAULT_OPUS_MODEL="MiniMax-M3" \
  ANTHROPIC_DEFAULT_HAIKU_MODEL="MiniMax-M3" \
  CLAUDE_CODE_AUTO_COMPACT_WINDOW="512000" \
  "$CLAUDE_BIN" --dangerously-skip-permissions "$@"
