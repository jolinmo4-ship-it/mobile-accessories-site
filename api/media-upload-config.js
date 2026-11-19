'use strict';
module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if(req.query?.diagnostics==='1'){
    if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({error:'NOT_FOUND'});
    try{const{createClient}=require('@supabase/supabase-js');const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});return require('../server/managed-media-read-diagnostic').diagnose(req,res,{client});}catch{return res.status(503).json({error:'READ_DIAGNOSTIC_UNAVAILABLE'});}
  }
  // Public capability only. Never return credentials, endpoints or account identifiers.
  const r2=process.env.STORAGE_PROVIDER==='r2',enabled=r2&&process.env.R2_MEDIA_WRITE_ENABLED==='true';
  return res.status(200).json({serverImageUploads:enabled&&process.env.R2_IMAGE_UPLOAD_ENABLED==='true',serverVideoUploads:enabled&&process.env.R2_VIDEO_UPLOAD_ENABLED==='true',mediaUploadV2:enabled,storageProvider:process.env.STORAGE_PROVIDER||'supabase'});
};
