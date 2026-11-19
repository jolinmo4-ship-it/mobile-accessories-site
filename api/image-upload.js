'use strict';
const { createClient } = require('@supabase/supabase-js');
const { createImageUploadHandler } = require('../server/image-upload');
const legacyHandler = createImageUploadHandler({ getClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error('NOT_CONFIGURED');
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
} });
module.exports=(req,res)=>{try{require('../server/admin-write').assertWriteEnvironment(process.env);}catch{return res.status(503).json({error:'ADMIN_WRITE_ENVIRONMENT_BLOCKED'});}return process.env.STORAGE_PROVIDER==='r2'?res.status(409).json({error:'USE_MANAGED_MEDIA_UPLOAD_API'}):legacyHandler(req,res);};
