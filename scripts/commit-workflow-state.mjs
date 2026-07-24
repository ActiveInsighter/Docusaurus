import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

const workflowKey = sanitizeKey(process.env.WORKFLOW_KEY || 'build');
const message =
  process.argv.slice(2).join(' ') || `Record ${workflowKey} workflow state [skip ci]`;
const stateDir = path.join('.github', 'workflow-runs', workflowKey);
const stateFiles = [
  'latest-run-id.txt',
  'latest-run-url.txt',
  'latest-run.json',
  'history.json',
  'latest-log.txt',
].map((fileName) => path.join(stateDir, fileName));

function sanitizeKey(value) {
  const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '') || 'build';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    encoding: 'utf8',
    ...options,
  });
  return result.status ?? 1;
}

run('git', ['config', 'user.name', 'github-actions[bot]']);
run('git', [
  'config',
  'user.email',
  '41898282+github-actions[bot]@users.noreply.github.com',
]);

const existingFiles = stateFiles.filter((file) => existsSync(file));
if (existingFiles.length === 0) {
  console.log(`No workflow state files exist for ${workflowKey}.`);
  process.exit(0);
}

run('git', ['add', ...existingFiles]);

if (run('git', ['diff', '--cached', '--quiet'], {stdio: 'ignore'}) === 0) {
  console.log(`No ${workflowKey} workflow state changes to commit.`);
  process.exit(0);
}

const commitStatus = run('git', ['commit', '-m', message]);
if (commitStatus !== 0) process.exit(commitStatus);

const branch = process.env.GITHUB_REF_NAME || 'main';
for (let attempt = 1; attempt <= 3; attempt += 1) {
  const pullStatus = run('git', ['pull', '--rebase', 'origin', branch]);
  if (pullStatus !== 0) process.exit(pullStatus);

  const pushStatus = run('git', ['push', 'origin', `HEAD:${branch}`]);
  if (pushStatus === 0) process.exit(0);

  console.warn(`Push attempt ${attempt} failed; retrying after refreshing ${branch}.`);
}

process.exit(1);
