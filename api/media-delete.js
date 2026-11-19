'use strict';
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if(process.env.STORAGE_PROVIDER==='r2'&&process.env.R2_MEDIA_WRITE_ENABLED==='true'){
    if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
    try{
      require('../server/managed-media').scope(process.env);
      const {createClient}=require('@supabase/supabase-js'),{requireAdmin}=require('../server/admin');
      const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});await requireAdmin(req,client);
      const {table,id}=req.body||{};if(!['products','categories','factory_media'].includes(table)||!(/^[a-f0-9-]{36}$/i.test(id||'')))return res.status(400).json({error:'INVALID_RECORD'});
      const result=await client.from(table).select('id').eq('id',id).single();if(result.error||!result.data)return res.status(404).json({error:'RECORD_NOT_FOUND'});
      return res.status(200).json({allowed:true,physicalFilesRetained:true});
    }catch{return res.status(403).json({error:'ADMIN_OR_SCOPE_REQUIRED'});}
  }
  return res.status(423).json({ error: '迁移保留期禁止删除媒体和关联记录；原文件将保留用于回滚。', code: 'MEDIA_RETENTION_LOCKED' });
};
