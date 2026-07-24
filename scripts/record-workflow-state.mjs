import fsp from 'node:fs/promises';
import path from 'node:path';

const action = process.argv[2] || 'finish';
const workflowKey = sanitizeKey(process.env.WORKFLOW_KEY || 'build');
const stateDir = path.resolve(process.cwd(), '.github', 'workflow-runs', workflowKey);
const latestPath = path.join(stateDir, 'latest-run.json');
const historyPath = path.join(stateDir, 'history.json');
const latestIdPath = path.join(stateDir, 'latest-run-id.txt');
const latestUrlPath = path.join(stateDir, 'latest-run-url.txt');
const latestLogPath = path.join(stateDir, 'latest-log.txt');

function sanitizeKey(value) {
  const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'build';
}

function now() {
  return new Date().toISOString();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function runUrl(runId) {
  const repository = process.env.GITHUB_REPOSITORY || '';
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  return repository && runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : '';
}

function parseStepOutcomes() {
  try {
    const value = JSON.parse(process.env.STEP_OUTCOMES_JSON || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).map(([name, outcome]) => [String(name), String(outcome || 'not-run')]),
    );
  } catch (error) {
    console.warn(`Unable to parse STEP_OUTCOMES_JSON: ${error instanceof Error ? error.message : error}`);
    return {};
  }
}

function determineConclusion(stepOutcomes) {
  const values = Object.values(stepOutcomes);
  if (values.length === 0) return process.env.JOB_CONCLUSION || 'unknown';
  return values.every((value) => value === 'success' || value === 'skipped')
    ? 'success'
    : 'failure';
}

function secondsBetween(start, end) {
  const startMs = Date.parse(start || '');
  const endMs = Date.parse(end || '');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

function createBaseRecord(status) {
  const runId = process.env.GITHUB_RUN_ID || 'local';
  return {
    repository: process.env.GITHUB_REPOSITORY || '',
    workflow_key: workflowKey,
    workflow_file: process.env.WORKFLOW_FILE || '',
    workflow: process.env.GITHUB_WORKFLOW || '',
    job: process.env.GITHUB_JOB || '',
    run_id: runId,
    run_number: process.env.GITHUB_RUN_NUMBER || '',
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || '',
    run_url: runUrl(runId),
    actor: process.env.GITHUB_ACTOR || '',
    event: process.env.GITHUB_EVENT_NAME || '',
    branch: process.env.GITHUB_REF_NAME || '',
    head_sha: process.env.GITHUB_SHA || '',
    status,
    conclusion: null,
    started_at: now(),
    finished_at: null,
    duration_seconds: null,
    step_outcomes: {},
    log_file: `.github/workflow-runs/${workflowKey}/latest-log.txt`,
  };
}

function upsertHistory(history, record) {
  const records = Array.isArray(history) ? history.filter(Boolean) : [];
  const index = records.findIndex((item) => String(item.run_id) === String(record.run_id));
  if (index >= 0) records[index] = {...records[index], ...record};
  else records.unshift(record);

  records.sort((left, right) =>
    String(right.started_at || '').localeCompare(String(left.started_at || '')),
  );
  return records.slice(0, 10);
}

await fsp.mkdir(stateDir, {recursive: true});

let latest = await readJson(latestPath, null);
let history = await readJson(historyPath, []);
let record;

if (action === 'start') {
  record = createBaseRecord('running');
  await fsp.writeFile(
    latestLogPath,
    [
      `# ${record.workflow || workflowKey} run log`,
      `run_id: ${record.run_id}`,
      `run_url: ${record.run_url}`,
      `branch: ${record.branch}`,
      `head_sha: ${record.head_sha}`,
      `started_at: ${record.started_at}`,
      '',
    ].join('\n'),
    'utf8',
  );
} else {
  const stepOutcomes = parseStepOutcomes();
  const conclusion = determineConclusion(stepOutcomes);
  record =
    latest && String(latest.run_id) === String(process.env.GITHUB_RUN_ID)
      ? {...latest}
      : createBaseRecord('completed');

  const finishedAt = now();
  record.status = 'completed';
  record.conclusion = conclusion;
  record.finished_at = finishedAt;
  record.duration_seconds = secondsBetween(record.started_at, finishedAt);
  record.step_outcomes = stepOutcomes;

  await fsp.appendFile(
    latestLogPath,
    [
      '',
      '## Final summary',
      `finished_at: ${record.finished_at}`,
      `duration_seconds: ${record.duration_seconds ?? ''}`,
      `status: ${record.status}`,
      `conclusion: ${record.conclusion}`,
      ...Object.entries(stepOutcomes).map(([name, outcome]) => `${name}: ${outcome}`),
      '',
    ].join('\n'),
    'utf8',
  );
}

latest = record;
history = upsertHistory(history, record);

await fsp.writeFile(latestPath, `${JSON.stringify(latest, null, 2)}\n`, 'utf8');
await fsp.writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
await fsp.writeFile(latestIdPath, `${latest.run_id}\n`, 'utf8');
await fsp.writeFile(latestUrlPath, `${latest.run_url}\n`, 'utf8');

console.log(
  `Recorded ${workflowKey} run ${latest.run_id}: ${latest.status}${latest.conclusion ? `/${latest.conclusion}` : ''}`,
);
