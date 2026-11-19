(function(){
 'use strict';
 const files=new WeakMap(),byId=new Map();
 function invalidate(item){const record=byId.get(item.id);if(record){record.asset=null;record.id=crypto.randomUUID();try{localStorage.removeItem(record.storeKey);}catch{}}window.XIQI_UPLOADED_IMAGE_ASSETS?.delete(item.asset_url);}
 async function api(session,payload){let r;try{r=await fetch('/api/media-upload',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify(payload),signal:AbortSignal.timeout(190000)});}catch{const e=Error('MEDIA_NETWORK_FAILED');e.retryable=true;throw e;}const data=await r.json();if(!r.ok){const error=new Error(data.error||'MEDIA_REQUEST_FAILED');error.code=data.error;error.retryable=data.retryable===true||[408,429,500,502,503,504].includes(r.status);throw error;}return data;}
 function transfer(file,ticket){return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('PUT',ticket.uploadUrl);xhr.timeout=180000;for(const[key,value]of Object.entries(ticket.headers))xhr.setRequestHeader(key,value);xhr.onload=()=>{if(xhr.status>=200&&xhr.status<300||xhr.status===412)resolve();else{const e=new Error('DIRECT_UPLOAD_FAILED');e.retryable=[0,403,408,429,500,502,503,504].includes(xhr.status);reject(e);}};xhr.onerror=xhr.ontimeout=()=>{const e=new Error('DIRECT_UPLOAD_TIMEOUT_OR_NETWORK');e.retryable=true;reject(e);};xhr.onabort=()=>reject(new Error('UPLOAD_ABORTED'));xhr.send(file);});}
 window.XIQI_MANAGED_UPLOAD=async function(file,session){
  if(!file||!['image/jpeg','image/png','image/gif','image/webp','video/mp4'].includes(file.type)||file.size<1||file.size>(file.type==='video/mp4'?200*1024*1024:2*1024*1024))throw Error('请选择2MiB以内图片或200MiB以内H.264/AAC MP4视频');
  let record=files.get(file);if(record?.asset)return record.asset.url;if(record?.promise)return record.promise;if(!record){record={id:crypto.randomUUID()};files.set(file,record);}
  record.promise=(async()=>{
   const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer()),sha256=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
   const storeKey='xiqi-r2-request:'+session.user?.id+':'+file.type+':'+file.size+':'+sha256;
   record.storeKey=storeKey;try{const saved=localStorage.getItem(storeKey);if(saved)record.id=saved;else localStorage.setItem(storeKey,record.id);}catch{}
   let uploadId;
   for(let attempt=1;attempt<=3;attempt++){
    try{
     const ticket=await api(session,{action:'reserve',requestId:record.id,mime:file.type,size:file.size,sha256});
     let asset=ticket.asset;
     if(!asset){uploadId=ticket.uploadId;await transfer(file,ticket);asset=(await api(session,{action:'complete',uploadId})).asset;}
     if(asset?.provider!=='r2'||!asset.uploadId||!asset.key||!asset.url?.startsWith('https://')||asset.sha256!==sha256||asset.size!==file.size||asset.backupUrl!==null)throw Error('INVALID_VERIFIED_ASSET');
     record.asset={...asset,managedV2:true};byId.set(asset.uploadId,record);window.XIQI_UPLOADED_IMAGE_ASSETS?.set(asset.url,record.asset);return asset.url;
    }catch(error){
     if(error.code==='NOT_UPLOADABLE'){try{localStorage.removeItem(storeKey);}catch{}record.id=crypto.randomUUID();error.retryable=true;}
     if(!error.retryable||attempt===3){if(uploadId)await api(session,{action:'failure',uploadId}).catch(()=>{});throw Error('媒体上传未完成；原记录不变，请重试。H.264/AAC、CORS及权限需通过检查。');}
     await new Promise(r=>setTimeout(r,500*2**(attempt-1)));
    }
   }
  })();try{return await record.promise;}finally{record.promise=null;}
 };
 window.XIQI_CLEANUP_MANAGED_URLS=async function(urls,session){
  const config=await window.XIQI_MEDIA_CAPABILITY();if(config.storageProvider!=='r2'||!config.mediaUploadV2)return{pending:0};let pending=0;
  try{for(let offset=0;offset<urls.length;offset+=50){const {items}=await api(session,{action:'owned',urls:[...new Set(urls.slice(offset,offset+50).filter(Boolean))]});for(const item of items){try{const result=await api(session,{action:'delete',uploadId:item.id});if(!result.deleted)pending++;if(result.deleted||result.state==='tombstoned')invalidate(item);}catch{pending++;}}}}catch{pending++;}return{pending};
 };
 document.addEventListener('DOMContentLoaded',async()=>{
  const config=await window.XIQI_MEDIA_CAPABILITY?.().catch(()=>null);if(config?.storageProvider!=='r2'||!config.mediaUploadV2)return;
  const button=document.createElement('button');button.type='button';button.textContent='检查并清理本账号待处理媒体';
  button.onclick=async()=>{button.disabled=true;try{const session=window.XIQI_ADMIN_SESSION;if(!session)throw Error();const {items}=await api(session,{action:'pending'});if(!confirm(`仅检查本账号${items.length}项新建受管媒体；原始Supabase及迁移媒体不操作。继续？`))return;let pending=0;for(const item of items){try{const result=await api(session,{action:'delete',uploadId:item.id});if(!result.deleted)pending++;if(result.deleted||result.state==='tombstoned')invalidate(item);}catch{pending++;}}alert(`检查完成，${pending}项因签名保留期、共享引用或删除开关等待处理，请稍后重试。`);}catch{alert('无法完成媒体清理，请核对管理员权限。');}finally{button.disabled=false;}};
  (document.querySelector('.admin-main')||document.querySelector('main'))?.appendChild(button);
 });
})();
