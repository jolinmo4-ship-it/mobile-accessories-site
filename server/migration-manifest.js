'use strict';
const { sourceLocation } = require('./batch');
function buildManifest(records, base) {
  const files = new Map();
  const manual = [];
  const skippedVideos = [];
  for (const record of records) {
    if (!['products', 'categories', 'product_images'].includes(record.table)) throw Error('INVALID_ENTITY');
    for (const [field, values] of [['image_url', [record.image_url]], ['gallery', record.table === 'products' ? record.gallery || [] : []]]) {
      for (const [index, url] of values.entries()) {
        if (!url) continue;
        const reference = { table: record.table, id: record.id, field, index, oldUrl: url };
        const source = sourceLocation(url, base);
        if (!source) { manual.push({ ...reference, reason: 'EXTERNAL_LOCAL_OR_UNSUPPORTED_URL' }); continue; }
        if (/\.(mp4|webm|mov|avi|m4v)$/i.test(source.source_key)) { skippedVideos.push(reference); continue; }
        const identity = `${source.source_bucket}/${source.source_key}`;
        if (!files.has(identity)) files.set(identity, { ...source, references: [], eligibleAfterMetadataCheck: true });
        files.get(identity).references.push(reference);
      }
    }
  }
  return { files: [...files.values()], manual, skippedVideos, uniqueFiles: files.size, referenceCount: [...files.values()].reduce((sum, file) => sum + file.references.length, 0) };
}
function reconcileManifest(manifest, verified) {
  const expected = new Set(manifest.files.map(file => `${file.source_bucket}/${file.source_key}`));
  const identities = verified.map(file => `${file.source_bucket}/${file.source_key}`);
  const duplicates = identities.filter((key, index) => identities.indexOf(key) !== index);
  const received = new Set(identities);
  const invalid = verified.filter(file => file.status !== 'verified' || !/^[a-f0-9]{64}$/i.test(file.sha256 || '') || !Number.isSafeInteger(file.size_bytes) || file.size_bytes < 1 || !/^image\/(jpeg|png|gif|webp)$/.test(file.mime_type || ''));
  const missing = [...expected].filter(key => !received.has(key));
  const unexpected = [...received].filter(key => !expected.has(key));
  return { pass: !missing.length && !unexpected.length && !duplicates.length && !invalid.length, expected: expected.size, received: received.size, missing, unexpected, duplicates, invalidCount: invalid.length };
}
module.exports = { buildManifest, reconcileManifest };
