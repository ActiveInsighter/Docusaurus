#!/usr/bin/env bash

set -uo pipefail

if [[ "${SKIP_NPM_CI:-0}" != "1" ]]; then
  npm ci --no-audit --no-fund --silent >/dev/null 2>&1
fi

echo "META ts=$(date -Iseconds) node=$(node --version) npm=$(npm --version) cpus=$(nproc)"
echo "PHASE ts=$(date -Iseconds) name=build-start"

sample() {
  local node_total=0
  local node_max=0
  local rss

  # Keep this awk program compatible with Ubuntu's default mawk. Match both
  # executable names and complete build command lines, while excluding the
  # monitor itself.
  while read -r rss; do
    [[ -z "${rss}" ]] && continue
    node_total=$((node_total + rss))
    (( rss > node_max )) && node_max="${rss}"
  done < <(
    ps -eo rss=,comm=,args= 2>/dev/null |
      awk '
        {
          rss = $1
          comm = $2
          line = $0

          if (line ~ /awk/ || line ~ /diagnose-build-resources/) {
            next
          }

          if (comm == "node" || comm == "npm" || line ~ /npm run build/ || line ~ /docusaurus build/ || line ~ /node .*docusaurus/) {
            print rss
          }
        }
      ' || true
  )

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
    sleep "${RESOURCE_SAMPLE_SECONDS:-10}"
    sample
  done
) &
MONITOR_PID=$!

cleanup() {
  local exit_code=$?

  kill "${MONITOR_PID}" 2>/dev/null || true
  wait "${MONITOR_PID}" 2>/dev/null || true
  sample || true
  echo "PHASE ts=$(date -Iseconds) name=build-end exit_code=${exit_code}"

  if (( exit_code != 0 )); then
    echo "BUILD_LOG_TAIL lines=${BUILD_LOG_TAIL_LINES:-40}"
    tail -n "${BUILD_LOG_TAIL_LINES:-40}" build-output.log 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Stream the real Docusaurus output to the Actions log while retaining a copy
# for the failure tail. pipefail preserves npm's non-zero exit status through
# tee, and the performance logger shows which compilation/SSG phase is active.
DOCUSAURUS_PERF_LOGGER="${DOCUSAURUS_PERF_LOGGER:-true}" \
  npm run build 2>&1 | tee build-output.log
