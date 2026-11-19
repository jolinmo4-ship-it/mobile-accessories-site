'use strict';
async function requireAdmin(req, client) {
  const token = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')?.[1];
  if (!token) throw new Error('UNAUTHORIZED');
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user || data.user.app_metadata?.role !== 'admin') throw new Error('FORBIDDEN');
  return data.user.id;
}
module.exports = { requireAdmin };
