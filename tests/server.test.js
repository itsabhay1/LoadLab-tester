import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app, resetFlakyCounter } from '../src/server.js';

describe('loadlab-test-target API Endpoints', () => {

  describe('GET /health', () => {
    it('returns 200 with service status JSON', async () => {
      const res = await request(app).get('/health');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /application\/json/);
      assert.deepEqual(res.body, {
        status: 'ok',
        service: 'loadlab-test-target'
      });
    });
  });

  describe('GET /.well-known/loadlab-verification.txt', () => {
    const originalToken = process.env.LOADLAB_VERIFICATION_TOKEN;

    it('returns 200 with exact token and text/plain when configured', async () => {
      const testToken = 'loadlab-verify-token-xyz-12345';
      process.env.LOADLAB_VERIFICATION_TOKEN = testToken;

      const res = await request(app).get('/.well-known/loadlab-verification.txt');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /text\/plain/);
      assert.equal(res.text, testToken);
      // Ensure no trailing newlines, extra whitespace, or JSON wrapper
      assert.equal(res.text.endsWith('\n'), false);
      assert.equal(res.text.endsWith('\r'), false);
      assert.equal(res.text.startsWith('{'), false);
      assert.equal(res.text.trim(), res.text);

      process.env.LOADLAB_VERIFICATION_TOKEN = originalToken;
    });

    it('returns 503 with safe text error when token is missing', async () => {
      delete process.env.LOADLAB_VERIFICATION_TOKEN;

      const res = await request(app).get('/.well-known/loadlab-verification.txt');
      assert.equal(res.status, 503);
      assert.match(res.headers['content-type'], /text\/plain/);
      assert.equal(res.text, 'Verification token not configured');

      process.env.LOADLAB_VERIFICATION_TOKEN = originalToken;
    });

    it('returns 503 when token is an empty or whitespace string', async () => {
      process.env.LOADLAB_VERIFICATION_TOKEN = '   ';

      const res = await request(app).get('/.well-known/loadlab-verification.txt');
      assert.equal(res.status, 503);
      assert.match(res.headers['content-type'], /text\/plain/);
      assert.equal(res.text, 'Verification token not configured');

      process.env.LOADLAB_VERIFICATION_TOKEN = originalToken;
    });
  });

  describe('GET /fast', () => {
    it('returns 200 immediately with small JSON response', async () => {
      const res = await request(app).get('/fast');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /application\/json/);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.route, '/fast');
    });
  });

  describe('GET /slow', () => {
    it('returns 200 after approximately 500 ms delay', async () => {
      const start = Date.now();
      const res = await request(app).get('/slow');
      const duration = Date.now() - start;

      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /application\/json/);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.route, '/slow');
      // Verify delay is in the expected ~500ms range (allow reasonable margin)
      assert.ok(duration >= 450, `Expected duration >= 450ms, got ${duration}ms`);
    });
  });

  describe('GET /variable', () => {
    it('returns 200 with delayMs in range [50, 800]', async () => {
      const res = await request(app).get('/variable');
      assert.equal(res.status, 200);
      assert.match(res.headers['content-type'], /application\/json/);
      assert.equal(res.body.status, 'ok');
      assert.equal(res.body.route, '/variable');
      assert.ok(res.body.delayMs >= 50 && res.body.delayMs <= 800, `delayMs ${res.body.delayMs} out of range`);
    });
  });

  describe('GET /flaky', () => {
    beforeEach(() => {
      resetFlakyCounter();
    });

    it('deterministically fails 1 out of every 3 requests (200, 200, 500)', async () => {
      const res1 = await request(app).get('/flaky');
      assert.equal(res1.status, 200);
      assert.equal(res1.body.status, 'ok');

      const res2 = await request(app).get('/flaky');
      assert.equal(res2.status, 200);
      assert.equal(res2.body.status, 'ok');

      const res3 = await request(app).get('/flaky');
      assert.equal(res3.status, 500);
      assert.equal(res3.body.status, 'error');
      assert.equal(res3.body.error, 'Internal Server Error');

      const res4 = await request(app).get('/flaky');
      assert.equal(res4.status, 200);
      assert.equal(res4.body.status, 'ok');
    });
  });

  describe('404 Route Handling', () => {
    it('returns JSON 404 for unknown routes', async () => {
      const res = await request(app).get('/non-existent-route');
      assert.equal(res.status, 404);
      assert.match(res.headers['content-type'], /application\/json/);
      assert.equal(res.body.error, 'Not Found');
    });
  });

});
