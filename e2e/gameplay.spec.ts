import { test, expect, type Page } from '@playwright/test';

// สร้างห้อง + เติมบอท 1 ตัว + เริ่มเกม → พร้อมเล่น (มีไพ่ในมือ)
async function startGameVsBot(page: Page) {
  await page.goto('/');
  await page.fill('#name-input', 'E2E');
  await page.click('#create-btn');
  await expect(page.locator('#game-screen')).toBeVisible();
  await page.click('#add-bot-btn');
  await expect(page.locator('#start-btn')).toBeEnabled();
  await page.click('#start-btn');
  await expect(page.locator('#hand > *')).not.toHaveCount(0);
}

test('เลือกไพ่ในมือ → ติด selected, กดซ้ำ → ยกเลิก', async ({ page }) => {
  await startGameVsBot(page);

  const firstCard = page.locator('#hand .playing-card').first();
  await firstCard.click();
  await expect(firstCard).toHaveClass(/selected/);

  await firstCard.click();
  await expect(firstCard).not.toHaveClass(/selected/);
});

test('เริ่มเกมแล้วมีไพ่ลงกองกลาง (เรานำเอง หรือบอทนำ)', async ({ page }) => {
  await startGameVsBot(page);
  await expect(page.locator('#turn-info')).toBeVisible();

  // ถ้าเป็นตาเรานำ (กองยังว่าง) → เลือกไพ่ใบแรกแล้วลง → มือต้องลดลง 1 ใบ
  const myTurn = await page.locator('#turn-info.your-turn').isVisible();
  const pileEmpty = (await page.locator('#pile-cards > *').count()) === 0;
  if (myTurn && pileEmpty) {
    const before = await page.locator('#hand > *').count();
    await page.locator('#hand .playing-card').first().click();
    await expect(page.locator('#play-btn')).toBeVisible();
    await page.click('#play-btn');
    await expect(page.locator('#hand > *')).toHaveCount(before - 1);
  }

  // ไม่ว่าใครเป็นคนนำ กองกลางต้องมีไพ่ขึ้นในที่สุด (บอทเดินเองผ่าน socket)
  await expect(page.locator('#pile-cards > *')).not.toHaveCount(0, { timeout: 10_000 });
});
