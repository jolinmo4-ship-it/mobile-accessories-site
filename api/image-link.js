'use strict';
const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('../server/admin');
const { linkUploads } = require('../server/upload-journal');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  try{require('../server/admin-write').assertWriteEnvironment(process.env);}catch{return res.status(503).json({error:'ADMIN_WRITE_ENVIRONMENT_BLOCKED'});}
  if(process.env.STORAGE_PROVIDER==='r2')return res.status(409).json({error:'USE_MANAGED_MEDIA_JOURNAL'});
  let client, admin;
  try {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    admin = await requireAdmin(req, client);
  } catch { return res.status(403).json({ error: 'ADMIN_REQUIRED' }); }
  try {
    const linked = await linkUploads(client, admin, req.body?.table, req.body?.id, req.body?.urls);
    return res.status(200).json({ linked });
  } catch { return res.status(409).json({ error: 'LINK_PENDING_RECONCILIATION' }); }
};
