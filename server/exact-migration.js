'use strict';
const { randomUUID, createHash } = require('node:crypto');
const { migrateOne } = require('./migration');
function selectFive(manifest, selections) {
  if (!Array.isArray(selections) || selections.length !== 5) throw Error('EXACTLY_FIVE_REQUIRED');
  const identities = new Set();
  const assets = selections.map(selection => {
    const identity = `${selection.bucket}/${selection.key}`;
    if (identities.has(identity)) throw Error('DUPLICATE_SELECTION');
    identities.add(identity);
    const file = manifest.files.find(item => item.source_bucket === selection.bucket && item.source_key === selection.key);
    if (!file || !file.references.some(ref => ref.id === selection.referenceId && ref.table === selection.table)) throw Error('REFERENCE_NOT_IN_MANIFEST');
    if (!selection.expected || !/^[a-f0-9]{64}$/i.test(selection.expected.sha256) || !Number.isSafeInteger(selection.expected.size) || selection.expected.size < 1 || selection.expected.size > 10485760 || !/^image\/(png|jpeg|gif|webp)$/.test(selection.expected.mime)) throw Error('SOURCE_SNAPSHOT_REQUIRED');
    return { ...structuredClone(file), id: randomUUID(), expected: selection.expected, status: 'pending', attempts: 0 };
  });
  const planHash = createHash('sha256').update(JSON.stringify(assets.map(({ id, ...asset }) => asset))).digest('hex');
  return { id: randomUUID(), planHash, assets };
}
async function runExact({ runId, repository, source, destination, retryFailed = false }) {
  const token = randomUUID();
  if (!await repository.acquire(runId, token)) throw Error('RUN_BUSY');
  try {
    const run = await repository.load(runId, token);
    if (run.assets.length !== 5) throw Error('INVALID_RUN');
    for (const asset of run.assets) {
      if (await repository.paused(runId, token)) break;
      if (asset.status === 'verified' || (asset.status === 'failed' && !retryFailed)) continue;
      const checkpoint = async () => repository.save(runId, token, run);
      const fileRepository = {
        async claim() { asset.status = 'processing'; asset.attempts++; await checkpoint(); return true; },
        async complete(id, result) { Object.assign(asset, result, { failure_code: null }); await checkpoint(); },
        async fail() { asset.status = asset.attempts < 3 ? 'pending' : 'failed'; asset.failure_code = 'COPY_OR_VERIFICATION_FAILED'; await checkpoint(); }
      };
      await migrateOne({ asset, repository: fileRepository, source, destination, strict: true });
    }
    return { verified: run.assets.filter(asset => asset.status === 'verified').length, remaining: run.assets.filter(asset => asset.status !== 'verified').length };
  } finally { await repository.release(runId, token); }
}
function databaseRuns(client) {
  const valid = result => { if (result.error || !result.data?.length) throw Error('RUN_STATE_CONFLICT'); return result.data[0]; };
  return {
    async create(plan) { valid(await client.from('r2_exact_runs').insert({ id: plan.id, plan }).select('id')); },
    async acquire(id, token) {
      const result = await client.from('r2_exact_runs').update({ lease_token: token, lease_until: new Date(Date.now() + 300000).toISOString() }).eq('id', id).or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select('id');
      if (result.error) throw Error('RUN_CLAIM_FAILED'); return result.data.length === 1;
    },
    async load(id, token) { return valid(await client.from('r2_exact_runs').select('plan').eq('id', id).eq('lease_token', token)).plan; },
    async paused(id, token) { return valid(await client.from('r2_exact_runs').select('paused').eq('id', id).eq('lease_token', token)).paused; },
    async save(id, token, plan) { valid(await client.from('r2_exact_runs').update({ plan, lease_until: new Date(Date.now() + 300000).toISOString() }).eq('id', id).eq('lease_token', token).select('id')); },
    async release(id, token) { const result = await client.from('r2_exact_runs').update({ lease_token: null, lease_until: null }).eq('id', id).eq('lease_token', token); if (result.error) throw Error('RELEASE_FAILED'); }
  };
}
module.exports = { selectFive, runExact, databaseRuns };
