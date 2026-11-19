'use strict';
const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('../server/admin');
const { scanPage, runBatch } = require('../server/batch');
const { migrationAdapters } = require('../server/runtime');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: '不支持的方法' });
  if(req.method==='POST'){try{require('../server/admin-write').assertWriteEnvironment(process.env);}catch{return res.status(503).json({error:'ADMIN_WRITE_ENVIRONMENT_BLOCKED'});}}
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: '迁移服务尚未配置' });
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    await requireAdmin(req, client);
  } catch {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  try {
    if (req.method === 'POST') {
      if (process.env.R2_MIGRATION_WRITE_ENABLED !== 'true') return res.status(409).json({ error: '迁移写操作尚未获准启用' });
      if (!process.env.R2_MIGRATION_TEST_PROJECT_URL || process.env.R2_MIGRATION_TEST_PROJECT_URL !== process.env.SUPABASE_URL) return res.status(409).json({ error: '必须明确绑定隔离测试 Supabase 项目' });
      const { action, id } = req.body || {};
      if (process.env.VERCEL_ENV === 'production') return res.status(409).json({ error: '当前开发版禁止生产迁移操作' });
      if (action === 'scan') return res.status(200).json(await scanPage(client, req.body, process.env.SUPABASE_URL));
      if (action === 'batch') return res.status(200).json(await runBatch({ client, ...migrationAdapters(client), limit: 6, concurrency: 2 }));
      if (action === 'recover') {
        const result = await client.from('media_assets').update({ status: 'failed', failure_code: 'LEASE_EXPIRED', lease_token: null, lease_until: null }).eq('status', 'processing').lt('lease_until', new Date().toISOString());
        if (result.error) throw result.error;
        return res.status(200).json({ recovered: true });
      }
      const states = { pause: 'paused', resume: 'pending', retry: 'pending' };
      if (!states[action] || !/^[0-9a-f-]{36}$/i.test(id || '')) return res.status(400).json({ error: '参数无效' });
      const allowed = action === 'pause' ? ['pending'] : action === 'retry' ? ['failed'] : ['paused'];
      const { data, error } = await client.from('media_assets').update({ status: states[action], failure_code: null }).eq('id', id).in('status', allowed).select('id');
      if (error) throw error;
      return res.status(200).json({ updated: data.length });
    }
    const summary = {};
    for (const status of ['pending', 'processing', 'verified', 'failed', 'paused']) {
      const { count, error } = await client.from('media_assets').select('id', { count: 'exact', head: true }).eq('status', status);
      if (error) throw error;
      summary[status] = count;
    }
    const { data, error } = await client.from('media_assets').select('id,source_bucket,source_key,status,size_bytes,mime_type,failure_code,migrated_at,created_at').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return res.status(200).json({ summary, records: data, note: '统计仅代表扫描登记资产。扫描按商品/分类/图库分页进行；每批最多 6 个文件，并发 2。暂停仅作用于等待文件，进行中文件会完成校验。' });
  } catch {
    return res.status(503).json({ error: '无法读取迁移数据，请检查数据库准备状态' });
  }
};
