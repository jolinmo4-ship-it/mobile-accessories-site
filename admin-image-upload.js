(function () {
  const files = new WeakMap();
  const assets = new Map();
  let capability;
  let storageProvider;
  let fullCapability;
  async function serverUploadsEnabled() {
    if (!capability) capability = fetch('/api/media-upload-config').then(async response => {
      if (!response.ok) throw Error('无法确认图片上传配置，请稍后重试');
      const config = await response.json();
      if (typeof config.serverImageUploads !== 'boolean') throw Error('图片上传配置无效');
      storageProvider=config.storageProvider||(config.serverImageUploads?'r2':'supabase');
      fullCapability=config;
      return config.serverImageUploads;
    }).catch(error => { capability = null; throw error; });
    return capability;
  }
  window.XIQI_UPLOADED_IMAGE_ASSETS = assets;
  window.XIQI_MEDIA_CAPABILITY=async function(){await serverUploadsEnabled();return fullCapability;};
  window.XIQI_ASSERT_LEGACY_STORAGE_WRITE = async function () {
    await serverUploadsEnabled();
    if(storageProvider!=='supabase')throw Error('R2模式禁止回退写入Supabase；视频大文件通道尚未验收，请保留原视频。');
  };
  window.XIQI_REQUEST_MEDIA_DELETE = async function (table,id,session) {
    const response = await fetch('/api/media-delete', { method: 'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(session?.access_token||'')},body:JSON.stringify({table,id}) });
    const result = await response.json();
    if(response.ok&&result.allowed===true)return;
    throw new Error(result.error || '媒体保留保护已启用，禁止删除。');
  };
  window.XIQI_LINK_IMAGES = async function (table, id, urls, session) {
    if(urls.every(url=>!assets.has(url)||assets.get(url).managedV2))return true;
    if (!urls.some(url => assets.has(url))) return true;
    try {
      const response = await fetch('/api/image-link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ table, id, urls }) });
      return response.ok;
    } catch { return false; }
  };
  window.XIQI_UPLOAD_IMAGE = async function (file, session, legacyUpload) {
    if (!file || file.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) throw new Error('请选择不超过 2MiB 的 JPEG、PNG、GIF 或 WebP 图片');
    let record = files.get(file);
    if (!record) { record = { id: crypto.randomUUID() }; files.set(file, record); }
    if (record.asset) return record.asset.url;
    if (record.promise) return record.promise;
    record.promise = (async () => {
      const enabled=await serverUploadsEnabled();
      if(storageProvider==='r2'&&fullCapability.mediaUploadV2){if(!enabled||!window.XIQI_MANAGED_UPLOAD)throw Error('R2图片上传尚未获准启用');return window.XIQI_MANAGED_UPLOAD(file,session);}
      if (!enabled) {
        if(storageProvider!=='supabase')throw Error('R2上传未启用，禁止写入Supabase');
        if (typeof legacyUpload !== 'function') throw Error('原存储上传入口不可用');
        const url = await legacyUpload();
        record.asset = { provider: 'supabase', url };
        return url;
      }
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('无法读取图片'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/image-upload', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ requestId: record.id, mime: file.type, data }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '图片上传失败');
      const asset = result.asset;
      if (!['r2', 'supabase'].includes(asset?.provider) || !asset.key || !/^https:\/\//.test(asset.url || '') || asset.backupUrl !== null) throw new Error('图片存储响应无效');
      record.asset = asset;
      assets.set(asset.url, asset);
      return asset.url;
    })();
    try { return await record.promise; } finally { record.promise = null; }
  };
  const failed = new WeakSet();
  document.addEventListener('error', event => {
    const image = event.target;
    if (image?.tagName !== 'IMG' || failed.has(image)) return;
    failed.add(image);
    image.src = 'images/phone-case.png';
  }, true);
})();
