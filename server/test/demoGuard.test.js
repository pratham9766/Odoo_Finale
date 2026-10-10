import test from 'node:test';
import assert from 'node:assert/strict';
import { demoAllowed } from '../src/modules/auth/demo.guard.js';
const config = { NODE_ENV: 'development', DEMO_LOGIN_ENABLED: true, CLIENT_URL: 'http://localhost:5173' };
test('demo login requires explicit development mode, opt-in, loopback and exact origin', () => {
  for (const address of ['127.0.0.1','::1','::ffff:127.0.0.1']) assert.equal(demoAllowed(config,address,config.CLIENT_URL),true);
  for (const mode of ['production','test','staging']) assert.equal(demoAllowed({...config,NODE_ENV:mode},'::1',config.CLIENT_URL),false);
  assert.equal(demoAllowed({...config,DEMO_LOGIN_ENABLED:false},'::1',config.CLIENT_URL),false);
  assert.equal(demoAllowed(config,'192.168.1.1',config.CLIENT_URL),false);
  assert.equal(demoAllowed(config,'::1',undefined),false);
  assert.equal(demoAllowed(config,'::1','https://untrusted.example'),false);
});
