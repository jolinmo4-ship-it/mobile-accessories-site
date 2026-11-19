'use strict';
// Dedicated read-only projection; never used as the catalog mutation client.
module.exports=function(){
 const{createClient}=require('@supabase/supabase-js');
 const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 return{from(table){if(table!=='r2_media_uploads')throw Error('READ_SCOPE_DENIED');return{select(columns){if(columns!=='asset_url,object_key,owner_id,state')throw Error('READ_SCOPE_DENIED');return{in(column,urls){if(column!=='asset_url'||!Array.isArray(urls)||urls.length>4)throw Error('READ_SCOPE_DENIED');return client.from(table).select(columns).in(column,urls);}};}};}};
};
