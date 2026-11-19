'use strict';
// Deployment-scoped exception, never a Production write switch.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function configuration(env){
 if(env.VERCEL_ENV!=='preview'||env.XIQI_ACCEPTANCE_ENABLED!=='true')return null;
 const run=env.XIQI_ACCEPTANCE_RUN_ID,product=env.XIQI_ACCEPTANCE_PRODUCT_ID,inquiry=env.XIQI_ACCEPTANCE_INQUIRY_ID;
 const inquiryStorageId=env.XIQI_ACCEPTANCE_INQUIRY_STORAGE_ID||inquiry;
 if(inquiryStorageId!==inquiry&&(!/^[1-9][0-9]{0,15}$/.test(inquiryStorageId)||BigInt(inquiryStorageId)>BigInt(Number.MAX_SAFE_INTEGER)))throw Error('ACCEPTANCE_INQUIRY_STORAGE_ID_INVALID');
 const admins=(env.XIQI_ACCEPTANCE_ADMIN_IDS||'').split(',');
 const expiry=Date.parse(env.XIQI_ACCEPTANCE_EXPIRES_AT||'');
 if(![run,product,inquiry,...admins].every(x=>UUID.test(x||''))||admins.length!==2||new Set([run,product,inquiry,...admins]).size!==5||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+86400000||!env.VERCEL_PROJECT_ID||env.VERCEL_PROJECT_ID!==env.XIQI_ACCEPTANCE_PROJECT_ID||!env.VERCEL_GIT_COMMIT_REF||env.VERCEL_GIT_COMMIT_REF!==env.XIQI_ACCEPTANCE_BRANCH)throw Error('ACCEPTANCE_CONFIG_INVALID');
 const database=new URL(env.SUPABASE_URL);
 if(database.origin!=='https://qndwtogovmkuexudtnua.supabase.co'||database.pathname!=='/'||database.search||database.hash||database.username||database.password||env.R2_UPLOAD_PREFIX!=='xiqi-preview/'+run)throw Error('ACCEPTANCE_SCOPE_INVALID');
 return{run,product,inquiry,inquiryStorageId,admins,prefix:'xiqi-preview/'+run,marker:'[XiQi acceptance '+run+']'};
}
function actor(scope,id){if(!scope.admins.includes(id))throw Error('ACCEPTANCE_ADMIN_REQUIRED');}
function mediaURL(scope,env,value){
 if(value==='')return true;
 try{const base=new URL(env.R2_PUBLIC_BASE_URL),u=new URL(value);return base.protocol==='https:'&&!base.username&&!base.password&&base.pathname==='/'&&!base.search&&!base.hash&&u.origin===base.origin&&!u.search&&!u.hash&&new RegExp('^/'+scope.prefix+'/('+scope.product+'|'+scope.inquiry+')\\.(jpg|png|gif|webp|mp4)$').test(u.pathname)&&u.href===value;}catch{return false;}
}
function productPayload(scope,env,payload){
 if(!payload||Object.keys(payload).some(k=>!['name','short_desc','description','image_url','gallery','video_url','status','sort_order'].includes(k)))throw Error('ACCEPTANCE_FIELDS_DENIED');
 if(payload.status!==undefined&&payload.status!=='draft'||payload.name!==undefined&&payload.name!==scope.marker)throw Error('ACCEPTANCE_MARKER_REQUIRED');
 for(const key of ['image_url','video_url'])if(payload[key]!==undefined&&!mediaURL(scope,env,payload[key]))throw Error('ACCEPTANCE_MEDIA_DENIED');
 if(payload.gallery!==undefined&&(!Array.isArray(payload.gallery)||payload.gallery.length>2||payload.gallery.some(x=>!x||!mediaURL(scope,env,x))))throw Error('ACCEPTANCE_MEDIA_DENIED');
 return{...payload,name:scope.marker,status:'draft',sort_order:2147483647};
}
module.exports={configuration,actor,mediaURL,productPayload};
