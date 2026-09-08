'use strict';

const test = require('node:test');
const assert = require('node:assert');
const createApp = require('../app');
const http = require('http');

function startServer() {
  const app = createApp();
  const server = app.listen(0);
  const port = server.address().port;
  return { server, base: `http://127.0.0.1:${port}` };
}

function request(base, path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(chunks); } catch (e) { /* ignore */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

test('GET /api/health returns ok', async () => {
  const { server, base } = startServer();
  const res = await request(base, '/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  server.close();
});

test('POST /api/analyze/message rejects empty text', async () => {
  const { server, base } = startServer();
  const res = await request(base, '/api/analyze/message', 'POST', { text: '' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.success, false);
  server.close();
});

test('POST /api/analyze/message flags an OTP scam as HIGH/CRITICAL', async () => {
  const { server, base } = startServer();
  const res = await request(base, '/api/analyze/message', 'POST', {
    text: 'Your account will be blocked today. Share the OTP immediately to keep it active.'
  });
  assert.strictEqual(res.status, 200);
  assert.ok(['HIGH', 'CRITICAL'].includes(res.body.data.riskLevel));
  assert.ok(res.body.data.riskScore > 50);
  server.close();
});

test('POST /api/analyze/message treats negated OTP warning as low-risk-ish', async () => {
  const { server, base } = startServer();
  const res = await request(base, '/api/analyze/message', 'POST', {
    text: 'Reminder: never share your OTP or password with anyone, including bank staff.'
  });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.riskScore < 50, `expected low score, got ${res.body.data.riskScore}`);
  server.close();
});

test('POST /api/analyze/message rejects unexpected fields', async () => {
  const { server, base } = startServer();
  const res = await request(base, '/api/analyze/message', 'POST', { text: 'hello', admin: true });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error.code, 'UNEXPECTED_FIELDS');
  server.close();
});

test('POST /api/analyze/link rejects javascript: scheme', async () => {
  const { server, base } = startServer();
  const res = await request(base, '/api/analyze/link', 'POST', { url: 'javascript:alert(1)' });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error.code, 'UNSAFE_SCHEME');
  server.close();
});

test('POST /api/analyze/link flags brand impersonation domain', async () => {
  const { server, base } = startServer();
  const res = await request(base, '/api/analyze/link', 'POST', { url: 'http://paytm.secure-login.example.top/kyc' });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.riskScore > 0);
  server.close();
});

test('POST /api/analyze/link rejects invalid URL', async () => {
  const { server, base } = startServer();
  const res = await request(base, '/api/analyze/link', 'POST', { url: '   ' });
  assert.strictEqual(res.status, 400);
  server.close();
});

test('unknown route returns 404 with consistent error shape', async () => {
  const { server, base } = startServer();
  const res = await request(base, '/api/does-not-exist');
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.body.error.code, 'NOT_FOUND');
  server.close();
});
