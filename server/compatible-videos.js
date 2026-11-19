'use strict';
function groupVariants(mappings) {
  if (mappings.length !== 31) throw Error('EXPECTED_31_MAPPINGS');
  const seen=new Set(),groups=new Map();
  for(const row of mappings){
    const id=`${row.sourceBucket}/${row.sourceKey}`;
    if(seen.has(id))throw Error('DUPLICATE_SOURCE_MAPPING');seen.add(id);
    if(!row.pass||!row.browserPass||!row.sourceUnchanged||!row.outputUnchanged||row.codec!=='h264'||row.mime!=='video/mp4'||!row.faststart||!row.fullDecode||!row.targetPath||!Number.isSafeInteger(row.targetBytes)||row.targetBytes<1||!/^[a-f0-9]{64}$/.test(row.targetSha256||'')||!/^[a-f0-9]{64}$/.test(row.sourceSha256||''))throw Error('UNVERIFIED_VARIANT');
    if(row.proposedVariantKey!==`compatible-videos/${row.sourceSha256}/h264-crf18-v1.mp4`||row.proposedVariantKey===row.sourceKey)throw Error('VARIANT_KEY_REJECTED');
    const existing=groups.get(row.proposedVariantKey);
    if(existing&&(existing.sha256!==row.targetSha256||existing.sizeBytes!==row.targetBytes))throw Error('ALIAS_CONTENT_CONFLICT');
    if(existing)existing.sources.push({bucket:row.sourceBucket,key:row.sourceKey});
    else groups.set(row.proposedVariantKey,{key:row.proposedVariantKey,bucket:row.sourceBucket,sourceSha256:row.sourceSha256,localPath:row.targetPath,sizeBytes:row.targetBytes,sha256:row.targetSha256,mime:'video/mp4',sources:[{bucket:row.sourceBucket,key:row.sourceKey}]});
  }
  return [...groups.values()];
}
function restrictAdapter(adapter,records){
  const allowed=new Map(records.map(row=>[row.key,row]));
  function check(input){if(input.Bucket!=='xiqi-media'||!allowed.has(input.Key))throw Error('COMPATIBLE_SCOPE_REJECTED');return allowed.get(input.Key);}
  return Object.freeze({
    put(input,options){const row=check(input);if(input.IfNoneMatch!=='*'||input.ContentType!=='video/mp4'||input.ContentLength!==row.sizeBytes||input.Metadata?.sha256!==row.sha256)throw Error('CREATE_ONLY_REQUIRED');return adapter.put({...input,Metadata:{...input.Metadata,'source-sha256':row.sourceSha256,variant:'h264-crf18-v1','source-alias-count':String(row.sources.length)}},options);},
    get(input,options){check(input);return adapter.get(input,options);}
  });
}
module.exports={groupVariants,restrictAdapter};
