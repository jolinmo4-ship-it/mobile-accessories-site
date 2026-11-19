'use strict';
const{createClient}=require('@supabase/supabase-js');const{createManagedMediaHandler}=require('../server/managed-media');const{createR2Adapter}=require('../server/storage-service');
module.exports=createManagedMediaHandler({getClient(){if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('NOT_CONFIGURED');return createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});},getAdapter:()=>createR2Adapter(process.env,{signedUploads:true,maxAttempts:1})});
module.exports.config={maxDuration:300};
