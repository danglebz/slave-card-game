// RulesModal.tsx — กติกาไพ่สลาฟ (static content, port 1:1 จาก index.html)
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Icon } from '@/lib/icons';

export function RulesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        open={open}
        id="rules-modal"
        className="rules-box"
        ariaLabelledby="rules-title"
      >
        <h2 id="rules-title">
          <Icon name="book-open" /> กติกาไพ่สลาฟ
        </h2>
        <div className="rules-content">
          <h3>
            <Icon name="layers" /> อันดับไพ่
          </h3>
          <p>
            ต่ำ→สูง: <b>3 4 5 6 7 8 9 10 J Q K A</b> แล้ว <b>2 สูงสุด</b>
            <br />
            ดอกตัดสินเมื่อเท่ากัน: ♣ &lt; ♦ &lt; ♥ &lt; ♠
          </p>

          <h3>
            <Icon name="target" /> ชุดที่ลงได้
          </h3>
          <p>
            เดี่ยว · คู่ · ตอง · โฟร์ · <b>เรียง</b> (≥3 ใบ ต่อเนื่อง <b>ดอกเดียวกัน</b> ห้ามมี 2)
            <br />
            ต้องลงชุดประเภทเดียวกัน + สูงกว่ากองบนโต๊ะ
          </p>

          <h3>
            <Icon name="bomb" /> บอมบ์ (กินกองเล็ก ไม่สนแต้ม)
          </h3>
          <p>
            <b>เดี่ยว</b> กินด้วย: ตอง · เรียงดอกเดียว 3 · เรียงดอกเดียว 5
            <br />
            <b>คู่</b> กินด้วย: โฟร์ · เรียงดอกเดียว 4 · เรียงดอกเดียว 6
          </p>
          <p>ความแรง: เรียง3 &lt; ตอง &lt; เรียง4 &lt; โฟร์ &lt; เรียง5 &lt; เรียง6</p>

          <h3>
            <Icon name="refresh-cw" /> ผ่าน / เคลียร์กอง / สลับทิศ
          </h3>
          <p>
            ผ่านแล้ว<b>ถูกข้าม</b>จนกว่ากองจะเคลียร์ · ทุกคนผ่านถึงเจ้าของกอง → ล้างกอง นำใหม่
            <br />
            ถ้าเจ้าของกองหมดมือแล้วไม่มีใครกินได้ → <b>สลับทิศ</b> (ขวา↔ซ้าย)
          </p>

          <h3>
            <Icon name="play" /> เริ่มรอบ
          </h3>
          <p>
            <b>เกมแรก:</b> คนถือ 3♣ ขึ้นก่อน (กองแรกต้องมี 3♣)
            <br />
            <b>รอบ 2+:</b> สลาฟขึ้นก่อน ไม่ต้องมี 3♣ + หมุนหนีคิง
          </p>

          <h3>
            <Icon name="crown" /> ยศ &amp; แลกไพ่
          </h3>
          <p>
            <Icon name="crown" /> คิง · <Icon name="medal" /> ควีน · <Icon name="award" /> รองสลาฟ ·{' '}
            <Icon name="link" /> สลาฟ (ตามลำดับหมดมือ)
            <br />
            รอบใหม่แลกไพ่: สลาฟ↔คิง 2 ใบ · รองสลาฟ↔ควีน 1 ใบ
            <br />
            ผู้แพ้ให้<b>ไพ่สูงสุดอัตโนมัติ</b> · ผู้ชนะ<b>เลือกไพ่คืนเอง</b>
          </p>

          <h3>
            <Icon name="link" /> คิงตกบัลลังก์
          </h3>
          <p>
            ถ้า<b>สลาฟหมดมือก่อนคิง</b> → คิงตกเป็นสลาฟ จบรอบ แจกใหม่ทันที แล้วแลกไพ่กับคิงใหม่
          </p>
        </div>
        <DialogClose asChild>
          <button id="rules-close" className="primary" type="button">
            ปิด
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
