// GameScreen.tsx — หน้าโต๊ะเล่น: topbar, spectator, โต๊ะ, log, มือ + ปุ่ม, modals
// + เอฟเฟกต์ side: เล่นเสียงตามเหตุการณ์ (playSfx) + แจ้งเตือนถึงตา (notifyTurn) + notice toast
import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { useStore } from '@/store';
import { Icon } from '@/lib/icons';
import { t } from '@/lib/i18n';
import { copyText } from '@/lib/clipboard';
import { initialHandSort, type HandSort } from '@/lib/gameLogic';
import { sfx, primeAudio, beep, notifPref, flashTitle, stopFlash } from '@/lib/audio';
import { Table } from './game/Table';
import { Log } from './game/Log';
import { Hand } from './game/Hand';
import { ComboHints } from './game/ComboHints';
import { BotControls, Actions } from './game/Controls';
import { ResultModal } from './ResultModal';
import { ShareModal } from './ShareModal';
import { SettingsModal } from './SettingsModal';
import { LeaveModal } from './LeaveModal';

// เอฟเฟกต์ชนะ — โปรยกระดาษหลายช็อต (เคารพ prefers-reduced-motion)
function fireWinConfetti(): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#f5c542', '#ffffff', '#22c55e', '#eab308'];
  confetti({ particleCount: 90, spread: 75, startVelocity: 45, origin: { y: 0.62 }, colors });
  setTimeout(
    () => confetti({ particleCount: 60, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors }),
    150,
  );
  setTimeout(
    () => confetti({ particleCount: 60, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors }),
    300,
  );
}

export function GameScreen() {
  const s = useStore((st) => st.state);
  const roomCode = useStore((st) => st.roomCode);
  const lang = useStore((st) => st.lang);
  const showToast = useStore((st) => st.showToast);

  const [handSort, setHandSort] = useState<HandSort>(initialHandSort);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // รีเซ็ตการปิดผลรอบเมื่อขึ้นรอบใหม่ (phase ออกจาก finished) → รอบหน้าโชว์ผลอีกครั้ง
  useEffect(() => {
    if (s?.phase !== 'finished') setResultDismissed(false);
  }, [s?.phase]);

  // ---------- animation แจกไพ่: เพิ่ม dealId เมื่อ "เริ่มรอบใหม่จริง" (แจกไพ่สด) ----------
  // lobby/finished → playing/exchange = แจกไพ่ใหม่ ; exchange → playing (รอบเดียวกัน) ไม่นับ
  const [dealId, setDealId] = useState(0);
  const prevPhaseDeal = useRef<string | null>(null);
  useEffect(() => {
    const ph = s?.phase;
    const prev = prevPhaseDeal.current;
    if (
      (ph === 'playing' || ph === 'exchange') &&
      (prev === 'lobby' || prev === 'finished') // prev=null (reconnect กลางเกม) → ไม่เล่น animation
    ) {
      setDealId((d) => d + 1);
    }
    prevPhaseDeal.current = ph ?? null;
  }, [s?.phase]);

  const code = s?.code || roomCode;

  // ---------- เสียงตามเหตุการณ์ (port playSfx) ----------
  const prevPileKey = useRef<string | null>(null); // null = ยังไม่ตั้ง baseline
  const prevPhaseSfx = useRef<string | null>(null);
  // ---------- แจ้งเตือนถึงตา (port notifyTurn) ----------
  const prevMyTurn = useRef(false);

  useEffect(() => {
    if (!s) return;
    // playSfx
    const key = s.pileCards && s.pileCards.length ? s.pileCards.map((c) => c.id).join(',') : '';
    if (prevPileKey.current !== null && s.phase === 'playing') {
      if (key && key !== prevPileKey.current) {
        sfx(s.pile && s.pile.mode === 'bomb' ? 'bomb' : 'play'); // มีไพ่ลงใหม่
      } else if (!key && prevPileKey.current) {
        sfx('clear'); // กองถูกเคลียร์
      }
    }
    prevPileKey.current = key;
    if (s.phase === 'finished' && prevPhaseSfx.current !== 'finished' && Array.isArray(s.result)) {
      const me = s.players.find((p) => p.isYou);
      const rank = me ? s.result.findIndex((r) => r.name === me.name) : -1;
      if (rank === 0) {
        sfx('win');
        fireWinConfetti(); // เอฟเฟกต์ชนะ (เฉพาะคิง)
      } else if (rank === s.result.length - 1) sfx('lose');
    }
    prevPhaseSfx.current = s.phase;

    // notifyTurn
    const myTurn = s.phase === 'playing' && s.turn === s.youIndex;
    if (myTurn && !prevMyTurn.current) {
      if (notifPref.sound) {
        primeAudio();
        beep();
      }
      if (notifPref.vibrate) navigator.vibrate?.(200);
      if ((notifPref.sound || notifPref.vibrate) && document.hidden) flashTitle();
    }
    if (!myTurn) stopFlash();
    prevMyTurn.current = myTurn;
  }, [s]);

  // ---------- notice เด้ง (เช่น คิงตกบัลลังก์) — โชว์ครั้งเดียวต่อ seq ----------
  const lastNoticeSeq = useRef(0);
  useEffect(() => {
    if (s?.notice && s.notice.seq !== lastNoticeSeq.current) {
      lastNoticeSeq.current = s.notice.seq;
      showToast(t(lang, s.notice.key, s.notice.vars));
    }
  }, [s, showToast, lang]);

  function onCopyCode() {
    if (!code) return;
    copyText(code).then((ok) => {
      if (ok) {
        setCopied(true);
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        copiedTimer.current = setTimeout(() => setCopied(false), 1400);
      }
      showToast(t(lang, ok ? 'toast.codeCopied' : 'toast.copyFail', { code }));
    });
  }

  function toggleSort() {
    setHandSort((cur) => {
      const next = cur === 'rank' ? 'bomb' : 'rank';
      localStorage.setItem('handSort', next);
      return next;
    });
  }

  function openLeave() {
    setSettingsOpen(false);
    setLeaveOpen(true);
  }

  if (!s) {
    // ยังไม่มี state (เพิ่งเข้าห้อง) — โครงหน้าเปล่าๆ ไว้ก่อน
    return <GameShell code={code} lang={lang} />;
  }

  const spec = !!s.youAreSpectator;
  const specCount = s.spectatorCount || 0;
  const playing = s.phase !== 'lobby' && s.phase !== 'finished';
  const showSort = s.phase === 'playing';

  return (
    <section id="game-screen" className="screen">
      <header id="topbar">
        <button
          className={`room-code${copied ? ' copied' : ''}`}
          id="room-code-box"
          type="button"
          title={t(lang, 'topbar.copyCode')}
          onClick={onCopyCode}
        >
          <Icon name="hash" />
          <strong id="room-code">{code}</strong>
          <Icon name={copied ? 'check' : 'copy'} className="room-copy-ico" />
        </button>
        <span
          id="spectator-count"
          className={`spec-count${specCount === 0 ? ' hidden' : ''}`}
          title={t(lang, 'topbar.spectators')}
        >
          <Icon name="eye" /> <span id="spec-n">{specCount}</span>
        </span>
        <button
          id="share-btn"
          className="icon-btn hidden"
          type="button"
          title={t(lang, 'topbar.share')}
          aria-label={t(lang, 'topbar.shareAria')}
          onClick={() => setShareOpen(true)}
        >
          <Icon name="qr-code" />
        </button>
        <button
          id="settings-btn"
          className="icon-btn"
          type="button"
          title={t(lang, 'set.title')}
          aria-label={t(lang, 'set.title')}
          onClick={() => setSettingsOpen(true)}
        >
          <Icon name="settings" />
        </button>
      </header>

      <div id="spectator-banner" className={`spectator-banner${spec ? '' : ' hidden'}`}>
        <Icon name="eye" /> <span>{t(lang, 'banner.spectator')}</span>
      </div>

      <Table s={s} />

      <Log s={s} />

      <div id="hand-area" className={spec ? 'hidden' : undefined}>
        <BotControls s={s} />
        <ComboHints s={s} />
        <button
          id="sort-toggle"
          type="button"
          className={showSort ? undefined : 'hidden'}
          onClick={toggleSort}
        >
          {handSort === 'bomb' ? (
            <>
              <Icon name="bomb" /> {t(lang, 'game.sortBomb')}
            </>
          ) : (
            <>
              <Icon name="list-ordered" /> {t(lang, 'game.sortRank')}
            </>
          )}
        </button>
        <Hand s={s} handSort={handSort} dealId={dealId} />
        <Actions s={s} />
      </div>

      <ResultModal
        open={s.phase === 'finished' && !!s.result && !resultDismissed}
        result={s.result}
        onOpenChange={(o) => !o && setResultDismissed(true)}
      />
      <ShareModal open={shareOpen} code={code} onOpenChange={setShareOpen} />
      <SettingsModal open={settingsOpen} s={s} onOpenChange={setSettingsOpen} onLeave={openLeave} />
      <LeaveModal open={leaveOpen} playing={playing} onOpenChange={setLeaveOpen} />
    </section>
  );
}

// โครงหน้าเปล่า ขณะรอ state แรกจาก server (กัน flash) — คง id หลักไว้ให้ e2e/CSS
function GameShell({
  code,
  lang,
}: {
  code: string;
  lang: ReturnType<typeof useStore.getState>['lang'];
}) {
  return (
    <section id="game-screen" className="screen">
      <header id="topbar">
        <button className="room-code" id="room-code-box" type="button">
          <Icon name="hash" />
          <strong id="room-code">{code}</strong>
          <Icon name="copy" className="room-copy-ico" />
        </button>
        <button
          id="settings-btn"
          className="icon-btn"
          type="button"
          title={t(lang, 'set.title')}
          aria-label={t(lang, 'set.title')}
        >
          <Icon name="settings" />
        </button>
      </header>
      <div id="table" />
      <div id="log" />
      <div id="hand-area">
        <div id="hand" />
        <div id="actions">
          <button id="start-btn" className="primary hidden">
            <Icon name="play" /> <span>{t(lang, 'game.start')}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
