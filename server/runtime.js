'use strict';
const { createR2Adapter, publicUrl } = require('./storage-service');
const { createHash } = require('node:crypto');
const { sourceLocation } = require('./batch');
const MAX = 10 * 1024 * 1024;
async function boundedBody(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX) { stream.destroy?.(); throw Error('FILE_TOO_LARGE'); }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
function migrationAdapters(client) {
  const r2 = createR2Adapter();
  const bucket = process.env.R2_BUCKET_NAME;
  return {
    source: { async read(asset) {
      const location = sourceLocation(asset.legacy_url, process.env.SUPABASE_URL);
      if (!location || location.source_bucket !== asset.source_bucket || location.source_key !== asset.source_key) throw Error('SOURCE_SCOPE_INVALID');
      const response = await fetch(asset.legacy_url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok || Number(response.headers.get('content-length')) > MAX) throw Error('SOURCE_DOWNLOAD_FAILED');
      const mime = response.headers.get('content-type')?.split(';')[0].toLowerCase();
      if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) throw Error('UNSUPPORTED_MIME');
      return { body: await boundedBody(response.body), mime };
    } },
    destination: {
      async upload({ body, mime, sourceBucket, sourceIdentity }) {
        const hash = createHash('sha256').update(body).digest('hex');
        const identity = createHash('sha256').update(sourceIdentity || sourceBucket).digest('hex');
        const key = `migration/${sourceBucket}/${identity}/${hash}`;
        const url = publicUrl(process.env.R2_PUBLIC_BASE_URL, key);
        try { await r2.put({ Bucket: bucket, Key: key, Body: body, ContentType: mime, IfNoneMatch: '*' }); }
        catch (error) { if (error?.$metadata?.httpStatusCode !== 412) throw error; }
        return { key, url };
      },
      async read(key) {
        const result = await r2.get({ Bucket: bucket, Key: key });
        return { body: await boundedBody(result.Body), mime: result.ContentType?.split(';')[0].toLowerCase() };
      },
      async readPublic(url) {
        const base = new URL(process.env.R2_PUBLIC_BASE_URL);
        const parsed = new URL(url);
        if (parsed.origin !== base.origin || !parsed.pathname.startsWith(base.pathname.replace(/\/$/, '') + '/migration/')) throw Error('PUBLIC_SCOPE_INVALID');
        const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw Error('PUBLIC_READ_FAILED');
        return { body: await boundedBody(response.body), mime: response.headers.get('content-type')?.split(';')[0].toLowerCase() };
      }
    }
  };
}
module.exports = { migrationAdapters, boundedBody };
