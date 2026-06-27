// Controls.tsx — แถบปุ่มล่าง + bot-controls (port renderControls/updatePlayBtn)
// แสดง/ปิดปุ่มตามเฟส + สิทธิ์หัวห้อง, emit ผ่าน socket แล้วล้าง selection
import type { RoomState } from '@shared/types';
import { socket } from '@/lib/socket';
import { Icon } from '@/lib/icons';
import { t } from '@/lib/i18n';
import { useStore } from '@/store';

export function BotControls({ s }: { s: RoomState }) {
  const isHost = s.youAreHost;
  const show = s.phase === 'lobby' && isHost;
  return (
    <div id="bot-controls" className={`bot-controls${show ? '' : ' hidden'}`}>
      <button
        id="add-bot-btn"
        type="button"
        disabled={s.players.length >= 6}
        onClick={() => socket.emit('addBot')}
      >
        <Icon name="bot" /> <span>{t(useStore.getState().lang, 'game.addBot')}</span>
      </button>
      <button
        id="remove-bot-btn"
        type="button"
        disabled={!s.players.some((p) => p.isBot)}
        onClick={() => socket.emit('removeBot')}
      >
        <Icon name="bot-off" /> <span>{t(useStore.getState().lang, 'game.removeBot')}</span>
      </button>
      <button
        id="shuffle-btn"
        type="button"
        disabled={s.players.length < 2}
        onClick={() => socket.emit('shuffleSeats')}
      >
        <Icon name="shuffle" /> <span>{t(useStore.getState().lang, 'game.shuffle')}</span>
      </button>
    </div>
  );
}

export function Actions({ s }: { s: RoomState }) {
  const lang = useStore((st) => st.lang);
  const selected = useStore((st) => st.selected);
  const clearSelected = useStore((st) => st.clearSelected);

  const isHost = s.youAreHost;
  const connectedCount = s.players.filter((p) => p.connected).length;
  const myTurn = s.phase === 'playing' && s.turn === s.youIndex;

  const showStart = s.phase === 'lobby' && isHost;
  const startDisabled = connectedCount < 2;
  const showAgain = s.phase === 'finished' && isHost;
  const showPlay = s.phase === 'playing';
  const showPass = s.phase === 'playing';
  const ex = s.phase === 'exchange' ? s.exchange : null;
  const showGive = s.phase === 'exchange' && !!s.exchange && !s.exchange.myDone;

  const playDisabled = !myTurn || selected.size === 0;
  const passDisabled = !myTurn || !s.pile; // นำกองไม่ให้ผ่าน
  const giveDisabled = !(ex && !ex.myDone && selected.size === ex.myCount);

  function onPlay() {
    if (selected.size === 0) return;
    socket.emit('play', { cards: [...selected] });
    clearSelected();
  }
  function onPass() {
    socket.emit('pass');
    clearSelected();
  }
  function onGive() {
    if (!ex || selected.size !== ex.myCount) return;
    socket.emit('give', { cards: [...selected] });
    clearSelected();
  }

  return (
    <div id="actions">
      <button
        id="play-btn"
        className={`primary${showPlay ? '' : ' hidden'}`}
        disabled={playDisabled}
        onClick={onPlay}
      >
        <Icon name="play" /> <span>{t(lang, 'game.play')}</span>
      </button>
      <button
        id="pass-btn"
        className={showPass ? '' : 'hidden'}
        disabled={passDisabled}
        onClick={onPass}
      >
        <Icon name="skip-forward" /> <span>{t(lang, 'game.pass')}</span>
      </button>
      <button
        id="give-btn"
        className={`primary${showGive ? '' : ' hidden'}`}
        disabled={giveDisabled}
        onClick={onGive}
      >
        <Icon name="gift" /> <span>{t(lang, 'game.give')}</span>
      </button>
      <button
        id="start-btn"
        className={`primary${showStart ? '' : ' hidden'}`}
        disabled={startDisabled}
        onClick={() => socket.emit('start')}
      >
        <span>{showStart && startDisabled ? t(lang, 'game.waitMore') : t(lang, 'game.start')}</span>
      </button>
      <button
        id="again-btn"
        className={`primary${showAgain ? '' : ' hidden'}`}
        onClick={() => socket.emit('again')}
      >
        <Icon name="rotate-ccw" /> <span>{t(lang, 'game.again')}</span>
      </button>
    </div>
  );
}
