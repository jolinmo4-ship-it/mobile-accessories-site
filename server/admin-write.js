'use strict';
const{requireAdmin}=require('./admin');
const fields={products:['name','category','short_desc','description','image_url','price','moq','material','packaging','lead_time','features','gallery','video_url','status','sort_order'],categories:['name','slug','image_url','description','link','sort_order','status'],factory_media:['title','description','video_url','thumbnail_url','sort_order','status'],inquiries:['status']};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function assertWriteEnvironment(env){
 if(env.ADMIN_WRITE_ENABLED!=='true')throw Error('ADMIN_WRITES_DISABLED');
 const u=new URL(env.SUPABASE_URL);if(u.protocol!=='https:'||u.username||u.password)throw Error('INVALID_DATABASE');
 if(env.VERCEL_ENV!=='production'&&u.hostname.startsWith('qndwtogovmkuexudtnua.'))throw Error('PREVIEW_PRODUCTION_WRITES_BLOCKED');
}
function createAdminWriteHandler({getClient,getMediaClient,env=process.env}){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='POST')return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
 let acceptance;try{acceptance=require('./acceptance-scope').configuration(env);if(!acceptance)assertWriteEnvironment(env);}catch{return res.status(503).json({error:'ADMIN_WRITE_ENVIRONMENT_BLOCKED'});}
 let client,actor;try{client=getClient(req);actor=await requireAdmin(req,client);if(acceptance)require('./acceptance-scope').actor(acceptance,actor);}catch{return res.status(403).json({error:'ADMIN_REQUIRED'});}
 let{table,action,id,payload}=req.body||{};
 if(acceptance){try{
  if(!((table==='products'&&id===acceptance.product&&['create','update','delete'].includes(action))||(table==='inquiries'&&id===acceptance.inquiry&&action==='delete'))||action==='delete'&&env.XIQI_ACCEPTANCE_DELETE_ENABLED!=='true')throw Error();
  if(action!=='delete')payload=require('./acceptance-scope').productPayload(acceptance,env,payload);
  const urls=[payload?.image_url,payload?.video_url,...(payload?.gallery||[])].filter(Boolean);
  if(urls.length){const{data,error}=await getMediaClient().from('r2_media_uploads').select('asset_url,object_key,owner_id,state').in('asset_url',[...new Set(urls)]);if(error||urls.some(url=>!data?.some(r=>r.asset_url===url&&r.object_key.startsWith(acceptance.prefix+'/')&&r.owner_id===actor&&r.state==='verified')))throw Error();}
 }catch{return res.status(403).json({error:'ACCEPTANCE_OBJECT_DENIED'});}}
 if(!Object.hasOwn(fields,table)||!['create','update','delete'].includes(action)||table==='inquiries'&&action==='create'||action!=='create'&&!uuid.test(id||''))return res.status(400).json({error:'INVALID_OPERATION'});
 if(action!=='delete'){
  if(!payload||Array.isArray(payload)||typeof payload!=='object'||!Object.keys(payload).length||Object.keys(payload).some(k=>!fields[table].includes(k)))return res.status(400).json({error:'INVALID_FIELDS'});
  for(const[k,v]of Object.entries(payload)){
   if(k==='sort_order'){if(!Number.isSafeInteger(v))return res.status(400).json({error:'INVALID_SORT_ORDER'});}
   else if(k==='gallery'){if(!Array.isArray(v)||v.length>100||v.some(x=>typeof x!=='string'||x.length>2048||!/^https:\/\//.test(x)))return res.status(400).json({error:'INVALID_GALLERY'});}
   else if(typeof v!=='string'||v.length>50000)return res.status(400).json({error:'INVALID_VALUE'});
   if(/^(image_url|video_url|thumbnail_url)$/.test(k)&&v&&!/^https:\/\//.test(v)&&!/^images\/[a-z0-9_./-]+$/i.test(v))return res.status(400).json({error:'INVALID_MEDIA_URL'});
  }
 }
 if(!acceptance&&action==='delete'&&table!=='inquiries'){
  try{require('./managed-media').scope(env);}catch{return res.status(423).json({error:'MEDIA_RETENTION_LOCKED'});}
 }
 try{
  // This client uses the caller JWT + public key: database RLS and 004 remain authoritative.
  const recordId=acceptance&&table==='inquiries'?acceptance.inquiryStorageId:id;
  let query=client.from(table);query=action==='create'?query.insert(acceptance?{...payload,id:acceptance.product}:payload):action==='update'?query.update(payload).eq('id',recordId):query.delete().eq('id',recordId);
  if(acceptance&&action!=='create'){query=query.eq('name',acceptance.marker);query=table==='products'?query.eq('status','draft'):query.eq('email','acceptance@example.invalid').eq('product',acceptance.marker).eq('message',acceptance.marker);}
  const{data,error}=await query.select('*').single();if(error||!data)return res.status(error?.code==='42501'?403:409).json({error:'ADMIN_RECORD_WRITE_REJECTED'});
  return res.status(200).json({data});
 }catch{return res.status(409).json({error:'ADMIN_RECORD_WRITE_FAILED'});}
};}
module.exports={createAdminWriteHandler,assertWriteEnvironment};
