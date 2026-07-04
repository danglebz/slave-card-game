import { useEffect, useRef } from 'react';
import { socket } from './lib/socket';
import { useStore } from './store';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { ConnBanner } from './components/ConnBanner';
import { Toast } from './components/Toast';
import { t } from './lib/i18n';

/**
 * App shell — เดินสาย socket events เข้า store (single source of truth)
 * แล้วสลับหน้า lobby/game ตาม store.screen
 */
export default function App() {
  const screen = useStore((s) => s.screen);
  const everConnected = useRef(false);

  useEffect(() => {
    const onConnect = () => {
      everConnected.current = true;
      useStore.getState().setConn(false);
    };
    const onDisconnect = () => {
      // ไม่โชว์แบนเนอร์ตอนโหลดครั้งแรก (ยังไม่เคยต่อ)
      if (everConnected.current) useStore.getState().setConn(true);
    };
    const onReconnect = () => useStore.getState().setConn(false);
    const onJoined = ({ code }: { code: string }) => {
      useStore.getState().goGame(code);
      const url = new URL(location.href);
      url.searchParams.set('room', code);
      history.replaceState(null, '', url);
    };
    const onLeft = () => {
      useStore.getState().goLobby();
      const url = new URL(location.href);
      url.searchParams.delete('room');
      history.replaceState(null, '', url);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect', onReconnect);
    socket.on('joined', onJoined);
    socket.on('left', onLeft);
    socket.on('state', (s) => useStore.getState().setRoomState(s));
    socket.on('errorMsg', (e) => {
      const st = useStore.getState();
      let vars = e.vars;
      // err.mustBeat: server ส่ง type/len/mode ของกอง → ประกอบชื่อชุด + hint บอมบ์ตามบริบท
      // (กัน "หรือบอมบ์" หลอก: กองเรียง6 ไม่มีบอมบ์กินได้, เดี่ยว/คู่กินได้แค่บอมบ์บางชนิด)
      if (e.key === 'err.mustBeat' && e.vars) {
        const type = String(e.vars.type);
        const len = Number(e.vars.len);
        let hintKey = '';
        if (e.vars.mode === 'bomb')
          hintKey = 'hint.bombStronger'; // โหมดบอมบ์ → บอมบ์แรงกว่ากินได้
        else if (type === 'single') hintKey = 'hint.bombOdd';
        else if (type === 'pair') hintKey = 'hint.bombEven';
        else if (type === 'straight' && len < 6) hintKey = 'hint.bombFour'; // เรียง6+ ไม่มีบอมบ์กินได้
        vars = {
          ...e.vars,
          want: t(st.lang, 'combo.' + type, { len }),
          bombHint: hintKey ? t(st.lang, hintKey) : '',
        };
      }
      st.showToast(t(st.lang, e.key, vars), 'error');
    });

    // auto-join จาก ?room=CODE ถ้ามีชื่อที่เคยบันทึกไว้
    const room = new URLSearchParams(location.search).get('room');
    const savedName = localStorage.getItem('name') || '';
    if (room && savedName) {
      const color = localStorage.getItem('color') || undefined;
      socket.emit('join', { code: room.toUpperCase(), name: savedName, color });
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect', onReconnect);
      socket.off('joined', onJoined);
      socket.off('left', onLeft);
      socket.off('state');
      socket.off('errorMsg');
    };
  }, []);

  return (
    <>
      <ConnBanner />
      {screen === 'lobby' ? <LobbyScreen /> : <GameScreen />}
      <Toast />
    </>
  );
}
