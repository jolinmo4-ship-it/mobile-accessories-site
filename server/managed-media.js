'use strict';
const{randomUUID,createHash}=require('node:crypto');
const{requireAdmin}=require('./admin');const{publicUrl}=require('./storage-service');const{validateImage}=require('./image-upload');const{mp4Inspector}=require('./media-format');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function scope(env,allowAcceptance=false){if(env.STORAGE_PROVIDER!=='r2'||env.R2_MEDIA_WRITE_ENABLED!=='true'||env.R2_BUCKET_NAME!=='xiqi-media')throw Error('R2_MEDIA_DISABLED');const prod=env.VERCEL_ENV==='production',prefix=env.R2_UPLOAD_PREFIX;if(prod){if(prefix!=='managed-media/v2')throw Error('UPLOAD_SCOPE_INVALID');}else{let database;try{database=new URL(env.SUPABASE_URL);}catch{throw Error('ISOLATED_PROJECT_AND_PREFIX_REQUIRED');}if(database.protocol!=='https:'||database.username||database.password||(database.hostname.startsWith('qndwtogovmkuexudtnua.')&&!(allowAcceptance&&require('./acceptance-scope').configuration(env)))||!/^xiqi-preview\/[a-f0-9-]{36}$/.test(prefix||''))throw Error('ISOLATED_PROJECT_AND_PREFIX_REQUIRED');}publicUrl(env.R2_PUBLIC_BASE_URL,'probe');return prefix;}
const PUBLIC_ERRORS=new Set(['REQUEST_FINGERPRINT_CONFLICT','MEDIA_STILL_REFERENCED','SIGNED_URL_RETENTION','NOT_UPLOADABLE','NOT_COMPLETABLE','OBJECT_METADATA_MISMATCH','OBJECT_INTEGRITY_FAILED','H264_MP4_REQUIRED','AAC_AUDIO_REQUIRED','ISOLATED_PROJECT_AND_PREFIX_REQUIRED','R2_MEDIA_DISABLED']);
function databaseMediaJournal(client){return{async transition(action,actor,payload){const{data,error}=await client.rpc('r2_media_transition',{p_action:action,p_actor:actor,p_payload:payload});if(error||!data)throw Error(PUBLIC_ERRORS.has(error?.message)?error.message:'JOURNAL_TRANSITION_FAILED');return data;}};}
async function verifyObject(adapter,row,env,{deleting=false}={}){const object=await adapter.get({Bucket:env.R2_BUCKET_NAME,Key:row.object_key},{abortSignal:AbortSignal.timeout(180000)});if(deleting&&object.ContentLength===0&&object.ContentType==='application/x-xiqi-tombstone'&&object.Metadata?.['upload-id']===row.id&&object.Metadata?.['owner-id']===row.owner_id&&object.Metadata?.['source-sha256']===row.sha256&&object.Metadata?.state==='tombstoned'){object.Body?.destroy?.();return{tombstone:true,etag:object.ETag};}if(object.ContentLength!==Number(row.size_bytes)||object.ContentType?.split(';')[0]!==row.mime||object.Metadata?.['upload-id']!==row.id||object.Metadata?.['owner-id']!==row.owner_id){object.Body?.destroy?.();throw Error('OBJECT_METADATA_MISMATCH');}const hash=createHash('sha256'),inspector=!deleting&&row.mime==='video/mp4'?mp4Inspector():null;let bytes=0,signature=Buffer.alloc(0);const timer=setTimeout(()=>object.Body.destroy?.(Error('VERIFY_TIMEOUT')),180000);try{for await(const chunk of object.Body){bytes+=chunk.length;if(bytes>Number(row.size_bytes))throw Error('OBJECT_TOO_LARGE');hash.update(chunk);if(inspector)inspector.feed(chunk);else if(signature.length<32)signature=Buffer.concat([signature,chunk.subarray(0,32-signature.length)]);}}finally{clearTimeout(timer);object.Body?.destroy?.();}if(bytes!==Number(row.size_bytes)||hash.digest('hex')!==row.sha256)throw Error('OBJECT_INTEGRITY_FAILED');if(!deleting){if(inspector)inspector.finish();else validateImage(signature,row.mime);}return{etag:object.ETag,bytes};}
function asset(row){return{uploadId:row.id,provider:'r2',key:row.object_key,url:row.asset_url,mime:row.mime,size:Number(row.size_bytes),sha256:row.sha256,backupUrl:null};}
function createManagedMediaHandler({getClient,getJournal=databaseMediaJournal,getAdapter,env=process.env,now=Date.now}){
 return async(req,res)=>{res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});let journal,actor,adapter,row,prefix,acceptance;try{prefix=scope(env,true);}catch{return res.status(503).json({error:'ISOLATED_ENV_OR_WRITE_APPROVAL_REQUIRED'});}try{acceptance=require('./acceptance-scope').configuration(env);const client=getClient();actor=await requireAdmin(req,client);if(acceptance)require('./acceptance-scope').actor(acceptance,actor);if(!UUID.test(actor))throw Error();journal=getJournal(client);}catch{return res.status(403).json({error:'ADMIN_REQUIRED'});}
 try{const body={...(req.body||{})},action=body.action;if(acceptance){if(action==='delete'&&env.XIQI_ACCEPTANCE_DELETE_ENABLED!=='true')throw Error('ACCEPTANCE_DELETE_DISABLED');if(action==='reserve'){const kind=body.mime==='video/mp4'?'VIDEO':'IMAGE',sha=env['XIQI_ACCEPTANCE_'+kind+'_SHA256'];if(!/^[a-f0-9]{64}$/.test(sha||'')||body.sha256!==sha)throw Error('ACCEPTANCE_FILE_DENIED');body.requestId=kind==='IMAGE'?acceptance.product:acceptance.inquiry;}}adapter=getAdapter();
  if(['owned','pending'].includes(action)){
   if(action==='owned'&&(!Array.isArray(body.urls)||body.urls.length>50||body.urls.some(url=>typeof url!=='string'||url.length>2048)))return res.status(400).json({error:'INVALID_URLS'});
   const items=await journal.transition(action,actor,action==='owned'?{urls:body.urls}:{});return res.status(200).json({items:items.filter(x=>x.object_key.startsWith(prefix+'/')&&(!acceptance||[acceptance.product,acceptance.inquiry].includes(x.id)))});
  }
  if(action==='reserve'){
   const {requestId,mime,size,sha256}=body,ext={'image/jpeg':'jpg','image/png':'png','image/gif':'gif','image/webp':'webp','video/mp4':'mp4'}[mime];
   if(!UUID.test(requestId||'')||typeof ext!=='string'||!Number.isSafeInteger(size)||size<1||size>(mime==='video/mp4'?200*1024*1024:2*1024*1024)||!/^[a-f0-9]{64}$/.test(sha256||''))return res.status(400).json({error:'INVALID_MEDIA_METADATA'});
   if(env[mime==='video/mp4'?'R2_VIDEO_UPLOAD_ENABLED':'R2_IMAGE_UPLOAD_ENABLED']!=='true')return res.status(409).json({error:'MEDIA_KIND_DISABLED'});
   const id=acceptance?(mime==='video/mp4'?acceptance.inquiry:acceptance.product):randomUUID(),fingerprint=createHash('sha256').update(JSON.stringify([prefix,mime,size,sha256])).digest('hex');
   row=await journal.transition('reserve',actor,{id,request_id:requestId,object_key:`${prefix}/${id}.${ext}`,fingerprint,sha256,size_bytes:size,mime});
   if(row.owner_id!==actor||!row.object_key.startsWith(prefix+'/')||!row.object_key.includes('/'+row.id+'.'))throw Error('OBJECT_SCOPE_MISMATCH');
   if(row.state==='verified')return res.status(200).json({asset:asset(row)});
   row=await journal.transition('sign',actor,{id:row.id});
   const metadata={'upload-id':row.id,'owner-id':actor,sha256};
   const headers={'Content-Type':mime,'If-None-Match':'*','Cache-Control':'no-store',...Object.fromEntries(Object.entries(metadata).map(([key,value])=>['x-amz-meta-'+key,value]))};
   const uploadUrl=await adapter.signPut({Bucket:env.R2_BUCKET_NAME,Key:row.object_key,ContentLength:size,ContentType:mime,IfNoneMatch:'*',CacheControl:'no-store',Metadata:metadata},300);
   return res.status(200).json({uploadId:row.id,uploadUrl,headers,expiresIn:300,maxBytes:mime==='video/mp4'?209715200:2097152});
  }
  if(!UUID.test(body.uploadId||''))return res.status(400).json({error:'UPLOAD_ID_REQUIRED'});
  if(acceptance&&![acceptance.product,acceptance.inquiry].includes(body.uploadId))throw Error('ACCEPTANCE_OBJECT_DENIED');row=await journal.transition('get',actor,{id:body.uploadId});if(!row.object_key.startsWith(prefix+'/')||!row.object_key.includes('/'+row.id+'.'))throw Error('OBJECT_SCOPE_MISMATCH');
  if(action==='complete'){
   if(row.state==='verified')return res.status(200).json({asset:asset(row)});if(row.state!=='reserved')throw Error('NOT_COMPLETABLE');
   const verified=await verifyObject(adapter,row,env);row=await journal.transition('verify',actor,{id:row.id,sha256:row.sha256,size_bytes:Number(row.size_bytes),etag:verified.etag,asset_url:publicUrl(env.R2_PUBLIC_BASE_URL,row.object_key)});return res.status(200).json({asset:asset(row)});
  }
  if(action==='status')return res.status(200).json({state:row.state,asset:row.state==='verified'?asset(row):null});
  if(action==='failure'){await journal.transition('failure',actor,{id:row.id,code:'CLIENT_UPLOAD_FAILED'});return res.status(200).json({recorded:true});}
  if(action==='delete'){
   if(row.state==='deleted')return res.status(200).json({deleted:true});row=await journal.transition('tombstone',actor,{id:row.id});
   if(new Date(row.sign_until||0).getTime()+30000>now())return res.status(202).json({state:'tombstoned',retryAfterSeconds:Math.ceil((new Date(row.sign_until).getTime()+30000-now())/1000)});
   if(env.R2_MEDIA_DELETE_ENABLED!=='true'||env.R2_CONDITIONAL_PURGE_VERIFIED!=='true')return res.status(202).json({state:'tombstoned',payloadPurgeEnabled:false});
   await journal.transition('purge',actor,{id:row.id});
   let verified;try{verified=await verifyObject(adapter,row,env,{deleting:true});}catch(error){if(error?.$metadata?.httpStatusCode!==404)throw error;}
   if(!verified?.tombstone){if(verified&&!verified.etag)throw Error('ETAG_REQUIRED');await adapter.put({Bucket:env.R2_BUCKET_NAME,Key:row.object_key,...(verified?{IfMatch:verified.etag}:{IfNoneMatch:'*'}),Body:Buffer.alloc(0),ContentLength:0,ContentType:'application/x-xiqi-tombstone',CacheControl:'no-store',Metadata:{'upload-id':row.id,'owner-id':row.owner_id,'source-sha256':row.sha256,state:'tombstoned'}});}
   await journal.transition('deleted',actor,{id:row.id});return res.status(200).json({deleted:true});
  }
  return res.status(400).json({error:'INVALID_ACTION'});
 }catch(error){const retryable=['TimeoutError','AbortError'].includes(error.name)||['ETIMEDOUT','ECONNRESET','ENETUNREACH'].includes(error.code)||[408,429,500,502,503,504].includes(error?.$metadata?.httpStatusCode);const code=retryable?'MEDIA_TEMPORARILY_UNAVAILABLE':PUBLIC_ERRORS.has(error.message)?error.message:'MEDIA_OPERATION_BLOCKED';if(row&&journal&&actor){try{await journal.transition('failure',actor,{id:row.id,code:retryable?'MEDIA_TEMPORARILY_UNAVAILABLE':PUBLIC_ERRORS.has(error.message)?error.message:'MEDIA_OPERATION_FAILED'});}catch{}}return res.status(retryable?503:409).json({error:code,retryable,note:'请检查上传状态、权限或引用；原媒体不会被自动删除。'});}
 };
}
module.exports={createManagedMediaHandler,databaseMediaJournal,scope,verifyObject};
