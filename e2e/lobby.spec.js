import { test, expect } from '@playwright/test';

// e2e happy path: เปิดหน้า → สร้างห้อง → เติมบอท → เริ่มเกม → เห็นไพ่ในมือ
test('สร้างห้อง เติมบอท แล้วเริ่มเกมได้', async ({ page }) => {
  await page.goto('/');

  // หน้าล็อบบี้แสดงอยู่
  await expect(page.locator('#lobby-screen')).toBeVisible();

  // ใส่ชื่อ → สร้างห้อง
  await page.fill('#name-input', 'E2E');
  await page.click('#create-btn');

  // เข้าหน้าเกม + ได้รหัสห้อง 4 ตัว
  await expect(page.locator('#game-screen')).toBeVisible();
  await expect(page.locator('#room-code')).toHaveText(/^[A-Z0-9]{4}$/);

  // เริ่มยังไม่ได้ (มีคนเดียว) → ปุ่ม start ถูก disable
  await expect(page.locator('#start-btn')).toBeDisabled();

  // เติมบอท → ครบ 2 คน → ปุ่ม start ใช้ได้
  await page.click('#add-bot-btn');
  await expect(page.locator('#start-btn')).toBeEnabled();

  // เริ่มเกม → มีไพ่ขึ้นในมือ
  await page.click('#start-btn');
  await expect(page.locator('#hand')).toBeVisible();
  await expect(page.locator('#hand > *')).not.toHaveCount(0);
});

test('เข้าห้องด้วยรหัสผิด แสดง error', async ({ page }) => {
  await page.goto('/');
  await page.fill('#name-input', 'Nobody');
  await page.fill('#code-input', 'ZZZZ');
  await page.click('#join-btn');

  // ยังอยู่หน้าล็อบบี้ (ไม่ได้เข้าเกม)
  await expect(page.locator('#lobby-screen')).toBeVisible();
  await expect(page.locator('#game-screen')).toBeHidden();
});
