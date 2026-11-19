(function () {
  const message = document.getElementById('message');
  const client = window.XIQI_GET_SUPABASE_CLIENT();
  async function request(method = 'GET', body) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error('请先在原后台登录');
    const response = await fetch('/api/r2-admin', { method, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '请求失败');
    return data;
  }
  async function refresh() {
    try {
      const data = await request();
      message.textContent = data.note;
      const summary = data.summary;
      const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
      document.getElementById('summary').textContent = `已登记：${total}\n成功：${summary.verified}\n失败：${summary.failed}\n等待：${summary.pending}\n处理中：${summary.processing}\n暂停：${summary.paused}\n成功进度：${total ? (summary.verified / total * 100).toFixed(1) : 0}%`;
      const records = document.getElementById('records');
      records.replaceChildren();
      for (const asset of data.records) {
        const section = document.createElement('section');
        const detail = document.createElement('pre');
        detail.textContent = JSON.stringify(asset, null, 2);
        section.append(detail);
        const action = asset.status === 'failed' ? 'retry' : asset.status === 'paused' ? 'resume' : asset.status === 'pending' ? 'pause' : null;
        if (action) {
          const button = document.createElement('button');
          button.textContent = { retry: '重试', resume: '恢复', pause: '暂停' }[action];
          button.onclick = async () => { try { await request('POST', { action, id: asset.id }); await refresh(); } catch (error) { message.textContent = error.message; } };
          section.append(button);
        }
        records.append(section);
      }
    } catch (error) { message.textContent = error.message; }
  }
  document.getElementById('refresh').onclick = refresh;
  for (const action of ['scan', 'batch', 'recover']) document.getElementById(action).onclick = async function () {
    this.disabled = true;
    try {
      if (action === 'scan') {
        for (const table of ['products', 'categories', 'product_images']) {
          let after = '';
          while (true) {
            const page = await request('POST', { action, table, after, limit: 50 });
            message.textContent = `${table} 本页扫描 ${page.scanned}，发现 ${page.discovered}`;
            after = page.after;
            if (page.done) break;
          }
        }
      } else await request('POST', { action });
      await refresh();
    } catch (error) { message.textContent = error.message; }
    finally { this.disabled = false; }
  };
  refresh();
})();
