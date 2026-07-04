import { useEffect, useRef } from 'react';
import { socket } from './lib/socket';
import { useStore } from './store';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { ConnBanner } from './components/ConnBanner';
import { Toast } from './components/Toast';
import { t } from './lib/i18n';
import { syncPushSubscription } from './lib/push';

/**
 * App shell — wire socket events into the store (single source of truth)
 * then switch the lobby/game screen based on store.screen
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
      // don't show the banner on first load (never connected yet)
      if (everConnected.current) useStore.getState().setConn(true);
    };
    const onReconnect = () => useStore.getState().setConn(false);
    const onJoined = ({ code }: { code: string }) => {
      useStore.getState().goGame(code);
      const url = new URL(location.href);
      url.searchParams.set('room', code);
      history.replaceState(null, '', url);
      // joined the room and the server knows our seat → bind the Web Push subscription to this seat
      void syncPushSubscription(useStore.getState().lang);
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
      // err.mustBeat: server sends the pile's type/len/mode → build the combo name + a contextual bomb hint
      // (avoid a misleading "or bomb": a 6-straight pile has no bomb that beats it; single/pair are only beaten by certain bombs)
      if (e.key === 'err.mustBeat' && e.vars) {
        const type = String(e.vars.type);
        const len = Number(e.vars.len);
        let hintKey = '';
        if (e.vars.mode === 'bomb')
          // bomb mode → a stronger bomb can beat it
          hintKey = 'hint.bombStronger';
        else if (type === 'single') hintKey = 'hint.bombOdd';
        else if (type === 'pair') hintKey = 'hint.bombEven';
        // 6+ straights have no bomb that beats them
        else if (type === 'straight' && len < 6) hintKey = 'hint.bombFour';
        vars = {
          ...e.vars,
          want: t(st.lang, 'combo.' + type, { len }),
          bombHint: hintKey ? t(st.lang, hintKey) : '',
        };
      }
      st.showToast(t(st.lang, e.key, vars), 'error');
    });

    // auto-join from ?room=CODE if a previously saved name exists
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
