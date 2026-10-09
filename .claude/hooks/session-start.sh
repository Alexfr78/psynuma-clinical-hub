#!/bin/bash
# Instala dependencias en sesiones cloud de Claude Code para que lint y tests funcionen.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install (no ci) aprovecha la caché del contenedor.
npm install --no-audit --no-fund --loglevel=error
