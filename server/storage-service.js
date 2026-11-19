'use strict';

const { randomUUID, createHash } = require('node:crypto');
const types = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']);

function publicUrl(base, key) {
  if (!base) throw new Error('PUBLIC_BASE_REQUIRED');
  const parsed = new URL(base);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.hostname.endsWith('.r2.cloudflarestorage.com')) throw new Error('INVALID_PUBLIC_BASE');
  return `${base.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function createStorageService({ provider = process.env.STORAGE_PROVIDER || 'supabase', supabase, r2, bucket = process.env.R2_BUCKET_NAME, publicBase = process.env.R2_PUBLIC_BASE_URL, maxBytes = 50 * 1024 * 1024, sleep = delay => new Promise(resolve => setTimeout(resolve, delay)) } = {}) {
  if (!['supabase', 'r2'].includes(provider)) throw new Error('INVALID_PROVIDER');
  const pending = new Map();
  async function upload({ body, mime, sourceBucket = 'product-images', objectKey }) {
    if (!Buffer.isBuffer(body) || !body.length || body.length > maxBytes || !types.has(mime)) throw new Error('INVALID_FILE');
    const hash = createHash('sha256').update(body).digest('hex');
    const identity = `${sourceBucket}:${mime}:${hash}`;
    if (pending.has(identity)) return pending.get(identity);
    const key = objectKey || `${sourceBucket}/${randomUUID()}`;
    if (!key.startsWith(`${sourceBucket}/`) || !/^[a-z0-9-]+\/[0-9a-f-]{36}$/i.test(key)) throw Error('INVALID_KEY');
    const operation = (async () => {
      const url = provider === 'r2' ? publicUrl(publicBase, key) : null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (provider === 'r2') {
            if (!r2 || !bucket) throw new Error('R2_NOT_CONFIGURED');
            await r2.put({ Bucket: bucket, Key: key, Body: body, ContentType: mime, Metadata: { sha256: hash, provider: 'r2', 'object-key': key, 'supabase-backup': 'none' }, IfNoneMatch: '*' });
          } else {
            const result = await supabase.storage.from(sourceBucket).upload(key, body, { contentType: mime, upsert: false });
            if (result.error) throw new Error('SUPABASE_UPLOAD_FAILED');
          }
          return { key, url: url || supabase.storage.from(sourceBucket).getPublicUrl(key).data.publicUrl, provider, backupUrl: null, sha256: hash, size: body.length, mime };
        } catch {
          if (attempt === 2) throw new Error('STORAGE_UPLOAD_FAILED');
          await sleep(100 * 2 ** attempt);
        }
      }
    })();
    pending.set(identity, operation);
    try { return await operation; } finally { pending.delete(identity); }
  }
  async function remove(key, sourceBucket = 'product-images') {
    if (!key || key.includes('..') || !key.startsWith(`${sourceBucket}/`)) throw new Error('INVALID_KEY');
    if (provider === 'r2') await r2.remove({ Bucket: bucket, Key: key });
    else {
      const result = await supabase.storage.from(sourceBucket).remove([key]);
      if (result.error) throw new Error('STORAGE_DELETE_FAILED');
    }
  }
  return { upload, remove };
}

function createR2Adapter(env = process.env, options = {}) {
  const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({ region: 'auto', maxAttempts: options.maxAttempts || 3, ...(options.signedUploads?{requestChecksumCalculation:'WHEN_REQUIRED'}:{}), endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } });
  return { put: (input, requestOptions) => client.send(new PutObjectCommand(input), requestOptions), remove: input => client.send(new DeleteObjectCommand(input)), get: (input, requestOptions) => client.send(new GetObjectCommand(input), requestOptions), async signPut(input,expiresIn=300){
    if(input.IfNoneMatch!=='*'||!Number.isSafeInteger(input.ContentLength)||input.ContentLength<1||expiresIn>300)throw Error('INVALID_SIGNED_CREATE');
    const {getSignedUrl}=require('@aws-sdk/s3-request-presigner');
    const metadataHeaders=Object.keys(input.Metadata||{}).map(key=>'x-amz-meta-'+key.toLowerCase());
    const url=await getSignedUrl(client,new PutObjectCommand(input),{expiresIn,unhoistableHeaders:new Set(metadataHeaders),signableHeaders:new Set(['content-length','content-type','if-none-match','cache-control',...metadataHeaders])});
    const signed=new URL(url).searchParams.get('X-Amz-SignedHeaders')||'';
    if(!['content-length','content-type','if-none-match',...metadataHeaders].every(header=>signed.split(';').includes(header)))throw Error('REQUIRED_SIGNED_HEADERS_MISSING');return url;
  } };
}

module.exports = { createStorageService, createR2Adapter, publicUrl };
