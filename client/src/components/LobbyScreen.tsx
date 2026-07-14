// LobbyScreen.tsx — room entry screen: name/code, create/join room (valibot), color, install, version
import { useEffect, useRef, useState } from 'react';
import { socket } from '@/lib/socket';
import { NameSchema, CodeSchema, validateField } from '@/lib/validation';
import { Icon, GithubMark } from '@/lib/icons';
import { useStore } from '@/store';
import { t, type Lang } from '@/lib/i18n';
import { progStart, progDone } from '@/lib/progress';
import { ProgressBar } from './ProgressBar';
import { RulesModal } from './RulesModal';
import { SupportModal } from './SupportModal';

// player colors (match Room.COLORS on the server) — stored in localStorage, randomized on first use
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

// copyright year — dynamic so it never goes stale
const YEAR = new Date().getFullYear();

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
  const [supportOpen, setSupportOpen] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  // seed the player color (random on first use) then keep it to send on create/join
  const colorRef = useRef<string>(initialColor());
  const lobbyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deferredInstall = useRef<Event & { prompt?: () => void; userChoice?: Promise<unknown> }>(
    null!,
  );

  // ---------- unlock the form when the server responds (joined / errorMsg) ----------
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
      // block the automatic prompt, keep it for the user to trigger via the button
      e.preventDefault();
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
    // an action is already pending
    if (loading) return false;
    setLoading(which);
    progStart();
    if (lobbyTimer.current) clearTimeout(lobbyTimer.current);
    lobbyTimer.current = setTimeout(() => {
      endAction();
      showToast(t(lang, 'lobby.slow'), 'error');
    }, 10000);
    return true;
  }

  function onCreate() {
    const res = validateField(NameSchema, name);
    setNameErr(res.ok ? null : t(lang, res.message));
    if (!res.ok) return;
    localStorage.setItem('name', res.value);
    if (startAction('create')) socket.emit('create', { name: res.value, color: colorRef.current });
  }

  function onJoin() {
    const nameRes = validateField(NameSchema, name);
    const codeRes = validateField(CodeSchema, code);
    setNameErr(nameRes.ok ? null : t(lang, nameRes.message));
    setCodeErr(codeRes.ok ? null : t(lang, codeRes.message));
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
            title={t(lang, 'lobby.install')}
            aria-label={t(lang, 'lobby.install')}
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
            <GithubMark />
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
                <Icon name="loader-circle" className="spin" /> {t(lang, 'lobby.creating')}
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
                    <Icon name="loader-circle" className="spin" /> {t(lang, 'lobby.joining')}
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
          <div className="card-links">
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
            <span className="foot-sep" aria-hidden="true">
              ·
            </span>
            <button id="support-btn" className="link-btn" onClick={() => setSupportOpen(true)}>
              <Icon name="coffee" /> <span>{t(lang, 'lobby.support')}</span>
            </button>
          </div>
        </div>
        <footer className="lobby-foot">
          <span className="lobby-copy">
            ©&nbsp;{YEAR}{' '}
            <a href="https://danglebz.com" target="_blank" rel="noopener">
              Danglebz
            </a>
          </span>
          <span className="foot-sep" aria-hidden="true">
            ·
          </span>
          <a
            id="app-version"
            className="app-version"
            href="https://github.com/Danglebz/slave-card-game/blob/main/CHANGELOG.md"
            target="_blank"
            rel="noopener"
            title={t(lang, 'lobby.changelog')}
          >
            v{__APP_VERSION__}
          </a>
        </footer>
      </section>
      <RulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
    </>
  );
}
