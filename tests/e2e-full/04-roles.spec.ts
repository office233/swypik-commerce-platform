import { test, expect } from '@playwright/test';
import { collectIssues, assertNoIssues, testEmail, apiSignup, uiLogin, TEST_PASSWORD } from './helpers';

/**
 * Faza 4 — Roluri privilegiate.
 * User normal: /admin și /seller refuzate. Seller/Admin: cu credențiale din env
 * (E2E_SELLER_EMAIL/E2E_SELLER_PASSWORD, E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD).
 */

test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(testInfo.project.name !== 'desktop', 'faza 4 doar desktop');
});

test('user normal: /admin refuzat + /api/admin/* 401/403/404', async ({ page, request }) => {
  const email = testEmail('_f4');
  const res = await apiSignup(request, email);
  expect(res.ok(), `signup: ${res.status()}`).toBeTruthy();
  await uiLogin(page, email);

  await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/interzis|restricț|forbidden|404|not found|acces/i);
  expect(body).not.toMatch(/Utilizatori.*Comenzi platform/s);

  for (const api of ['/api/admin/users', '/api/admin/orders', '/api/admin/sellers']) {
    const r = await page.request.get(api);
    expect([401, 403, 404], `${api} → ${r.status()}`).toContain(r.status());
  }

  // Link admin ascuns în UI
  await page.goto('/account');
  const adminLink = page.locator('a[href*="/admin"]');
  expect(await adminLink.count(), 'link admin vizibil pt user normal').toBe(0);

  // Seller dashboard la fel
  await page.goto('/seller', { waitUntil: 'domcontentloaded' }).catch(() => {});
  const sb = await page.locator('body').innerText();
  expect(sb).not.toMatch(/payouts.*produsele mele/is);
});

const SELLER_EMAIL = process.env.E2E_SELLER_EMAIL;
const SELLER_PASS = process.env.E2E_SELLER_PASSWORD;

test('seller: dashboard + secțiuni se deschid', async ({ page }) => {
  test.skip(!SELLER_EMAIL, 'E2E_SELLER_EMAIL nesetat — documentat în NETESTABIL');
  await uiLogin(page, SELLER_EMAIL!, SELLER_PASS ?? TEST_PASSWORD);
  for (const p of ['/seller', '/seller/products', '/seller/orders', '/seller/payouts', '/seller/listings', '/seller/returns', '/seller/settings']) {
    const issues = collectIssues(page);
    const res = await page.goto(p, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), `${p}`).toBeLessThan(400);
    const body = await page.locator('body').innerText();
    expect(body, p).not.toMatch(/internal server error|interzis|forbidden/i);
    assertNoIssues(issues, p);
  }
});

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD;

const ADMIN_SECTIONS = [
  '/admin', '/admin/users', '/admin/orders', '/admin/sellers', '/admin/videos',
  '/admin/moderation', '/admin/payouts', '/admin/refunds', '/admin/returns',
  '/admin/reviews', '/admin/risk', '/admin/marketplace', '/admin/creators',
  '/admin/commissions', '/admin/disputes', '/admin/health', '/admin/pricing',
];

test('admin: fiecare secțiune se deschide și se populează', async ({ page }) => {
  test.skip(!ADMIN_EMAIL, 'E2E_ADMIN_EMAIL nesetat — documentat în NETESTABIL');
  test.setTimeout(180_000);
  await uiLogin(page, ADMIN_EMAIL!, ADMIN_PASS ?? TEST_PASSWORD);
  for (const p of ADMIN_SECTIONS) {
    const issues = collectIssues(page);
    const res = await page.goto(p, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), `${p}`).toBeLessThan(400);
    const body = await page.locator('body').innerText();
    expect(body, p).not.toMatch(/internal server error|interzis|forbidden/i);
    assertNoIssues(issues, p);
  }
});
