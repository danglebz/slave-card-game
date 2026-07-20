import { test, expect, type Page } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

// The felt-green base painted inline in client/index.html (html,body{ background:#0c3f26 })
const FELT_GREEN = 'rgb(12, 63, 38)';

// วัดว่าหน้าเว็บเลื่อน (scroll) ได้ทั้งแนวตั้ง/แนวนอนหรือไม่ — ต้องไม่เลื่อนบนมือถือ
async function pageScroll(page: Page) {
  return page.evaluate(() => {
    const de = document.scrollingElement || document.documentElement;
    return {
      vScroll: de.scrollHeight - window.innerHeight,
      hScroll: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

// อ่านสีพื้นหลังของ <html> — guard ตรง ๆ ของบั๊กจอขาวบน iOS
async function htmlBg(page: Page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
}

test('lobby: ไม่จอขาว พื้นเขียว felt และไม่มี scrollbar บนมือถือ', async ({ page }) => {
  await page.goto('/');

  // ล็อบบี้ต้องแสดง (ไม่ใช่จอขาวว่าง ๆ)
  await expect(page.locator('#lobby-screen')).toBeVisible();
  await expect(page.locator('#name-input')).toBeVisible();
  await expect(page.locator('#create-btn')).toBeVisible();

  // พื้นหลังต้องถูก paint เป็นสีเขียว felt — guard ของบั๊กจอขาว iOS
  expect(await htmlBg(page)).toBe(FELT_GREEN);

  // ไม่มี scroll ทั้งแนวตั้งและแนวนอน
  const { vScroll, hScroll } = await pageScroll(page);
  expect(vScroll).toBeLessThanOrEqual(1);
  expect(hScroll).toBeLessThanOrEqual(1);

  // #lobby-screen ต้องมีขนาดจริง (กว้าง/สูง > 0)
  const box = await page.locator('#lobby-screen').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
});

test('เลี้ยงกาแฟ: เปิด modal แล้ว QR พร้อมเพย์เรนเดอร์ได้ + โชว์เบอร์ผู้รับที่ถูกต้อง', async ({
  page,
}) => {
  await page.goto('/');
  await page.click('#support-btn');

  const modal = page.locator('#support-modal');
  await expect(modal).toBeVisible();

  // พร้อมเพย์ถูกซ่อนไว้ในตอนแรก (Collapsible) — ต้องกดเปิดก่อนถึงจะเห็น QR
  await page.click('#support-qr-toggle');

  // QR ถูก encode เป็น data URL แล้ว (ไม่ใช่ img ว่าง)
  await expect(modal.locator('.thaiqr-qr')).toHaveAttribute('src', /^data:image\/png;base64,/);

  // เบอร์ผู้รับต้องโชว์บนแผ่น QR ให้ถูก — ผิดตัวเดียว = เงินเข้าคนอื่น
  await expect(modal.locator('.thaiqr-id')).toContainText('085-796-8525');

  // ปุ่มจ่ายด้วยบัตรต้องชี้ไปหน้า Ko-fi ที่ถูกต้อง — ผิด URL = เงินไปเข้าคนอื่นเหมือนกัน
  await expect(modal.locator('a.support-donate-card')).toHaveAttribute(
    'href',
    'https://ko-fi.com/danglebz',
  );

  // modal เปิดอยู่ก็ห้ามทำให้หน้าเลื่อนได้
  const { hScroll } = await pageScroll(page);
  expect(hScroll).toBeLessThanOrEqual(1);
});

// เรื่องเงิน: มีโลโก้พร้อมเพย์ทับกลาง QR อยู่ → ถ้าใครขยายโลโก้ หรือลด errorCorrectionLevel จาก 'H'
// QR จะสแกนไม่ติดแบบเงียบๆ (ไม่มี error ให้เห็น คนโอนไม่ได้แต่เราไม่รู้) → ถอดรหัส "พิกเซลที่เรนเดอร์จริง" มายืนยัน
test('เลี้ยงกาแฟ: QR ที่มีโลโก้ทับกลาง ยังถอดรหัสได้และชี้ไปเบอร์ที่ถูกต้อง', async ({ page }) => {
  await page.goto('/');
  await page.click('#support-btn');
  await page.click('#support-qr-toggle');

  const qr = page.locator('#support-modal .thaiqr-qr');
  await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/);

  // แคปเฉพาะรูป QR ตามขนาดที่แสดงบนจอ = สิ่งที่กล้องมือถือเห็นจริง (เคสโหดสุด)
  const png = PNG.sync.read(await qr.screenshot());
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

  expect(decoded, 'QR ต้องยังสแกนติดทั้งที่มีโลโก้ทับ').not.toBeNull();
  // เบอร์ในรูปแบบสากล: 0066 + เบอร์ไม่มี 0 นำ
  expect(decoded!.data).toContain('0113' + '0066857968525');
  // ยังเป็น QR แบบไม่ระบุยอด (flag 11) → ผู้โอนพิมพ์จำนวนเงินเอง
  expect(decoded!.data.startsWith('000201' + '010211')).toBe(true);
});

test('game: เริ่มเกมบนมือถือแล้วพอดีจอ ไม่มี scroll แนวนอน พื้นยังเขียว', async ({ page }) => {
  await page.goto('/');

  // flow เดียวกับ gameplay.spec: กรอกชื่อ → สร้างห้อง → เติมบอท → เริ่มเกม
  await page.fill('#name-input', 'E2E');
  await page.click('#create-btn');
  await expect(page.locator('#game-screen')).toBeVisible();
  await page.click('#add-bot-btn');
  await expect(page.locator('#start-btn')).toBeEnabled();
  await page.click('#start-btn');
  await expect(page.locator('#hand > *')).not.toHaveCount(0);

  // เกมต้องพอดี viewport: ไม่มี scroll แนวนอน และแนวตั้งเลื่อนได้แค่เล็กน้อยเท่านั้น
  const { vScroll, hScroll } = await pageScroll(page);
  expect(hScroll).toBeLessThanOrEqual(1);
  expect(vScroll).toBeLessThanOrEqual(1);

  // พื้นหลังยังถูก paint เขียว felt — ไม่มีขอบขาวโผล่รอบ safe-area
  expect(await htmlBg(page)).toBe(FELT_GREEN);
});

// บั๊กจอขาว iOS จริง ๆ ถูกแก้ที่ inline <style> ใน index.html ซึ่ง paint "ก่อน" CSS bundle โหลด
// (getComputedStyle ด้านบนอ่านสถานะหลัง bundle โหลด → ถ้าลบ inline ทิ้งแต่เก็บ style.css ไว้ ยังเขียวอยู่ = จับบั๊กเฟรมแรกไม่ได้)
// เทสต์นี้ดึง HTML "ดิบ" ที่ server ส่ง (ยังไม่รัน JS/CSS) = สิ่งที่ browser paint เฟรมแรกจริง ๆ → guard ตรงจุด
test('first-paint: index.html ฝัง html,body background inline กันจอขาวก่อน CSS bundle โหลด', async ({
  page,
}) => {
  const html = await (await page.request.get('/')).text();
  // ต้องมี inline <style> ที่เซ็ต html,body { background:#0c3f26 } — จุดที่แก้บั๊กจอขาว iOS
  expect(html).toMatch(/<style>[\s\S]*?html,\s*body\s*\{\s*background:\s*#0c3f26/i);
  // #root ต้องมี pre-render skeleton สูงเต็มจอ (ไม่ใช่ div ว่าง) → กันจอว่างช่วง JS ยังไม่ mount
  expect(html).toMatch(/id="root"[\s\S]*?min-height:\s*100dvh/i);
});
