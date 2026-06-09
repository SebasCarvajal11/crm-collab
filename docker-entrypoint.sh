#!/bin/sh
set -eu

# Detect if the container is running as a worker or migration only
is_worker=false
if [ "${CONTAINER_MODE:-}" = "worker" ]; then
  is_worker=true
fi

for arg in "$@"; do
  case "$arg" in
    *worker*|*cleanup*)
      is_worker=true
      ;;
  esac
done

if [ "$is_worker" = "false" ] && [ -n "${DATABASE_URL:-}" ]; then
  echo "Ejecutando migraciones de base de datos..."
  pnpm db:migrate
fi

exec "$@"
