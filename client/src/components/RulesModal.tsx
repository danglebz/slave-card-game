// RulesModal.tsx — กติกาเกมส์ไพ่สลาฟ (สลับ TH/EN ตาม store.lang)
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Icon } from '@/lib/icons';
import { useStore } from '@/store';

export function RulesModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const lang = useStore((s) => s.lang);
  const th = lang === 'th';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        open={open}
        id="rules-modal"
        className="rules-box"
        ariaLabelledby="rules-title"
      >
        <h2 id="rules-title">
          <Icon name="book-open" /> {th ? 'กติกาเกมส์ไพ่สลาฟ' : 'How to Play Slave'}
        </h2>
        <div className="rules-content">
          <h3>
            <Icon name="layers" /> {th ? 'อันดับไพ่' : 'Card ranking'}
          </h3>
          {th ? (
            <p>
              ต่ำ→สูง: <b>3 4 5 6 7 8 9 10 J Q K A</b> แล้ว <b>2 สูงสุด</b>
              <br />
              ดอกตัดสินเมื่อเท่ากัน: ♣ &lt; ♦ &lt; ♥ &lt; ♠
            </p>
          ) : (
            <p>
              Low→High: <b>3 4 5 6 7 8 9 10 J Q K A</b>, then <b>2 is highest</b>
              <br />
              Suit breaks ties: ♣ &lt; ♦ &lt; ♥ &lt; ♠
            </p>
          )}

          <h3>
            <Icon name="target" /> {th ? 'ชุดที่ลงได้' : 'Valid plays'}
          </h3>
          {th ? (
            <p>
              เดี่ยว · คู่ · ตอง · โฟร์ · <b>เรียง</b> (≥3 ใบ ต่อเนื่อง <b>ดอกเดียวกัน</b> ห้ามมี 2)
              <br />
              ต้องลงชุดประเภทเดียวกัน + สูงกว่ากองบนโต๊ะ
            </p>
          ) : (
            <p>
              Single · Pair · Triple · Four · <b>Straight</b> (≥3 consecutive, <b>same suit</b>, no
              2s)
              <br />
              Must match the current set type + beat the pile on the table
            </p>
          )}

          <h3>
            <Icon name="bomb" />{' '}
            {th ? 'บอมบ์ (กินกองเล็ก ไม่สนแต้ม)' : 'Bomb (beats small piles, ignores rank)'}
          </h3>
          {th ? (
            <>
              <p>
                <b>เดี่ยว</b> กินด้วย: ตอง · เรียงดอกเดียว 3 · เรียงดอกเดียว 5
                <br />
                <b>คู่</b> กินด้วย: โฟร์ · เรียงดอกเดียว 4 · เรียงดอกเดียว 6
              </p>
              <p>ความแรง: เรียง3 &lt; ตอง &lt; เรียง4 &lt; โฟร์ &lt; เรียง5 &lt; เรียง6</p>
            </>
          ) : (
            <>
              <p>
                <b>Single</b> beaten by: Triple · 3-card flush straight · 5-card flush straight
                <br />
                <b>Pair</b> beaten by: Four · 4-card flush straight · 6-card flush straight
              </p>
              <p>Strength: Straight3 &lt; Triple &lt; Straight4 &lt; Four &lt; Straight5 &lt; Straight6</p>
            </>
          )}

          <h3>
            <Icon name="refresh-cw" />{' '}
            {th ? 'ผ่าน / เคลียร์กอง / สลับทิศ' : 'Pass / Clear pile / Reverse'}
          </h3>
          {th ? (
            <p>
              ผ่านแล้ว<b>ถูกข้าม</b>จนกว่ากองจะเคลียร์ · ทุกคนผ่านถึงเจ้าของกอง → ล้างกอง นำใหม่
              <br />
              ถ้าเจ้าของกองหมดมือแล้วไม่มีใครกินได้ → <b>สลับทิศ</b> (ขวา↔ซ้าย)
            </p>
          ) : (
            <p>
              Once you pass you're <b>skipped</b> until the pile clears · everyone passes back to the
              pile owner → clear the pile, lead again
              <br />
              If the pile owner runs out and no one can beat it → <b>reverse direction</b> (right↔left)
            </p>
          )}

          <h3>
            <Icon name="play" /> {th ? 'เริ่มรอบ' : 'Starting a round'}
          </h3>
          {th ? (
            <p>
              <b>เกมแรก:</b> คนถือ 3♣ ขึ้นก่อน (กองแรกต้องมี 3♣)
              <br />
              <b>รอบ 2+:</b> สลาฟขึ้นก่อน ไม่ต้องมี 3♣ + หมุนหนีคิง
            </p>
          ) : (
            <p>
              <b>First game:</b> holder of 3♣ leads (the first pile must contain 3♣)
              <br />
              <b>Round 2+:</b> the Slave leads, no 3♣ required + turn order runs away from the King
            </p>
          )}

          <h3>
            <Icon name="crown" /> {th ? 'ยศ & แลกไพ่' : 'Ranks & card exchange'}
          </h3>
          {th ? (
            <p>
              <Icon name="crown" /> คิง · <Icon name="medal" /> ควีน · <Icon name="award" /> รองสลาฟ ·{' '}
              <Icon name="link" /> สลาฟ (ตามลำดับหมดมือ)
              <br />
              รอบใหม่แลกไพ่ (ตามสากล คงที่ทุกจำนวนคน): คิง↔สลาฟ <b>2 ใบ</b> · ควีน↔รองสลาฟ <b>1 ใบ</b>{' '}
              · สามัญชน<b>ไม่แลก</b>
              <br />
              ผู้แพ้ให้<b>ไพ่สูงสุดอัตโนมัติ</b> · ผู้ชนะ<b>เลือกไพ่คืนเอง</b>
            </p>
          ) : (
            <p>
              <Icon name="crown" /> King · <Icon name="medal" /> Queen · <Icon name="award" />{' '}
              Vice-Slave · <Icon name="link" /> Slave (by finishing order)
              <br />
              New round exchange (standard, fixed for any player count): King↔Slave <b>2 cards</b> ·
              Queen↔Vice-Slave <b>1 card</b> · commoners <b>don't exchange</b>
              <br />
              Losers give their <b>highest cards automatically</b> · winners <b>choose which to return</b>
            </p>
          )}

          <h3>
            <Icon name="link" /> {th ? 'คิงตกบัลลังก์' : 'King dethroned'}
          </h3>
          {th ? (
            <p>
              ถ้า<b>สลาฟหมดมือก่อนคิง</b> → คิงตกเป็นสลาฟ จบรอบ แจกใหม่ทันที แล้วแลกไพ่กับคิงใหม่
            </p>
          ) : (
            <p>
              If the <b>Slave finishes before the King</b> → the King becomes the Slave, round ends,
              redeal immediately, then exchange with the new King
            </p>
          )}
        </div>
        <DialogClose asChild>
          <button id="rules-close" className="primary" type="button">
            {th ? 'ปิด' : 'Close'}
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
