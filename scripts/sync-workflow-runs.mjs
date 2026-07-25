import fsp from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const RECENT_RUN_LIMIT = 10;

export const TRACKED_WORKFLOWS = Object.freeze([
  {
    key: 'build',
    file: 'ci.yaml',
    name: 'Build and deploy Docusaurus',
  },
  {
    key: 'update-content',
    file: 'update-content.yml',
    name: 'Update generated docs',
  },
  {
    key: 'docs-ui-visual',
    file: 'navbar-visual.yml',
    name: 'Verify documentation UI visuals',
  },
]);

const FAILURE_CONCLUSIONS = new Set([
  'action_required',
  'cancelled',
  'failure',
  'stale',
  'startup_failure',
  'timed_out',
]);

function required(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function toTimestamp(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareRuns(left, right) {
  const timeDifference =
    toTimestamp(right.run_started_at || right.created_at) -
    toTimestamp(left.run_started_at || left.created_at);
  if (timeDifference !== 0) return timeDifference;
  return Number(right.run_number || 0) - Number(left.run_number || 0);
}

export function normalizeRun(run) {
  return {
    run_id: String(run.id ?? ''),
    run_number: Number(run.run_number ?? 0),
    run_attempt: Number(run.run_attempt ?? 1),
    workflow: String(run.name || run.workflow_name || ''),
    event: String(run.event || ''),
    status: String(run.status || ''),
    conclusion: run.conclusion == null ? null : String(run.conclusion),
    branch: String(run.head_branch || ''),
    head_sha: String(run.head_sha || ''),
    actor: String(run.actor?.login || ''),
    triggering_actor: String(run.triggering_actor?.login || ''),
    created_at: run.created_at || null,
    run_started_at: run.run_started_at || null,
    updated_at: run.updated_at || null,
    run_url: String(run.html_url || ''),
    jobs_url: String(run.jobs_url || ''),
    logs_url: String(run.logs_url || ''),
  };
}

export function retainRecentRuns(runs, limit = RECENT_RUN_LIMIT) {
  const uniqueRuns = new Map();
  for (const rawRun of Array.isArray(runs) ? runs : []) {
    const run = rawRun?.run_id ? rawRun : normalizeRun(rawRun || {});
    if (!run.run_id) continue;

    const existing = uniqueRuns.get(run.run_id);
    if (!existing || Number(run.run_attempt || 0) >= Number(existing.run_attempt || 0)) {
      uniqueRuns.set(run.run_id, run);
    }
  }

  return [...uniqueRuns.values()].sort(compareRuns).slice(0, limit);
}

export function isFailedRun(run) {
  return FAILURE_CONCLUSIONS.has(String(run?.conclusion || '').toLowerCase());
}

export function createWorkflowSnapshot(workflow, runs, generatedAt) {
  const recentRuns = retainRecentRuns(runs);
  const failedRuns = recentRuns.filter(isFailedRun);

  return {
    schema_version: 1,
    generated_at: generatedAt,
    workflow_key: workflow.key,
    workflow_file: workflow.file,
    workflow: workflow.name,
    retained_run_count: recentRuns.length,
    retention_limit: RECENT_RUN_LIMIT,
    latest_run: recentRuns[0] || null,
    latest_failed_run: failedRuns[0] || null,
    recent_runs: recentRuns,
  };
}

export function createGlobalIndex(snapshots, generatedAt) {
  const recentRuns = retainRecentRuns(
    snapshots.flatMap((snapshot) =>
      snapshot.recent_runs.map((run) => ({
        ...run,
        workflow_key: snapshot.workflow_key,
        workflow_file: snapshot.workflow_file,
      })),
    ),
  );
  const failedRuns = recentRuns.filter(isFailedRun);

  return {
    schema_version: 1,
    generated_at: generatedAt,
    retention: {
      per_workflow: RECENT_RUN_LIMIT,
      global: RECENT_RUN_LIMIT,
    },
    latest_run: recentRuns[0] || null,
    latest_failed_run: failedRuns[0] || null,
    recent_runs: recentRuns,
    workflows: snapshots.map((snapshot) => ({
      workflow_key: snapshot.workflow_key,
      workflow_file: snapshot.workflow_file,
      workflow: snapshot.workflow,
      retained_run_count: snapshot.retained_run_count,
      latest_run_id: snapshot.latest_run?.run_id || null,
      latest_failed_run_id: snapshot.latest_failed_run?.run_id || null,
    })),
  };
}

async function githubJson(url, token, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'docusaurus-workflow-run-index',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status} for ${url}: ${body.slice(0, 800)}`);
  }

  return response.json();
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(filePath, lines) {
  const content = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  await fsp.writeFile(filePath, content, 'utf8');
}

function runIds(runs) {
  return runs.map((run) => run.run_id);
}

function runTable(runs) {
  return runs.map((run) =>
    [
      run.workflow_key || '',
      run.run_id,
      run.conclusion || run.status || 'unknown',
      run.run_url,
    ].join('\t'),
  );
}

async function writeWorkflowSnapshot(outputRoot, snapshot) {
  const workflowDir = path.join(outputRoot, snapshot.workflow_key);
  await fsp.mkdir(workflowDir, {recursive: true});

  await Promise.all([
    writeJson(path.join(workflowDir, 'recent-runs.json'), snapshot.recent_runs),
    writeJson(path.join(workflowDir, 'history.json'), snapshot.recent_runs),
    writeJson(path.join(workflowDir, 'latest-run.json'), snapshot.latest_run),
    writeJson(path.join(workflowDir, 'latest-failed-run.json'), snapshot.latest_failed_run),
    writeText(path.join(workflowDir, 'recent-run-ids.txt'), runIds(snapshot.recent_runs)),
    writeText(
      path.join(workflowDir, 'failed-run-ids.txt'),
      runIds(snapshot.recent_runs.filter(isFailedRun)),
    ),
    writeText(
      path.join(workflowDir, 'latest-run-id.txt'),
      snapshot.latest_run ? [snapshot.latest_run.run_id] : [],
    ),
    writeText(
      path.join(workflowDir, 'latest-run-url.txt'),
      snapshot.latest_run ? [snapshot.latest_run.run_url] : [],
    ),
    writeText(
      path.join(workflowDir, 'latest-failed-run-id.txt'),
      snapshot.latest_failed_run ? [snapshot.latest_failed_run.run_id] : [],
    ),
  ]);
}

export async function syncWorkflowRuns({
  repository,
  token,
  outputRoot = path.resolve(process.cwd(), '.github', 'workflow-runs'),
  workflows = TRACKED_WORKFLOWS,
  fetchImpl = fetch,
  generatedAt = new Date().toISOString(),
} = {}) {
  const normalizedRepository = required(repository, 'repository');
  const normalizedToken = required(token, 'token');
  const snapshots = [];

  for (const workflow of workflows) {
    const workflowId = encodeURIComponent(workflow.file);
    const url =
      `https://api.github.com/repos/${normalizedRepository}/actions/workflows/` +
      `${workflowId}/runs?per_page=${RECENT_RUN_LIMIT}`;
    const payload = await githubJson(url, normalizedToken, fetchImpl);
    const snapshot = createWorkflowSnapshot(workflow, payload.workflow_runs || [], generatedAt);
    snapshots.push(snapshot);
  }

  await fsp.mkdir(outputRoot, {recursive: true});
  for (const snapshot of snapshots) {
    await writeWorkflowSnapshot(outputRoot, snapshot);
  }

  const globalIndex = createGlobalIndex(snapshots, generatedAt);
  await Promise.all([
    writeJson(path.join(outputRoot, 'index.json'), globalIndex),
    writeJson(path.join(outputRoot, 'recent-runs.json'), globalIndex.recent_runs),
    writeJson(path.join(outputRoot, 'latest-run.json'), globalIndex.latest_run),
    writeJson(path.join(outputRoot, 'latest-failed-run.json'), globalIndex.latest_failed_run),
    writeText(path.join(outputRoot, 'recent-run-ids.txt'), runIds(globalIndex.recent_runs)),
    writeText(
      path.join(outputRoot, 'failed-run-ids.txt'),
      runIds(globalIndex.recent_runs.filter(isFailedRun)),
    ),
    writeText(path.join(outputRoot, 'recent-runs.tsv'), runTable(globalIndex.recent_runs)),
    writeText(
      path.join(outputRoot, 'latest-failed-run-id.txt'),
      globalIndex.latest_failed_run ? [globalIndex.latest_failed_run.run_id] : [],
    ),
  ]);

  return globalIndex;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  syncWorkflowRuns({
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
  })
    .then((index) => {
      const summary = index.workflows
        .map(
          (workflow) =>
            `${workflow.workflow_key}: latest=${workflow.latest_run_id || 'none'}, ` +
            `latest_failed=${workflow.latest_failed_run_id || 'none'}`,
        )
        .join('; ');
      console.log(`Synced workflow run index (${summary})`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack : error);
      process.exitCode = 1;
    });
}
