// LobbyScreen.tsx — หน้าเข้าห้อง: ชื่อ/รหัส, สร้าง/เข้าห้อง (valibot), color, install, version
import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';
import { NameSchema, CodeSchema, validateField } from '@/lib/validation';
import { Icon } from '@/lib/icons';
import { useStore } from '@/store';
import { t, type Lang } from '@/lib/i18n';
import { progStart, progDone } from '@/lib/progress';
import { ProgressBar } from './ProgressBar';
import { RulesModal } from './RulesModal';

// สีประจำตัว (ตรงกับ Room.COLORS ฝั่ง server) — เก็บใน localStorage, สุ่มให้ครั้งแรก
const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
];

function initialColor(): string {
  let c = localStorage.getItem('color');
  if (!c || !AVATAR_COLORS.includes(c)) {
    c = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    localStorage.setItem('color', c);
  }
  return c;
}

export function LobbyScreen() {
  const lang = useStore((s) => s.lang);
  const setLang = useStore((s) => s.setLang);
  const showToast = useStore((s) => s.showToast);

  const [name, setName] = useState(() => localStorage.getItem('name') || '');
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get('room')?.toUpperCase() || '',
  );
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [loading, setLoading] = useState<null | 'create' | 'join'>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  // seed สีประจำตัว (สุ่มครั้งแรก) แล้วเก็บไว้ส่งตอน create/join
  const colorRef = useRef<string>(initialColor());
  const lobbyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredInstall = useRef<Event & { prompt?: () => void; userChoice?: Promise<unknown> }>(
    null!,
  );

  // ---------- ปลดล็อกฟอร์มเมื่อ server ตอบ (joined / errorMsg) ----------
  useEffect(() => {
    const end = () => endAction();
    socket.on('joined', end);
    socket.on('errorMsg', end);
    return () => {
      socket.off('joined', end);
      socket.off('errorMsg', end);
    };
  }, []);

  // ---------- PWA install button ----------
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // กัน prompt อัตโนมัติ เก็บไว้ให้ผู้ใช้กดปุ่มเอง
      deferredInstall.current = e as never;
      setCanInstall(true);
    };
    const onInstalled = () => {
      deferredInstall.current = null!;
      setCanInstall(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function endAction() {
    if (lobbyTimer.current) clearTimeout(lobbyTimer.current);
    lobbyTimer.current = null;
    setLoading((cur) => {
      if (cur) progDone();
      return null;
    });
  }

  function startAction(which: 'create' | 'join'): boolean {
    if (loading) return false; // มี action ค้างอยู่แล้ว
    setLoading(which);
    progStart();
    if (lobbyTimer.current) clearTimeout(lobbyTimer.current);
    lobbyTimer.current = setTimeout(() => {
      endAction();
      showToast('เชื่อมต่อช้า ลองอีกครั้ง', 'error');
    }, 10000);
    return true;
  }

  function onCreate() {
    const res = validateField(NameSchema, name);
    setNameErr(res.ok ? null : res.message);
    if (!res.ok) return;
    localStorage.setItem('name', res.value);
    if (startAction('create')) socket.emit('create', { name: res.value, color: colorRef.current });
  }

  function onJoin() {
    const nameRes = validateField(NameSchema, name);
    const codeRes = validateField(CodeSchema, code);
    setNameErr(nameRes.ok ? null : nameRes.message);
    setCodeErr(codeRes.ok ? null : codeRes.message);
    if (!nameRes.ok || !codeRes.ok) return;
    localStorage.setItem('name', nameRes.value);
    if (startAction('join'))
      socket.emit('join', { code: codeRes.value, name: nameRes.value, color: colorRef.current });
  }

  async function onInstall() {
    const d = deferredInstall.current;
    if (!d?.prompt) return;
    d.prompt();
    await d.userChoice;
    deferredInstall.current = null!;
    setCanInstall(false);
  }

  const busy = loading !== null;

  return (
    <>
      <ProgressBar />
      <section id="lobby-screen" className="screen">
        <div className="card-panel">
          <div className="lang-switch" role="group" aria-label="Language">
            {(['th', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                data-lang={l}
                className={l === lang ? 'active' : undefined}
                onClick={() => setLang(l)}
              >
                {l === 'th' ? 'ไทย' : 'EN'}
              </button>
            ))}
          </div>
          <button
            id="install-btn"
            className={`corner-btn corner-install${canInstall ? '' : ' hidden'}`}
            type="button"
            title="ติดตั้งแอปลงเครื่อง"
            aria-label="ติดตั้งแอป"
            onClick={onInstall}
          >
            <Icon name="download" />
          </button>
          <a
            className="corner-btn corner-tr"
            href="https://github.com/Danglebz/slave-card-game"
            target="_blank"
            rel="noopener"
            title="GitHub"
            aria-label="GitHub"
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
          <img className="project-logo" src="/logo.png" alt="" aria-hidden="true" />
          <h1>{t(lang, 'lobby.title')}</h1>
          <p className="sub">{t(lang, 'lobby.sub')}</p>
          <div className="field">
            <div className="input-icon">
              <Icon name="user" />
              <input
                id="name-input"
                className="text-center"
                maxLength={16}
                placeholder={t(lang, 'lobby.name')}
                autoComplete="off"
                aria-describedby="name-error"
                aria-invalid={nameErr ? 'true' : undefined}
                disabled={busy}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCreate();
                }}
              />
            </div>
            <p className="field-error" id="name-error" role="alert">
              {nameErr && (
                <>
                  <Icon name="circle-alert" /> {nameErr}
                </>
              )}
            </p>
          </div>
          <button
            id="create-btn"
            className={`primary${loading === 'create' ? ' loading' : ''}`}
            disabled={busy}
            onClick={onCreate}
          >
            {loading === 'create' ? (
              <>
                <Icon name="loader-circle" className="spin" /> กำลังสร้างห้อง...
              </>
            ) : (
              <>
                <Icon name="plus" /> <span>{t(lang, 'lobby.create')}</span>
              </>
            )}
          </button>
          <div className="divider">
            <span>{t(lang, 'lobby.or')}</span>
          </div>
          <div className="field">
            <div className="input-group">
              <span className="input-addon">
                <Icon name="hash" />
              </span>
              <input
                id="code-input"
                maxLength={4}
                placeholder={t(lang, 'lobby.code')}
                autoComplete="off"
                aria-describedby="code-error"
                aria-invalid={codeErr ? 'true' : undefined}
                disabled={busy}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeErr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onJoin();
                }}
              />
              <button
                id="join-btn"
                className={`primary${loading === 'join' ? ' loading' : ''}`}
                disabled={busy}
                onClick={onJoin}
              >
                {loading === 'join' ? (
                  <>
                    <Icon name="loader-circle" className="spin" /> กำลังเข้าห้อง...
                  </>
                ) : (
                  <>
                    <Icon name="log-in" /> <span>{t(lang, 'lobby.join')}</span>
                  </>
                )}
              </button>
            </div>
            <p className="field-error" id="code-error" role="alert">
              {codeErr && (
                <>
                  <Icon name="circle-alert" /> {codeErr}
                </>
              )}
            </p>
          </div>
          <a
            id="rules-btn"
            className="link-btn"
            role="button"
            tabIndex={0}
            onClick={() => setRulesOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setRulesOpen(true);
            }}
          >
            <Icon name="book-open" /> <span>{t(lang, 'lobby.rules')}</span>
          </a>
        </div>
        <footer className="lobby-foot">
          <a
            id="app-version"
            className="app-version"
            href="https://github.com/Danglebz/slave-card-game/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener"
            title="ดู changelog"
          >
            v{__APP_VERSION__}
          </a>
        </footer>
      </section>
      <RulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
    </>
  );
}
