'use strict';
const { sourceIdentity } = require('./acceptance-core');
const { publicUrl } = require('./storage-service');
function resolveMedia(urls, manifest, base, { allowVideo = false } = {}) {
  const normalizedBase = publicUrl(base, '__probe__').slice(0, -'/__probe__'.length);
  if (![1,2].includes(manifest.version) || manifest.sourceProject !== 'qndwtogovmkuexudtnua' || manifest.targetBucket !== 'xiqi-media' || !Array.isArray(manifest.objects)) throw Error('UNAPPROVED_MAP');
  if (manifest.publicBaseUrl !== normalizedBase) throw Error('PUBLIC_DOMAIN_NOT_VALIDATED');
  const index = new Map();
  for (const item of manifest.objects) {
    if (item.verified !== true || item.publicVerified !== true || !/^[a-f0-9]{64}$/.test(item.sha256 || '') || !Number.isSafeInteger(item.size) || item.size < 1 || !['product-images','factory-videos'].includes(item.bucket) || !item.key || item.key.split('/').some(part => !part || ['.','..'].includes(part)) || item.key !== item.targetKey) throw Error('INVALID_MAP_ITEM');
    const identity = `${item.bucket}/${item.key}`;
    if (index.has(identity)) throw Error('DUPLICATE_MAP_ITEM');
    if (item.variant) {
      const variant=item.variant;
      if(manifest.version!==2||!item.mime.startsWith('video/')||variant.sourceSha256!==item.sha256||variant.key!==`compatible-videos/${item.sha256}/h264-crf18-v1.mp4`||variant.codec!=='h264'||variant.mime!=='video/mp4'||variant.verified!==true||variant.publicVerified!==true||!/^[a-f0-9]{64}$/.test(variant.sha256||'')||!Number.isSafeInteger(variant.size)||variant.size<1)throw Error('UNVERIFIED_VIDEO_VARIANT');
    }
    index.set(identity, item);
  }
  const mappings = Object.create(null);
  for (const original of urls) {
    try {
      const source = sourceIdentity(original);
      const item = index.get(`${source.bucket}/${source.key}`);
      if (item && (allowVideo || !item.mime?.startsWith('video/'))) {
        if(item.mime.startsWith('video/')&&item.videoCodec==='hevc'&&!item.variant)continue;
        mappings[original] = publicUrl(base, item.variant?.key || item.targetKey);
      }
    } catch {}
  }
  return mappings;
}
function createMediaResolver({ env = process.env, loadManifest } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    const urls = req.body?.urls;
    if (!Array.isArray(urls) || urls.length > 50 || urls.some(url => typeof url !== 'string' || url.length > 2048)) return res.status(400).json({ error: 'INVALID_URLS' });
    if (env.R2_READ_ENABLED !== 'true') return res.status(200).json({ enabled: false, mappings: {} });
    try {
      return res.status(200).json({ enabled: true, mappings: resolveMedia(urls, loadManifest(), env.R2_PUBLIC_BASE_URL, { allowVideo: env.R2_VIDEO_READ_ENABLED === 'true' }) });
    } catch { return res.status(200).json({ enabled: false, mappings: {}, reason: 'MAP_UNAVAILABLE_KEEP_ORIGINAL' }); }
  };
}
module.exports = { resolveMedia, createMediaResolver };
