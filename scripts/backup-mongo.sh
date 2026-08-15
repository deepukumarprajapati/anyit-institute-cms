#!/usr/bin/env bash
# Simple MongoDB backup helper for local/docker deployments.
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
OUT_DIR=${1:-./backups}
mkdir -p "$OUT_DIR"
docker compose exec -T mongo mongodump --db anyit_cms --archive > "$OUT_DIR/anyit_cms-$STAMP.archive"
echo "Backup written to $OUT_DIR/anyit_cms-$STAMP.archive"
