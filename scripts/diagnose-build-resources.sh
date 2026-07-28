#!/usr/bin/env bash

set -uo pipefail

if [[ "${SKIP_NPM_CI:-0}" != "1" ]]; then
  npm ci --no-audit --no-fund --silent >/dev/null 2>&1
fi

# Diagnostic branch only: disable the Rspack persistent cache on a cold,
# ephemeral runner and emit a compact summary that is easy to compare.
python3 - <<'PY'
from pathlib import Path

path = Path('docusaurus.config.ts')
source = path.read_text(encoding='utf-8')
needle = '      ssgWorkerThreads: false,\n'
replacement = '      rspackPersistentCache: false,\n      ssgWorkerThreads: false,\n'
if 'rspackPersistentCache:' not in source:
    if needle not in source:
        raise SystemExit('Unable to locate Docusaurus faster configuration')
    source = source.replace(needle, replacement, 1)
path.write_text(source, encoding='utf-8')
PY

SAMPLES_FILE="resource-samples.tsv"
BUILD_LOG="build-output.log"
: >"${SAMPLES_FILE}"
: >"${BUILD_LOG}"

sample_to_file() {
  local node_total=0
  local node_max=0
  local rss

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

  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(date +%s)" \
    "$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)" \
    "$(awk '/MemFree:/ {print $2}' /proc/meminfo)" \
    "${node_total}" \
    "${node_max}" \
    "$(df -Pk . | awk 'NR == 2 {print $4}')" >>"${SAMPLES_FILE}"
}

start_epoch=$(date +%s)
start_disk_kb=$(df -Pk . | awk 'NR == 2 {print $4}')

DOCUSAURUS_PERF_LOGGER="${DOCUSAURUS_PERF_LOGGER:-true}" \
  npm run build >"${BUILD_LOG}" 2>&1 &
BUILD_PID=$!

while kill -0 "${BUILD_PID}" 2>/dev/null; do
  sample_to_file
  sleep "${RESOURCE_SAMPLE_SECONDS:-2}"
done

wait "${BUILD_PID}"
exit_code=$?
sample_to_file

end_epoch=$(date +%s)
end_disk_kb=$(df -Pk . | awk 'NR == 2 {print $4}')

read -r sample_count min_mem_available min_mem_free max_node_total max_node_single min_disk_available <<EOF
$(awk '
  NR == 1 {
    min_available = $2
    min_free = $3
    max_total = $4
    max_single = $5
    min_disk = $6
  }
  {
    count += 1
    if ($2 < min_available) min_available = $2
    if ($3 < min_free) min_free = $3
    if ($4 > max_total) max_total = $4
    if ($5 > max_single) max_single = $5
    if ($6 < min_disk) min_disk = $6
  }
  END {
    print count, min_available, min_free, max_total, max_single, min_disk
  }
' "${SAMPLES_FILE}")
EOF

cache_kb=$(du -sk node_modules/.cache 2>/dev/null | awk '{print $1}')
build_kb=$(du -sk build 2>/dev/null | awk '{print $1}')
warning_count=$(grep -c '^\[WARNING\]' "${BUILD_LOG}" 2>/dev/null || true)

printf '%s\n' 'BENCHMARK_SUMMARY_BEGIN'
printf 'variant=rspack_persistent_cache_false\n'
printf 'exit_code=%s\n' "${exit_code}"
printf 'elapsed_seconds=%s\n' "$((end_epoch - start_epoch))"
printf 'sample_count=%s\n' "${sample_count:-0}"
printf 'min_mem_available_kb=%s\n' "${min_mem_available:-0}"
printf 'min_mem_free_kb=%s\n' "${min_mem_free:-0}"
printf 'max_node_total_kb=%s\n' "${max_node_total:-0}"
printf 'max_node_single_kb=%s\n' "${max_node_single:-0}"
printf 'start_disk_available_kb=%s\n' "${start_disk_kb}"
printf 'end_disk_available_kb=%s\n' "${end_disk_kb}"
printf 'min_disk_available_kb=%s\n' "${min_disk_available:-0}"
printf 'disk_consumed_kb=%s\n' "$((start_disk_kb - end_disk_kb))"
printf 'rspack_cache_size_kb=%s\n' "${cache_kb:-0}"
printf 'build_size_kb=%s\n' "${build_kb:-0}"
printf 'warning_count=%s\n' "${warning_count:-0}"
printf '%s\n' 'PERF_LINES_BEGIN'
grep -E '\[PERF\].*(Bundling with rspack|SSG( \(current thread\))? -|Build > zh-Hans -|\[PERF\] Build -)' "${BUILD_LOG}" || true
printf '%s\n' 'PERF_LINES_END'
if (( exit_code != 0 )); then
  printf '%s\n' 'ERROR_TAIL_BEGIN'
  tail -n 30 "${BUILD_LOG}" || true
  printf '%s\n' 'ERROR_TAIL_END'
fi
printf '%s\n' 'BENCHMARK_SUMMARY_END'

exit "${exit_code}"
