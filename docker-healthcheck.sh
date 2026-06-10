#!/bin/sh
set -eu

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

if [ "$is_worker" = "true" ]; then
  node -e "
    const fs = require('fs');
    try {
      const stats = fs.statSync('/tmp/worker-healthy');
      const age = (Date.now() - stats.mtimeMs) / 1000;
      if (age >= 60) {
        console.error('Worker health file is outdated:', age, 'seconds old');
        process.exit(1);
      }
      const report = JSON.parse(fs.readFileSync('/tmp/worker-healthy', 'utf8'));
      if (report.status !== 'ok') {
        console.error('Worker status is unhealthy:', report);
        process.exit(1);
      }
      process.exit(0);
    } catch (e) {
      console.error('Failed to check worker health:', e.message);
      process.exit(1);
    }
  "
  exit $?
fi

node -e "
  const http = require('http');
  const req = http.get({
    host: '127.0.0.1',
    port: Number(process.env.PORT || 3001),
    path: '/api/v1/health',
    timeout: 5000,
  }, (res) => process.exit(res.statusCode === 200 ? 0 : 1));
  req.on('timeout', () => req.destroy(new Error('healthcheck timeout')));
  req.on('error', () => process.exit(1));
"
