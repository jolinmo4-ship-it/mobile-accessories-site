'use strict';
function selectMedia(asset, enabled = process.env.R2_READ_ENABLED === 'true') {
  const valid = asset.status === 'verified' && /^https:\/\//.test(asset.r2_public_url || '') && !new URL(asset.r2_public_url).hostname.endsWith('.r2.cloudflarestorage.com');
  return { primary: enabled && valid ? asset.r2_public_url : asset.legacy_url, fallback: asset.legacy_url };
}
module.exports = { selectMedia };
