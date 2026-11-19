'use strict';
const { randomUUID } = require('node:crypto');
const { migrateOne } = require('./migration');
function sourceLocation(value, base) {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(base).origin) return null;
    const prefix = '/storage/v1/object/public/';
    if (!url.pathname.startsWith(prefix)) return null;
    const [bucket, ...parts] = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
    if (bucket !== 'product-images' || !parts.length || parts.some(part => !part || part === '..' || part === '.')) return null;
    return { source_bucket: bucket, source_key: parts.join('/'), legacy_url: value };
  } catch { return null; }
}
async function scanPage(client, { table, after = '', limit = 50 }, base) {
  if (!['products', 'categories', 'product_images'].includes(table)) throw Error('INVALID_TABLE');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error('INVALID_LIMIT');
  if (after && !/^[0-9a-f-]{36}$/i.test(after)) throw Error('INVALID_CURSOR');
  const columns = table === 'products' ? 'id,image_url,gallery' : 'id,image_url';
  let query = client.from(table).select(columns).order('id').limit(limit);
  if (after) query = query.gt('id', after);
  const { data, error } = await query;
  if (error) throw Error('SCAN_FAILED');
  const assets = new Map();
  for (const row of data) {
    for (const url of [row.image_url, ...(Array.isArray(row.gallery) ? row.gallery : [])]) {
      const asset = sourceLocation(url, base);
      if (asset && !/\.(mp4|webm|mov|avi|m4v)$/i.test(asset.source_key)) assets.set(`${asset.source_bucket}/${asset.source_key}`, asset);
    }
  }
  if (assets.size) {
    const result = await client.from('media_assets').upsert([...assets.values()], { onConflict: 'source_bucket,source_key', ignoreDuplicates: true });
    if (result.error) throw Error('SCAN_SAVE_FAILED');
  }
  return { scanned: data.length, discovered: assets.size, after: data.at(-1)?.id || after, done: data.length < limit };
}
async function runBatch({ client, source, destination, limit = 10, concurrency = 2 }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3) throw Error('INVALID_BATCH');
  const { data: assets, error } = await client.from('media_assets').select('*').eq('status', 'pending').order('created_at').limit(limit);
  if (error) throw Error('QUEUE_FAILED');
  let cursor = 0;
  const results = [];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < assets.length) {
      const asset = assets[cursor++];
      const token = randomUUID();
      const repository = {
        async claim(id) {
          const result = await client.from('media_assets').update({ status: 'processing', lease_token: token, lease_until: new Date(Date.now() + 120000).toISOString(), attempts: asset.attempts + 1 }).eq('id', id).eq('status', 'pending').select('id');
          if (result.error) throw Error('CLAIM_FAILED');
          return result.data.length === 1;
        },
        async save(id, values) {
          const result = await client.from('media_assets').update({ ...values, lease_token: null, lease_until: null }).eq('id', id).eq('status', 'processing').eq('lease_token', token).select('id');
          if (result.error || result.data.length !== 1) throw Error('SAVE_FAILED');
        },
        complete(id, values) { return this.save(id, values); },
        fail(id, code) { return this.save(id, { status: asset.attempts < 2 ? 'pending' : 'failed', failure_code: code }); }
      };
      results.push(await migrateOne({ asset, repository, source, destination }));
    }
  }));
  return { processed: results.length, verified: results.filter(result => result.verified).length, skipped: results.filter(result => result.skipped).length };
}
module.exports = { sourceLocation, scanPage, runBatch };
