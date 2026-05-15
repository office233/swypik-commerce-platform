import { test, expect } from '@playwright/test';

test('/api/health reports healthy with all subsystems ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  const json = await res.json();
  expect(json.status).toBe('healthy');
  // Tolerate either "database" or "db" key naming
  const services = json.services ?? {};
  const db = services.database ?? services.db;
  expect(db, 'db status').toBe('ok');
  expect(services.redis, 'redis status').toBe('ok');
  expect(services.storage, 'storage status').toBe('ok');
});
