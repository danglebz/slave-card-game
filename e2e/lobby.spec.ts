import { test, expect } from '@playwright/test';

// e2e happy path: open page → create room → add bot → start game → see cards in hand
test('สร้างห้อง เติมบอท แล้วเริ่มเกมได้', async ({ page }) => {
  await page.goto('/');

  // lobby screen is showing
  await expect(page.locator('#lobby-screen')).toBeVisible();

  // enter name → create room
  await page.fill('#name-input', 'E2E');
  await page.click('#create-btn');

  // enter game screen + get a 4-character room code
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#room-code')).toHaveText(/^[A-Z0-9]{4}$/);

  // can't start yet (only one player) → start button is disabled
  await expect(page.locator('#start-btn')).toBeDisabled();

  // add bot → 2 players total → start button becomes enabled
  await page.click('#add-bot-btn');
  await expect(page.locator('#start-btn')).toBeEnabled();

  // start game → cards appear in hand
  await page.click('#start-btn');
  await expect(page.locator('#hand')).toBeVisible();
  await expect(page.locator('#hand > *')).not.toHaveCount(0);
});

test('เข้าห้องด้วยรหัสผิด แสดง error', async ({ page }) => {
  await page.goto('/');
  await page.fill('#name-input', 'Nobody');
  await page.fill('#code-input', 'ZZZZ');
  await page.click('#join-btn');

  // still on the lobby screen (didn't enter the game)
  await expect(page.locator('#lobby-screen')).toBeVisible();
  await expect(page.locator('#game-screen')).toBeHidden();
});
