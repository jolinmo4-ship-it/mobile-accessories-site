'use strict';
const { createHash, randomUUID } = require('node:crypto');
const { requireAdmin } = require('./admin');
const { createStorageService, createR2Adapter } = require('./storage-service');
const MAX_BYTES = 2 * 1024 * 1024;
function validateImage(body, mime) {
  const matches = {
    'image/png': body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'image/jpeg': body.length >= 3 && body[0] === 255 && body[1] === 216 && body[2] === 255,
    'image/gif': ['GIF87a', 'GIF89a'].includes(body.subarray(0, 6).toString('ascii')),
    'image/webp': body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP'
  };
  if (!body.length || body.length > MAX_BYTES || matches[mime] !== true) throw Error('INVALID_IMAGE');
}
function createImageUploadHandler({ getClient, getJournal, env = process.env, makeService = createStorageService, makeR2 = createR2Adapter, now = Date.now } = {}) {
  const requests = new Map();
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: '仅支持图片上传' });
    let client, admin;
    try { client = getClient(); admin = await requireAdmin(req, client); }
    catch { return res.status(403).json({ error: '需要管理员权限' }); }
    const provider = env.STORAGE_PROVIDER || 'supabase';
    if (!['supabase', 'r2'].includes(provider) || (provider === 'r2' && env.R2_IMAGE_UPLOAD_ENABLED !== 'true')) return res.status(503).json({ error: '图片存储尚未获准启用' });
    let bytes, mime, requestId;
    try {
      ({ mime, requestId } = req.body || {});
      const encoded = req.body?.data;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId || '') || typeof encoded !== 'string' || encoded.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Error();
      bytes = Buffer.from(encoded, 'base64');
      if (bytes.toString('base64') !== encoded) throw Error();
      validateImage(bytes, mime);
    } catch { return res.status(400).json({ error: '请选择不超过 2MiB 的 JPEG、PNG、GIF 或 WebP 图片' }); }
    const identity = `${admin}:${provider}:${requestId}`;
    const fingerprint = `${mime}:${createHash('sha256').update(bytes).digest('hex')}`;
    for (const [key, item] of requests) if (item.done && item.expires <= now()) requests.delete(key);
    const previous = requests.get(identity);
    if (previous && previous.fingerprint !== fingerprint) return res.status(409).json({ error: '上传标识已用于其他文件' });
    if (!previous && requests.size >= 100) return res.status(429).json({ error: '上传繁忙，请稍后重试' });
    if (!previous) {
      const item = { fingerprint, done: false, expires: Infinity };
      item.promise = Promise.resolve().then(async () => {
        const journal = getJournal?.(client);
        const uploadId = randomUUID();
        const objectKey = `product-images/${randomUUID()}`;
        if (journal) await journal.reserve({ id: uploadId, admin_id: admin, request_id: requestId, provider, object_key: objectKey, fingerprint, state: 'reserved' });
        const result = await makeService({ provider, supabase: client, r2: provider === 'r2' ? makeR2(env) : undefined, bucket: env.R2_BUCKET_NAME, publicBase: env.R2_PUBLIC_BASE_URL, maxBytes: MAX_BYTES }).upload({ body: bytes, mime, sourceBucket: 'product-images', objectKey });
        if (journal) await journal.uploaded(uploadId, result);
        return { ...result, uploadId: journal ? uploadId : null };
      }).then(result => {
        item.done = true; item.expires = now() + 300000;
        return result;
      }, () => { requests.delete(identity); throw Error('IMAGE_UPLOAD_FAILED'); });
      requests.set(identity, item);
    }
    try { return res.status(200).json({ asset: await requests.get(identity).promise }); }
    catch { return res.status(502).json({ error: '图片上传失败，请重试；原图片未改变' }); }
  };
}
module.exports = { createImageUploadHandler, validateImage };
