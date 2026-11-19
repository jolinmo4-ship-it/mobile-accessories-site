'use strict';
const manifest=require('../data/r2-verified-media.json'),{resolveMedia}=require('./media-map');
function mediaUrl(value){const text=String(value||'');let u;try{u=new URL(text);}catch{return text;}if(!['qndwtogovmkuexudtnua.supabase.co','qndwtogovmkuexudtnua.storage.supabase.co'].includes(u.hostname)||!u.pathname.startsWith('/storage/v1/object/'))return text;try{return resolveMedia([text],manifest,manifest.publicBaseUrl,{allowVideo:true})[text]||'';}catch{return '';}}
module.exports={mediaUrl};
