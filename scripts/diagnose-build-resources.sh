#!/usr/bin/env bash

set -uo pipefail

npm ci --no-audit --no-fund --silent >/dev/null 2>&1
echo "META ts=$(date -Iseconds) node=$(node --version) npm=$(npm --version) cpus=$(nproc)"
echo "PHASE ts=$(date -Iseconds) name=build-start"

sample() {
  local node_total=0
  local node_max=0
  local rss

  while read -r rss; do
    [[ -z "${rss}" ]] && continue
    node_total=$((node_total + rss))
    (( rss > node_max )) && node_max="${rss}"
  done < <(ps -C node -o rss= 2>/dev/null || true)

  printf 'RESOURCE ts=%s mem_available_kb=%s mem_free_kb=%s node_total_kb=%s node_max_kb=%s disk_avail_kb=%s\n' \
    "$(date -Iseconds)" \
    "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" \
    "$(awk '/MemFree:/ {print $2}' /proc/meminfo)" \
    "${node_total}" \
    "${node_max}" \
    "$(df -Pk . | awk 'NR == 2 {print $4}')"
}

sample
(
  while true; do
    sleep 10
    sample
  done
) &
MONITOR_PID=$!

cleanup() {
  kill "${MONITOR_PID}" 2>/dev/null || true
  wait "${MONITOR_PID}" 2>/dev/null || true
  sample || true
  echo "PHASE ts=$(date -Iseconds) name=build-end"
  tail -n 12 build-output.log 2>/dev/null || true
}
trap cleanup EXIT INT TERM

npm run build >build-output.log 2>&1
