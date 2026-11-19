'use strict';
// Preview-only, authenticated, read-only diagnostics. Never signs or sends S3
// commands, invokes a mutating RPC, or returns credentials/raw database errors.
const {requireAdmin}=require('./admin');
async function diagnose(req,res,{env=process.env,client,fetcher=fetch}={}){
 if(env.VERCEL_ENV!=='preview')return res.status(404).json({error:'NOT_FOUND'});
 let actor;try{actor=await requireAdmin(req,client);if(!(env.XIQI_ACCEPTANCE_ADMIN_IDS||'').split(',').includes(actor))throw Error();}catch{return res.status(403).json({error:'ADMIN_REQUIRED'});}
 const prefix='xiqi-preview/'+env.XIQI_ACCEPTANCE_RUN_ID;
 if(!/^xiqi-preview\/[a-f0-9-]{36}$/.test(prefix)||env.R2_UPLOAD_PREFIX!==prefix)return res.status(409).json({error:'TEST_SCOPE_INVALID'});
 const issues=[];for(const[name,pattern]of [['R2_ACCOUNT_ID',/^[a-f0-9]{32}$/],['R2_ACCESS_KEY_ID',/^[a-f0-9]{32}$/],['R2_SECRET_ACCESS_KEY',/^[a-f0-9]{64}$/]])if(!pattern.test(env[name]||''))issues.push({name,error:'FORMAT_OR_MISSING'});
 try{const u=new URL(env.R2_ENDPOINT);if(u.protocol!=='https:'||u.hostname!==env.R2_ACCOUNT_ID+'.r2.cloudflarestorage.com'||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))issues.push({name:'R2_ENDPOINT',error:'ACCOUNT_ENDPOINT_MISMATCH'});}catch{issues.push({name:'R2_ENDPOINT',error:'INVALID_URL'});}
 let rows=[],journalError=null;
 try{const r=await client.from('r2_media_uploads').select('id,state,sign_until,failure_code').in('id',[env.XIQI_ACCEPTANCE_PRODUCT_ID,env.XIQI_ACCEPTANCE_INQUIRY_ID]).eq('owner_id',actor).like('object_key',prefix+'/%');if(r.error)journalError=/^[A-Z0-9_]{1,32}$/.test(r.error.code||'')?r.error.code:'READ_REJECTED';else rows=(r.data||[]).map(x=>({slot:x.id===env.XIQI_ACCEPTANCE_PRODUCT_ID?'image':'video',state:x.state,signatureWasIssued:!!x.sign_until,failureCode:/^[A-Z_]{1,64}$/.test(x.failure_code||'')?x.failure_code:null}));}catch{journalError='READ_UNAVAILABLE';}
 let schemaStatus=null,rpcPresent=null,rpcArgNames=[];
 try{const u=new URL('/rest/v1/',env.SUPABASE_URL);if(u.origin!=='https://qndwtogovmkuexudtnua.supabase.co')throw Error();const r=await fetcher(u,{method:'GET',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,Accept:'application/openapi+json'},redirect:'error',signal:AbortSignal.timeout(10000)});schemaStatus=r.status;if(r.ok){const d=await r.json(),p=d.paths?.['/rpc/r2_media_transition']?.post;rpcPresent=!!p;rpcArgNames=Object.keys(p?.parameters?.find(x=>x.in==='body')?.schema?.properties||{}).filter(x=>/^[a-z_]{1,40}$/.test(x));}}catch{schemaStatus='UNAVAILABLE';}
 return res.status(200).json({readOnly:true,configurationIssues:issues,journalError,scopedRows:rows,schemaStatus,rpcPresent,rpcArgNames});
}
module.exports={diagnose};
