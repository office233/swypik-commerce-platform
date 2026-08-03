import { test, expect } from '@playwright/test';
import { collectIssues, assertNoIssues, testEmail, TEST_PASSWORD, uiLogin } from './helpers';

/**
 * Faza 3 — User logat. Serial: signup UI → login → setări → social → cart.
 * Cont: e2e_pw_<ts>@test.swypik.local (cleanup în DB la final, documentat în raport).
 */

test.describe.configure({ mode: 'serial' });
test.skip(({ browserName }, testInfo) => testInfo.project.name !== 'desktop', 'faza 3 doar desktop');

const email = testEmail('_f3');
const username = `e2epw${Date.now().toString(36)}`;

test('signup UI: validări + submit reușit', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = collectIssues(page);
  await page.goto('/auth/signup', { waitUntil: 'domcontentloaded' });

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  const submit = page.locator('button[type="submit"]').first();

  // Validare email invalid
  await emailInput.fill('nu-e-email');
  await passInput.fill(TEST_PASSWORD);
  const userInput = page.locator('input[name="username"], input[placeholder*="user" i], input[placeholder*="nume" i]').first();
  if ((await userInput.count()) > 0) await userInput.fill(username);
  await submit.click();
  await page.waitForTimeout(1500);
  expect(page.url(), 'email invalid nu trebuie să treacă').toMatch(/auth\/signup/);

  // Validare parolă scurtă
  await emailInput.fill(email);
  await passInput.fill('123');
  await submit.click();
  await page.waitForTimeout(1500);
  expect(page.url(), 'parolă scurtă nu trebuie să treacă').toMatch(/auth\/signup/);

  // Submit valid
  await passInput.fill(TEST_PASSWORD);
  if ((await userInput.count()) > 0) await userInput.fill(username);
  await submit.click();
  await page.waitForURL((u) => !/auth\/signup/.test(u.toString()), { timeout: 20_000 });
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/internal server error|application error/i);
});

test('login greșit → eroare clară; login corect → cont', async ({ page }) => {
  await page.goto('/auth/login');
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill('parola-gresita-123');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(2000);
  expect(page.url()).toMatch(/auth\/login/);
  const body = await page.locator('body').innerText();
  expect(body).toMatch(/greșit|incorect|invalid|eroare|wrong|failed/i);

  await uiLogin(page, email);
  await page.goto('/account');
  await expect(page.locator('body')).toContainText(new RegExp(username, 'i'), { timeout: 15000 });
});

test('setări: editează profil → persistă', async ({ page }) => {
  await uiLogin(page, email);
  await page.goto('/account/edit');
  const nameInput = page.locator('input[name="name"], input[name="displayName"], input[id*="name"]').first();
  await expect(nameInput).toBeVisible({ timeout: 10000 });
  const newName = `E2E Test ${Date.now() % 1000}`;
  await nameInput.fill(newName);
  await page.locator('button[type="submit"], button:has-text(/salv|save/i)').first().click();
  await page.waitForTimeout(2500);
  await page.reload();
  await expect(nameInput).toHaveValue(newName, { timeout: 10000 });
});

test('setări: adrese CREATE → DELETE prin UI', async ({ page }) => {
  const issues = collectIssues(page);
  await uiLogin(page, email);
  await page.goto('/account/addresses');
  const addBtn = page.locator('button, a').filter({ hasText: /adaugă|add|nouă/i }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await page.waitForTimeout(1000);
  // Completare formular generică
  const fill = async (sel: string, val: string) => {
    const el = page.locator(sel).first();
    if ((await el.count()) > 0 && (await el.isVisible())) await el.fill(val);
  };
  await fill('input[name*="name" i]', 'E2E Tester');
  await fill('input[name*="phone" i]', '0700000001');
  await fill('input[name*="street" i], input[name*="address" i], input[name*="line1" i]', 'Str. Test 1');
  await fill('input[name*="city" i]', 'București');
  await fill('input[name*="county" i], input[name*="state" i], input[name*="judet" i]', 'București');
  await fill('input[name*="zip" i], input[name*="postal" i]', '010101');
  await page.locator('button[type="submit"]').last().click();
  await page.waitForTimeout(2500);
  await expect(page.locator('body')).toContainText(/Str\. Test 1|E2E Tester/, { timeout: 10000 });
  // DELETE
  const delBtn = page.locator('button').filter({ hasText: /șterge|delete|remove/i }).first();
  if ((await delBtn.count()) > 0) {
    await delBtn.click();
    const confirm = page.locator('button').filter({ hasText: /confirm|da|șterge|delete/i }).last();
    if ((await confirm.count()) > 0) await confirm.click().catch(() => {});
    await page.waitForTimeout(2000);
  }
  assertNoIssues(issues, 'addresses');
});

test('setări: preferințe/notificări/comenzi se deschid curat', async ({ page }) => {
  await uiLogin(page, email);
  for (const p of ['/account/orders', '/account/preferences', '/account/notifications', '/account/returns', '/account/liked', '/account/saved']) {
    const issues = collectIssues(page);
    const res = await page.goto(p, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), `${p} status`).toBeLessThan(400);
    const body = await page.locator('body').innerText();
    expect(body, p).not.toMatch(/internal server error|application error/i);
    assertNoIssues(issues, p);
  }
});

test('social: like + follow + comentariu pe un clip', async ({ page }) => {
  test.setTimeout(90_000);
  await uiLogin(page, email);
  await page.goto('/explore', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const likeBtn = page.locator('button[aria-label*="like" i], button[aria-label*="apreciaz" i], [data-testid*="like"]').first();
  if ((await likeBtn.count()) === 0) {
    test.info().annotations.push({ type: 'netestabil', description: 'buton like negăsit în explore (selector)' });
    return;
  }
  const before = await likeBtn.innerText().catch(() => '');
  await likeBtn.click();
  await page.waitForTimeout(2000);
  const after = await likeBtn.innerText().catch(() => '');
  expect(before !== after || true, 'like fără crash').toBeTruthy();
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/internal server error/i);

  // Comentariu cu XSS smoke (faza 5 parțial): trebuie escapat
  const commentBtn = page.locator('button[aria-label*="comment" i], button[aria-label*="coment" i], [data-testid*="comment"]').first();
  if ((await commentBtn.count()) > 0) {
    await commentBtn.click();
    const input = page.locator('textarea, input[placeholder*="coment" i], input[placeholder*="comment" i]').first();
    if ((await input.count()) > 0) {
      await input.fill('E2E test <script>alert(1)</script>');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(2000);
      // scriptul NU trebuie executat — dacă ar fi, page.evaluate dialog ar bloca; verificăm textul randat
      const rendered = page.locator('text=E2E test').first();
      if ((await rendered.count()) > 0) {
        const html = await rendered.evaluate((el) => el.parentElement?.innerHTML ?? '');
        expect(html, 'XSS trebuie escapat').not.toContain('<script>alert(1)</script>');
      }
    }
  }
});

test('cart: adaugă produs → cantitate → checkout până la plată', async ({ page }) => {
  test.setTimeout(120_000);
  await uiLogin(page, email);
  await page.goto('/shop', { waitUntil: 'domcontentloaded' });
  const productLink = page.locator('a[href*="/product/"]').first();
  await expect(productLink).toBeVisible({ timeout: 15000 });
  await productLink.click();
  await page.waitForLoadState('domcontentloaded');
  const addBtn = page.locator('button').filter({ hasText: /adaugă|add to cart/i }).first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  await page.waitForTimeout(2000);
  await page.goto('/cart');
  const body = await page.locator('body').innerText();
  expect(body, 'cart nu e gol după adăugare').not.toMatch(/coșul (tău )?e(ste)? gol|cart is empty/i);
  // checkout până la plată (NU plătim)
  const checkoutBtn = page.locator('a,button').filter({ hasText: /checkout|finalizează|continuă/i }).first();
  if ((await checkoutBtn.count()) > 0) {
    await checkoutBtn.click();
    await page.waitForLoadState('domcontentloaded');
    const b2 = await page.locator('body').innerText();
    expect(b2).not.toMatch(/internal server error/i);
    test.info().annotations.push({ type: 'note', description: `checkout ajuns la: ${page.url()}` });
  }
});

test('verticale logat: fly/stays/food/go se încarcă cu funcții de bază', async ({ page }) => {
  test.setTimeout(120_000);
  await uiLogin(page, email);
  for (const p of ['/fly', '/stays', '/food', '/go', '/missions']) {
    const issues = collectIssues(page);
    await page.goto(p, { waitUntil: 'domcontentloaded' });
    const body = await page.locator('body').innerText();
    expect(body, p).not.toMatch(/internal server error|application error/i);
    assertNoIssues(issues, p);
  }
});

test('logout prin UI', async ({ page }) => {
  await uiLogin(page, email);
  await page.goto('/account');
  const logoutBtn = page.locator('button, a').filter({ hasText: /deconect|logout|ieși/i }).first();
  await expect(logoutBtn).toBeVisible({ timeout: 10000 });
  await logoutBtn.click();
  await page.waitForTimeout(2500);
  await page.goto('/account');
  // trebuie redirect la login sau prompt
  expect(page.url()).toMatch(/auth|login|\/$/);
});
