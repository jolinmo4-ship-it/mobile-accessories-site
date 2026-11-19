'use strict';
const{createClient}=require('@supabase/supabase-js');
module.exports=require('../server/admin-write').createAdminWriteHandler({getMediaClient:require('../server/acceptance-media-read'),getClient(req){
 const key=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!key||!process.env.SUPABASE_URL)throw Error('PUBLIC_DATABASE_CONFIG_REQUIRED');
 return createClient(process.env.SUPABASE_URL,key,{global:{headers:{Authorization:req.headers.authorization}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}});
