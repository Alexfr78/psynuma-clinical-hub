#!/bin/bash
# Instala dependencias en sesiones cloud de Claude Code para que lint y tests funcionen.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# npm install (no ci) aprovecha la caché del contenedor. --legacy-peer-deps porque
# varios @radix-ui antiguos declaran peer react <=18 y el proyecto usa React 19.
npm install --legacy-peer-deps --no-audit --no-fund --loglevel=error
