'use strict';
const SOURCE = 'https://qndwtogovmkuexudtnua.supabase.co';
const BUCKETS = ['product-images', 'factory-videos'];
function readonlyFetch(fetcher = fetch) {
  return async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (options.method || 'GET').toUpperCase();
    const select = /^\/rest\/v1\/(products|categories|factory_media)$/.test(url.pathname) && method === 'GET';
    const list = BUCKETS.some(bucket => url.pathname === `/storage/v1/object/list/${bucket}`) && method === 'POST';
    if (url.origin !== SOURCE || (!select && !list)) throw Error('READONLY_PATH_REJECTED');
    return fetcher(input, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
  };
}
function sourceIdentity(value) {
  const url = new URL(value);
  if (![SOURCE, 'https://qndwtogovmkuexudtnua.storage.supabase.co'].includes(url.origin) || url.username || url.password || url.hash) throw Error('SOURCE_URL_REJECTED');
  const prefix = '/storage/v1/object/public/';
  if (!url.pathname.startsWith(prefix)) throw Error('SOURCE_PATH_REJECTED');
  const parts = url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
  if (!BUCKETS.includes(parts[0]) || parts.some(part => !part || ['.','..'].includes(part) || part.includes('/') || part.includes('\\'))) throw Error('SOURCE_KEY_REJECTED');
  return { bucket: parts.shift(), key: parts.join('/') };
}
function mediaReferences(tables) {
  const refs = [];
  for (const [table, rows] of Object.entries(tables)) for (const row of rows) {
    if (row.gallery != null && !Array.isArray(row.gallery)) throw Error('GALLERY_SHAPE_INVALID');
    const values = [['image_url', row.image_url, 0], ['video_url', row.video_url, 0]];
    (row.gallery || []).forEach((url, index) => values.push(['gallery', url, index]));
    for (const [field, url, index] of values) if (url) refs.push({ table, id: row.id, field, index, oldUrl: url, sortOrder: row.sort_order, category: row.category ?? null, ...sourceIdentity(url) });
  }
  return refs;
}
function reconcile(refs, objects, copies) {
  const sources = new Map(objects.map(item => [`${item.bucket}/${item.key}`, item]));
  const targets = new Map(copies.map(item => [`${item.bucket}/${item.key}`, item]));
  const errors = [];
  const mappings = refs.map(ref => {
    const id = `${ref.bucket}/${ref.key}`, source = sources.get(id), copy = targets.get(id);
    if (!source || !copy || copy.status !== 'verified' || source.sizeBytes !== copy.sizeBytes || copy.targetKey !== ref.key || copy.targetBucket !== 'xiqi-media' || !/^[a-f0-9]{64}$/.test(copy.sha256 || '')) errors.push({ id, type: 'MISSING_OR_UNVERIFIED_MAPPING' });
    return { ...ref, targetKey: copy?.targetKey, sha256: copy?.sha256, mime: copy?.mime };
  });
  return { mappings, errors };
}
module.exports = { SOURCE, BUCKETS, readonlyFetch, sourceIdentity, mediaReferences, reconcile };
