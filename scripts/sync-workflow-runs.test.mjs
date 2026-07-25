import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RECENT_RUN_LIMIT,
  createGlobalIndex,
  createWorkflowSnapshot,
  normalizeRun,
  retainRecentRuns,
} from './sync-workflow-runs.mjs';

function makeRun(id, options = {}) {
  const index = Number(id);
  return {
    id,
    run_number: options.runNumber ?? index,
    run_attempt: options.runAttempt ?? 1,
    name: options.name ?? 'Build and deploy Docusaurus',
    event: options.event ?? 'push',
    status: options.status ?? 'completed',
    conclusion: options.conclusion ?? 'success',
    head_branch: options.branch ?? 'main',
    head_sha: options.sha ?? `sha-${id}`,
    actor: {login: 'tester'},
    triggering_actor: {login: 'tester'},
    created_at: options.createdAt ?? `2026-07-25T00:${String(index).padStart(2, '0')}:00Z`,
    run_started_at:
      options.startedAt ?? `2026-07-25T00:${String(index).padStart(2, '0')}:10Z`,
    updated_at: options.updatedAt ?? `2026-07-25T00:${String(index).padStart(2, '0')}:30Z`,
    html_url: `https://github.com/example/repo/actions/runs/${id}`,
    jobs_url: `https://api.github.com/repos/example/repo/actions/runs/${id}/jobs`,
    logs_url: `https://api.github.com/repos/example/repo/actions/runs/${id}/logs`,
  };
}

test('retainRecentRuns keeps only the newest ten unique run IDs', () => {
  const runs = Array.from({length: 14}, (_, index) => makeRun(index + 1));
  const result = retainRecentRuns(runs.map(normalizeRun));

  assert.equal(result.length, RECENT_RUN_LIMIT);
  assert.deepEqual(
    result.map((run) => run.run_id),
    ['14', '13', '12', '11', '10', '9', '8', '7', '6', '5'],
  );
});

test('retainRecentRuns keeps the latest attempt for a duplicated run ID', () => {
  const firstAttempt = normalizeRun(makeRun(42, {runAttempt: 1, conclusion: 'failure'}));
  const secondAttempt = normalizeRun(makeRun(42, {runAttempt: 2, conclusion: 'success'}));
  const result = retainRecentRuns([firstAttempt, secondAttempt]);

  assert.equal(result.length, 1);
  assert.equal(result[0].run_attempt, 2);
  assert.equal(result[0].conclusion, 'success');
});

test('workflow snapshot exposes the latest run and latest failed run', () => {
  const workflow = {
    key: 'build',
    file: 'ci.yaml',
    name: 'Build and deploy Docusaurus',
  };
  const runs = [
    makeRun(3, {conclusion: 'success'}),
    makeRun(2, {conclusion: 'failure'}),
    makeRun(1, {conclusion: 'success'}),
  ];
  const snapshot = createWorkflowSnapshot(workflow, runs, '2026-07-25T01:00:00Z');

  assert.equal(snapshot.latest_run.run_id, '3');
  assert.equal(snapshot.latest_failed_run.run_id, '2');
  assert.equal(snapshot.retained_run_count, 3);
});

test('global index keeps the newest ten runs across tracked workflows', () => {
  const generatedAt = '2026-07-25T02:00:00Z';
  const build = createWorkflowSnapshot(
    {key: 'build', file: 'ci.yaml', name: 'Build'},
    Array.from({length: 7}, (_, index) => makeRun(index + 1)),
    generatedAt,
  );
  const update = createWorkflowSnapshot(
    {key: 'update-content', file: 'update-content.yml', name: 'Update'},
    Array.from({length: 7}, (_, index) =>
      makeRun(index + 8, {
        name: 'Update generated docs',
        conclusion: index === 5 ? 'failure' : 'success',
      }),
    ),
    generatedAt,
  );

  const index = createGlobalIndex([build, update], generatedAt);

  assert.equal(index.recent_runs.length, RECENT_RUN_LIMIT);
  assert.equal(index.latest_run.run_id, '14');
  assert.equal(index.latest_failed_run.run_id, '13');
  assert.deepEqual(
    index.recent_runs.map((run) => run.run_id),
    ['14', '13', '12', '11', '10', '9', '8', '7', '6', '5'],
  );
});
