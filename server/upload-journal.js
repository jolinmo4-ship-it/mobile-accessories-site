'use strict';
function databaseJournal(client) {
  return {
    async reserve(record) {
      const result = await client.from('image_upload_journal').insert(record);
      if (result.error) throw Error('JOURNAL_RESERVATION_FAILED');
    },
    async uploaded(id, asset) {
      const result = await client.from('image_upload_journal').update({ state: 'uploaded', asset_url: asset.url, sha256: asset.sha256, size_bytes: asset.size, mime_type: asset.mime }).eq('id', id).eq('state', 'reserved').select('id');
      if (result.error || result.data.length !== 1) throw Error('JOURNAL_UPDATE_FAILED');
    }
  };
}
async function linkUploads(client, admin, table, id, urls) {
  if (!['products', 'categories'].includes(table) || !/^[0-9a-f-]{36}$/i.test(id || '') || !Array.isArray(urls) || urls.length > 50 || urls.some(url => typeof url !== 'string' || url.length > 2048)) throw Error('INVALID_LINK');
  const columns = table === 'products' ? 'image_url,gallery' : 'image_url';
  const record = await client.from(table).select(columns).eq('id', id).single();
  if (record.error || !record.data) throw Error('RECORD_NOT_FOUND');
  const actual = new Set([record.data.image_url, ...(record.data.gallery || [])]);
  if (urls.some(url => !actual.has(url))) throw Error('REFERENCE_MISMATCH');
  const uploads = await client.from('image_upload_journal').select('id,asset_url').eq('admin_id', admin).eq('state', 'uploaded').in('asset_url', urls);
  if (uploads.error) throw Error('JOURNAL_READ_FAILED');
  if (uploads.data.length) {
    const result = await client.from('image_upload_links').upsert(uploads.data.map(asset => ({ upload_id: asset.id, entity_table: table, entity_id: id, asset_url: asset.asset_url })), { onConflict: 'upload_id,entity_table,entity_id' });
    if (result.error) throw Error('LINK_SAVE_FAILED');
  }
  return uploads.data.length;
}
module.exports = { databaseJournal, linkUploads };
