'use strict';
const{configuration,actor}=require('./acceptance-scope');
const{requireAdmin}=require('./admin');
async function handle(req,res,{env=process.env,getClient}={}){
 let scope;try{scope=configuration(env);}catch{return res.status(503).json({error:'ACCEPTANCE_CONFIG_INVALID',emailSuppressed:true});}
 if(!scope)return res.status(503).json({error:'PREVIEW_INQUIRY_DISABLED',emailSuppressed:true});
 let client;try{client=getClient();actor(scope,await requireAdmin(req,client));}catch{return res.status(403).json({error:'ADMIN_REQUIRED',emailSuppressed:true});}
 if(req.body?.acceptanceInquiryId!==scope.inquiry||Object.keys(req.body).some(k=>k!=='acceptanceInquiryId'))return res.status(403).json({error:'ACCEPTANCE_OBJECT_DENIED',emailSuppressed:true});
 // No caller content, customer address, SMTP, analytics, upsert or service-role fallback.
 try{const{error}=await client.from('inquiries').insert({id:scope.inquiryStorageId,name:scope.marker,email:'acceptance@example.invalid',product:scope.marker,message:scope.marker});
 if(error)return res.status(error.code==='42501'?403:409).json({error:'TEST_INQUIRY_NOT_SAVED',emailSuppressed:true});
 return res.status(200).json({ok:true,savedToDatabase:true,emailSuppressed:true,testInquiryId:scope.inquiry,testInquiryStorageId:scope.inquiryStorageId});
 }catch{return res.status(409).json({error:'TEST_INQUIRY_NOT_SAVED',emailSuppressed:true});}
}
module.exports={handle};
