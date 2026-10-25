// Run against local backend + Vite. Set PLAYWRIGHT_MODULE to an installed playwright package.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.resolve('.agents/skills/gstack/node_modules/playwright'));
const base = process.env.RALT_TEST_URL || 'http://127.0.0.1:5173';

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = [];
    page.on('request', request => { if (request.url().includes('/api/')) requests.push(request); });
    await page.goto(base);
    await page.getByRole('link', { name: 'Continue without signing in' }).waitFor();
    assert(await page.getByRole('button', { name: 'Sign in and save progress' }).isVisible());
    await page.getByRole('link', { name: 'Continue without signing in' }).click();
    await page.getByRole('button', { name: 'University 11 tables' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Add database', exact: true }).count(), 0);
    await page.goto(`${base}/ra-exercises`);
    await page.getByLabel('Database collection').selectOption('University');
    await page.getByRole('button', { name: 'Catalog practice', exact: true }).click();
    const select = page.getByLabel('Choose a prompt from the filtered list');
    await select.selectOption({ index: 1 });
    const queryId = await select.inputValue();
    const detail = await (await page.request.get(`${base}/api/databases/University/queries/${queryId}`)).json();
    await page.locator('textarea').first().fill(detail.solution.relational_algebra);
    const evaluated = page.waitForResponse(response => response.url().endsWith(`/${queryId}/evaluate`) && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Evaluate Expression', exact: true }).click();
    assert.equal((await evaluated).status(), 200);
    assert.equal((await (await page.request.get(`${base}/api/databases/University/queries/${queryId}`)).json()).id, queryId);
    // Errors must never trigger automatic AI requests.
    await page.locator('textarea').first().fill('pi{');
    const invalid = page.waitForResponse(response => response.url().endsWith(`/${queryId}/evaluate`));
    await page.getByRole('button', { name: 'Evaluate Expression', exact: true }).click();
    assert.equal((await invalid).status(), 400);
    await page.getByRole('button', { name: 'Ask AI about this error' }).waitFor();
    assert(await page.getByRole('button', { name: 'Ask AI about this error' }).isDisabled());
    assert(!requests.some(request => /\/llm\/|\/mastery|\/operator-progress|\/auth\//.test(request.url())));
    assert(!requests.some(request => request.headers().authorization));
    await page.goto(`${base}/ra-sql-reference`);
    await page.getByRole('button', { name: 'Catalog practice', exact: true }).click();
    await page.getByLabel('Choose a prompt from the catalog').selectOption('q01');
    await page.getByRole('button', { name: 'Write full SQL', exact: true }).click();
    await page.getByLabel('Full SQL answer', { exact: true }).fill('SELECT 1 AS incorrect_column');
    const sqlTranslation = page.waitForResponse(response => response.url().endsWith('/q01/check-translation'));
    await page.getByRole('button', { name: 'Check SQL', exact: true }).click();
    assert.equal((await sqlTranslation).status(), 200);
    await page.getByText(/Your SQL is not equivalent on the current dataset/).waitFor();
    assert.equal(await page.getByText('Translation feedback', { exact: true }).count(), 1);
    assert.equal(await page.getByText('AI translation hint', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'SQL → RA', exact: true }).click();
    await page.getByRole('button', { name: 'Write full RA', exact: true }).click();
    await page.getByLabel('Full relational algebra answer', { exact: true }).fill('student');
    const raTranslation = page.waitForResponse(response => response.url().endsWith('/q01/check-translation'));
    await page.getByRole('button', { name: 'Check RA', exact: true }).click();
    assert.equal((await raTranslation).status(), 200);
    await page.getByText(/Your relational algebra expression is not equivalent on the current dataset/).waitFor();
    assert.equal(await page.getByText('Translation feedback', { exact: true }).count(), 1);
    assert.equal(await page.getByText('AI translation hint', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Ask AI for help', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Get AI translation hint', exact: true }).count(), 0);
    assert(!requests.some(request => /\/llm\/|\/ai\/privacy/.test(request.url())));
    await page.getByRole('button', { name: 'Custom translator', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Custom translator', exact: true }).click();
    await page.locator('textarea').first().fill('GUEST_DRAFT_SENTINEL');
    const stored = await page.evaluate(() => sessionStorage.getItem('ra_sql_reference_state_v1'));
    assert.equal(stored, null);
    await page.reload();
    assert(!(await page.locator('body').innerText()).includes('GUEST_DRAFT_SENTINEL'));
    await page.goto(`${base}/progress`);
    await page.getByRole('heading', { name: 'Sign in to continue' }).waitFor();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(base);
    await page.getByRole('link', { name: 'Continue without signing in' }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.screenshot({ path: '/private/tmp/ralt-guest-mobile.png', fullPage: true });
    await context.close();
    console.log('PASS: real guest browsing, RA grading/errors, protected progress, no auth/mastery/AI calls, draft privacy, mobile layout');

    // Synthetic account data isolates UI/session tests from real Supabase and AI services.
    const member = await browser.newContext();
    const state = { accountId: 'member-one', version: 'policy-one', aiCalls: [], evaluations: 0, prompts: 0, expired: false };
    await member.addCookies([{ name: 'ra_edu_auth', value: encodeURIComponent(JSON.stringify({ token: 'synthetic', email: 'member@example.test', refreshToken: 'refresh' })), url: base }]);
    await member.route('**/api/**', async route => {
      const request = route.request();
      const endpoint = new URL(request.url()).pathname.replace('/api', '');
      const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      if (endpoint === '/health') return reply({ status: 'healthy' });
      if (endpoint === '/auth/refresh') {
        if (state.holdRefresh) {
          state.refreshStarted = true;
          await state.refreshWait;
          return reply({ auth_token: 'renewed', auth_email: 'member@example.test', auth_refresh_token: 'renewed-refresh' });
        }
        if (state.refreshSucceeds) return reply({ auth_token: 'renewed', auth_email: 'member@example.test', auth_refresh_token: 'renewed-refresh' });
        return reply({ detail: 'token is expired' }, 401);
      }
      if (state.expired && request.headers().authorization === 'Bearer synthetic') return reply({ detail: 'token is expired' }, 401);
      if (endpoint === '/databases/') return reply([{ name: request.headers().authorization ? 'PrivateDataset' : 'University', table_count: 1, tables: ['example'], has_catalog: true, is_default: !request.headers().authorization }]);
      if (endpoint.endsWith('/schema')) return reply({ database: 'PrivateDataset', tables: [] });
      if (endpoint.endsWith('/queries/')) return reply([{ id: 'q1', prompt: 'List ids', hints: ['project'] }]);
      if (endpoint.endsWith('/mastery')) return reply({ query_ids: [] });
      if (endpoint.endsWith('/queries/q1')) return reply({ id: 'q1', prompt: 'List ids', hints: [], solution: { relational_algebra: 'example', sql: 'SELECT * FROM example' } });
      if (endpoint.endsWith('/check-translation')) return reply({ database: 'PrivateDataset', query_id: 'q1', direction: request.postDataJSON().direction, answer: request.postDataJSON().answer, is_correct: false, schema_equal: false, student_schema: ['wrong'], expected_schema: ['id'], missing_rows: [], extra_rows: [] });
      if (endpoint.endsWith('/evaluate')) { state.evaluations++; return reply({ detail: { message: 'Check syntax' } }, 400); }
      if (endpoint === '/ai/privacy') return reply({ account_id: state.accountId, service: 'Synthetic school model', shared_data: 'Current answer and diagnostics', data_policy: 'Test policy', policy_url: '', available: true, version: state.version });
      if (endpoint.includes('/llm/')) { state.aiCalls.push(request.headers()['x-ai-disclosure']); return reply({ explanation: 'Check your syntax.', hint: 'Use braces.', model: 'synthetic' }); }
      return reply({ detail: 'Unexpected test endpoint' }, 404);
    });
    const signed = await member.newPage();
    await signed.goto(`${base}/ra-exercises`);
    await signed.getByLabel('Database collection').selectOption('PrivateDataset');
    await signed.getByRole('button', { name: 'Custom evaluator', exact: true }).click();
    await signed.locator('textarea').first().fill('pi{');
    await signed.getByRole('button', { name: 'Evaluate Expression', exact: true }).click();
    await signed.getByRole('button', { name: 'Ask AI about this error' }).waitFor();
    assert.equal(state.aiCalls.length, 0);
    const disclosure = signed.getByRole('dialog', { name: 'Use AI help?' });
    await signed.getByRole('button', { name: 'Ask AI about this error' }).click();
    await disclosure.waitFor();
    assert.equal(await signed.evaluate(() => document.activeElement.textContent), 'Not now');
    await signed.keyboard.press('Tab');
    assert(await disclosure.evaluate(dialog => dialog.contains(document.activeElement)));
    await signed.keyboard.press('Tab');
    assert(await disclosure.evaluate(dialog => dialog.contains(document.activeElement)));
    assert(await disclosure.getByText('Synthetic school model', { exact: true }).isVisible());
    assert(!await disclosure.getByText('Test policy', { exact: true }).isVisible());
    await disclosure.getByText('Privacy details', { exact: true }).click();
    assert(await disclosure.getByText('Test policy', { exact: true }).isVisible());
    await disclosure.getByRole('button', { name: 'Not now', exact: true }).click();
    await disclosure.waitFor({ state: 'hidden' });
    assert.equal(state.aiCalls.length, 0);
    assert(!(await signed.locator('body').innerText()).includes('AI help cancelled'));
    await signed.getByRole('button', { name: 'Ask AI about this error' }).click();
    await disclosure.waitFor();
    // Details start collapsed again; Escape dismisses without sending or showing an error.
    assert(!await disclosure.getByText('Test policy', { exact: true }).isVisible());
    await signed.keyboard.press('Escape');
    await disclosure.waitFor({ state: 'hidden' });
    assert.equal(state.aiCalls.length, 0);
    await signed.getByRole('button', { name: 'Ask AI about this error' }).click();
    await disclosure.waitFor();
    await signed.screenshot({ path: '/private/tmp/ralt-ai-disclosure-desktop.png' });
    await signed.setViewportSize({ width: 375, height: 812 });
    assert(await signed.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await signed.screenshot({ path: '/private/tmp/ralt-ai-disclosure-mobile.png' });
    await disclosure.getByRole('button', { name: 'Continue to AI', exact: true }).click();
    await signed.waitForFunction(() => document.body.innerText.includes('Check your syntax.'));
    assert.deepEqual(state.aiCalls, ['policy-one']);
    // An unchanged policy is remembered for the current session.
    await signed.getByRole('button', { name: 'Ask AI about this error' }).click();
    for (let attempt = 0; attempt < 100 && state.aiCalls.length < 2; attempt++) await signed.waitForTimeout(20);
    assert.deepEqual(state.aiCalls, ['policy-one', 'policy-one']);
    assert.equal(await disclosure.count(), 0);
    state.version = 'policy-two';
    await signed.getByRole('button', { name: 'Ask AI about this error' }).click();
    await disclosure.waitFor();
    await disclosure.getByRole('button', { name: 'Continue to AI', exact: true }).click();
    for (let attempt = 0; attempt < 100 && state.aiCalls.length < 3; attempt++) await signed.waitForTimeout(20);
    assert.deepEqual(state.aiCalls, ['policy-one', 'policy-one', 'policy-two']);
    // Routine token rotation must not ask for the same policy again.
    state.expired = true;
    state.refreshSucceeds = true;
    await signed.getByRole('button', { name: 'Ask AI about this error' }).click();
    for (let attempt = 0; attempt < 100 && state.aiCalls.length < 4; attempt++) await signed.waitForTimeout(20);
    assert.deepEqual(state.aiCalls, ['policy-one', 'policy-one', 'policy-two', 'policy-two']);
    assert.equal(await disclosure.count(), 0);
    state.expired = false;
    state.refreshSucceeds = false;
    async function openMemberError() {
      await signed.goto(`${base}/ra-exercises`);
      await signed.getByLabel('Database collection').selectOption('PrivateDataset');
      await signed.getByRole('button', { name: 'Custom evaluator', exact: true }).click();
      await signed.locator('textarea').first().fill('pi{');
      await signed.getByRole('button', { name: 'Evaluate Expression', exact: true }).click();
      await signed.getByRole('button', { name: 'Ask AI about this error' }).waitFor();
    }
    // Reloading the app must remember this account's accepted policy.
    await openMemberError();
    await signed.getByRole('button', { name: 'Ask AI about this error' }).click();
    for (let attempt = 0; attempt < 100 && state.aiCalls.length < 5; attempt++) await signed.waitForTimeout(20);
    assert.equal(await disclosure.count(), 0, 'Reload should remember the account policy choice');
    assert.equal(state.aiCalls.length, 5);
    // A second account on the same browser must make its own choice.
    state.accountId = 'member-two';
    await member.addCookies([{ name: 'ra_edu_auth', value: encodeURIComponent(JSON.stringify({ token: 'synthetic-two', email: 'other@example.test', refreshToken: 'refresh-two' })), url: base }]);
    await openMemberError();
    await signed.getByRole('button', { name: 'Ask AI about this error' }).click();
    await disclosure.waitFor();
    await disclosure.getByRole('button', { name: 'Not now', exact: true }).click();
    await disclosure.waitFor({ state: 'hidden' });
    assert.equal(state.aiCalls.length, 5);
    // Returning to the first account reuses only that account's approval.
    state.accountId = 'member-one';
    await member.addCookies([{ name: 'ra_edu_auth', value: encodeURIComponent(JSON.stringify({ token: 'synthetic', email: 'member@example.test', refreshToken: 'refresh' })), url: base }]);
    await openMemberError();
    await signed.getByRole('button', { name: 'Ask AI about this error' }).click();
    for (let attempt = 0; attempt < 100 && state.aiCalls.length < 6; attempt++) await signed.waitForTimeout(20);
    assert.equal(await disclosure.count(), 0);
    assert.equal(state.aiCalls.length, 6);
    const approval = await signed.evaluate(() => localStorage.getItem('ra_ai_disclosure_v1:member-one'));
    assert.equal(approval, 'policy-two');

    await signed.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await signed.getByRole('link', { name: 'Continue without signing in' }).waitFor();
    assert(!(await signed.locator('body').innerText()).includes('PrivateDataset'));
    await signed.goto(`${base}/databases`);
    await signed.getByRole('button', { name: 'University 1 tables' }).waitFor();
    assert(!(await signed.locator('body').innerText()).includes('PrivateDataset'));
    // An expired authenticated submission is not replayed as a guest submission.
    await member.addCookies([{ name: 'ra_edu_auth', value: encodeURIComponent(JSON.stringify({ token: 'synthetic', email: 'member@example.test', refreshToken: 'refresh' })), url: base }]);
    await signed.goto(`${base}/ra-exercises`);
    await signed.getByLabel('Database collection').selectOption('PrivateDataset');
    await signed.getByRole('button', { name: 'Custom evaluator', exact: true }).click();
    await signed.locator('textarea').first().fill('example');
    state.expired = true;
    const beforeExpiry = state.evaluations;
    await signed.getByRole('button', { name: 'Evaluate Expression', exact: true }).click();
    await signed.getByText('Guest · progress not saved', { exact: true }).waitFor();
    await signed.waitForFunction(() => document.body.innerText.includes('You are now a guest'));
    assert.equal(state.evaluations, beforeExpiry);
    assert(!(await signed.locator('body').innerText()).includes('PrivateDataset'));
    // A refresh response arriving after logout cannot restore the old account.
    state.expired = false;
    state.holdRefresh = true;
    state.refreshWait = new Promise(resolve => { state.releaseRefresh = resolve; });
    await member.addCookies([{ name: 'ra_edu_auth', value: encodeURIComponent(JSON.stringify({ token: 'synthetic', email: 'member@example.test', refreshToken: 'refresh' })), url: base }]);
    await signed.goto(`${base}/ra-exercises`);
    await signed.getByLabel('Database collection').selectOption('PrivateDataset');
    await signed.getByRole('button', { name: 'Custom evaluator', exact: true }).click();
    await signed.locator('textarea').first().fill('example');
    state.expired = true;
    await signed.getByRole('button', { name: 'Evaluate Expression', exact: true }).click();
    for (let attempt = 0; attempt < 100 && !state.refreshStarted; attempt++) await signed.waitForTimeout(20);
    assert(state.refreshStarted);
    await signed.getByRole('button', { name: 'Sign Out', exact: true }).click();
    state.releaseRefresh();
    await signed.getByRole('link', { name: 'Continue without signing in' }).waitFor();
    await signed.waitForTimeout(200);
    assert.equal((await member.cookies()).filter(cookie => cookie.name === 'ra_edu_auth').length, 0);
    assert.equal(await signed.getByRole('button', { name: 'Sign Out', exact: true }).count(), 0);
    // Signed-in translation hints are next to the checked answer, not off-screen at the page top.
    state.expired = false;
    state.holdRefresh = false;
    await member.addCookies([{ name: 'ra_edu_auth', value: encodeURIComponent(JSON.stringify({ token: 'synthetic', email: 'member@example.test', refreshToken: 'refresh' })), url: base }]);
    await signed.goto(`${base}/ra-sql-reference`);
    await signed.getByLabel('Database collection').selectOption('PrivateDataset');
    await signed.getByRole('button', { name: 'Catalog practice', exact: true }).click();
    await signed.getByLabel('Choose a prompt from the catalog').selectOption('q1');
    for (const direction of ['SQL', 'RA']) {
      await signed.getByRole('button', { name: direction === 'RA' ? 'SQL → RA' : 'RA → SQL', exact: true }).click();
      await signed.getByRole('button', { name: `Write full ${direction}`, exact: true }).click();
      await signed.getByLabel(direction === 'RA' ? 'Full relational algebra answer' : 'Full SQL answer', { exact: true }).fill(direction === 'RA' ? 'example' : 'SELECT wrong FROM example');
      const aiCallsBefore = state.aiCalls.length;
      await signed.getByRole('button', { name: `Check ${direction}`, exact: true }).click();
      await signed.getByText('Translation feedback', { exact: true }).waitFor();
      assert.equal(state.aiCalls.length, aiCallsBefore, 'Checking must not call AI automatically');
      const answerActions = signed.getByRole('button', { name: `Check ${direction}`, exact: true }).locator('..');
      const aiAction = answerActions.getByRole('button', { name: 'Get AI translation hint', exact: true });
      assert.equal(await aiAction.count(), 1, 'AI hint action must be beside Check and Canonical controls');
      await aiAction.click();
      await signed.getByText('Use braces.', { exact: true }).waitFor();
      await signed.getByText(/^AI translation hint/).waitFor();
      assert.equal(state.aiCalls.length, aiCallsBefore + 1);
      assert(await signed.getByText('Use braces.', { exact: true }).isVisible());
    }
    await member.close();
    console.log('PASS: member AI requires explicit action and disclosure; decline sends nothing; policy changes ask again; logout clears private state; expiry never replays as guest; late refresh cannot restore a logged-out account');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
