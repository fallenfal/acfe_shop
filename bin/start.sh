#!/bin/sh
set -e
# Railway sets PORT at runtime; shell expansion avoids exec-form "$PORT" bugs.
PORT="${PORT:-8000}"
exec gunicorn acfe_shop.wsgi:application \
  --bind "0.0.0.0:${PORT}" \
  --workers 2 \
  --timeout 120
