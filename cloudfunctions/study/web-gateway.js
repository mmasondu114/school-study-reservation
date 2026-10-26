'use strict';
const crypto = require('node:crypto');
const { assert } = require('./domain');
const signature = (secret, timestamp, nonce, body) => crypto.createHmac('sha256', secret).update(timestamp + '\n' + nonce + '\n' + body).digest('hex');
async function verifyGateway(event, now, secret, transaction, siteOrigin) {
  assert(typeof secret === 'string' && secret.length >= 32 && siteOrigin, '网站后台尚未配置');
  assert(event.httpMethod === 'POST', '请求方式无效');
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v]) => [k.toLowerCase(),v]));
  const timestamp = headers['x-study-timestamp'], nonce = headers['x-study-nonce'], signed = headers['x-study-signature'];
  assert(typeof timestamp === 'string' && /^\d{13}$/.test(timestamp) && Math.abs(now - Number(timestamp)) <= 60000, '网站请求已过期');
  assert(typeof nonce === 'string' && /^[a-f0-9]{32}$/.test(nonce) && typeof signed === 'string' && /^[a-f0-9]{64}$/.test(signed), '网站请求签名无效');
  assert(typeof event.body === 'string' && event.body.length <= 1300000, '网站请求过大');
  const body = event.isBase64Encoded ? Buffer.from(event.body,'base64').toString('utf8') : event.body;
  assert(crypto.timingSafeEqual(Buffer.from(signature(secret,timestamp,nonce,body),'hex'),Buffer.from(signed,'hex')), '网站请求签名无效');
  const payload = JSON.parse(body);
  assert(payload.origin === siteOrigin && typeof payload.clientId === 'string' && /^[a-f0-9]{64}$/.test(payload.clientId), '网站来源无效');
  await transaction(async tx => {
    assert(!(await tx.get('webNonces',nonce)), '网站请求不可重复使用');
    tx.put('webNonces',nonce,{id:nonce,expiresAt:now+120000});
  });
  return payload;
}
module.exports = { signature, verifyGateway };
