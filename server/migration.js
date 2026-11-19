'use strict';
const { createHash } = require('node:crypto');
const digest = body => createHash('sha256').update(body).digest('hex');
async function verifyMedia(source, target) {
  if (source.body.length !== target.body.length || source.mime !== target.mime || digest(source.body) !== digest(target.body)) throw new Error('INTEGRITY_FAILED');
  return digest(source.body);
}
async function migrateOne({ asset, repository, source, destination, strict = false }) {
  if (!await repository.claim(asset.id)) return { skipped: true };
  try {
    const original = await source.read(asset);
    if (strict && (!asset.expected || digest(original.body) !== asset.expected.sha256 || original.body.length !== asset.expected.size || original.mime !== asset.expected.mime)) throw Error('SOURCE_CHANGED');
    const uploaded = await destination.upload({ body: original.body, mime: original.mime, sourceBucket: asset.source_bucket, sourceIdentity: `${asset.source_bucket}/${asset.source_key}` });
    const downloaded = await destination.read(uploaded.key);
    const sha256 = await verifyMedia(original, downloaded);
    if (strict) {
      await verifyMedia(original, await destination.readPublic(uploaded.url));
      await verifyMedia(original, await source.read(asset));
    }
    await repository.complete(asset.id, { r2_object_key: uploaded.key, r2_public_url: uploaded.url, sha256, size_bytes: original.body.length, mime_type: original.mime, status: 'verified', migrated_at: new Date().toISOString(), failure_code: null });
    return { verified: true };
  } catch {
    await repository.fail(asset.id, 'MIGRATION_FAILED');
    return { verified: false };
  }
}
module.exports = { migrateOne, verifyMedia };
