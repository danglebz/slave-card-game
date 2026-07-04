// SettingsModal.tsx — ตั้งค่า (port settings-modal + syncSettingsUI + handlers)
// ห้อง (timer/autopass/turnSeconds) = หัวห้องคุม → emit settings
// ส่วนตัว: ภาษา, สีประจำตัว (react-colorful), แจ้งเตือน (เสียง/สั่น), เสียงเอฟเฟกต์
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { ColorPicker } from '@/components/ColorPicker';
import { Switch } from '@/components/ui/switch';
import { Icon } from '@/lib/icons';
import { t, displayName, type Lang } from '@/lib/i18n';
import { socket } from '@/lib/socket';
import { useStore } from '@/store';
import {
  primeAudio,
  beep,
  sfx,
  sfxPref,
  setSfxPref,
  notifPref,
  setNotifSound,
  setNotifVibrate,
  type SfxKey,
} from '@/lib/audio';
import { pushSupported, pushState, enablePush, disablePush, type PushState } from '@/lib/push';
import type { RoomState } from '@shared/types';

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

export function SettingsModal({
  open,
  s,
  onOpenChange,
  onLeave,
}: {
  open: boolean;
  s: RoomState | null;
  onOpenChange: (o: boolean) => void;
  onLeave: () => void;
}) {
  const lang = useStore((st) => st.lang);
  const setLang = useStore((st) => st.setLang);
  const showToast = useStore((st) => st.showToast);

  // prefs ส่วนตัว (local state สะท้อน lib/audio singleton + localStorage)
  const [notifSound, setNotifSoundS] = useState(notifPref.sound);
  const [notifVibrate, setNotifVibrateS] = useState(notifPref.vibrate);
  const [push, setPushS] = useState<PushState>(() => pushState());
  const [sfxState, setSfxState] = useState<Record<SfxKey, boolean>>({ ...sfxPref });
  const [color, setColor] = useState(() => {
    const c = localStorage.getItem('color') || '#3b82f6';
    return /^#[0-9a-f]{6}$/i.test(c) ? c : '#3b82f6';
  });

  const st = s?.settings || {
    timer: true,
    autoPass: true,
    autoPassStuck: true,
    allowTriple: true,
    allowQuad: true,
    allowStraight: true,
    turnSeconds: 30,
  };
  const isHost = !!s?.youAreHost;
  const curSec = st.turnSeconds || 30;

  function emitSettings(patch: {
    timer?: boolean;
    autoPass?: boolean;
    autoPassStuck?: boolean;
    allowTriple?: boolean;
    allowQuad?: boolean;
    allowStraight?: boolean;
    turnSeconds?: number;
  }) {
    if (!s?.youAreHost) return;
    socket.emit('settings', patch);
  }

  function onColorInput(v: string) {
    setColor(v);
    localStorage.setItem('color', v); // อัปเดตสดตอนเลือก
  }
  function onColorCommit(v: string) {
    socket.emit('setColor', { color: v }); // ส่งตอนปิด picker / เลือก swatch
  }

  function toggleSfx(key: SfxKey, demo: 'play' | 'bomb' | 'win', on: boolean) {
    setSfxPref(key, on);
    setSfxState((p) => ({ ...p, [key]: on }));
    if (on) {
      primeAudio();
      sfx(demo); // ตัวอย่างเสียง
    }
  }

  // Web Push: เปิด = ขอสิทธิ์ + subscribe (ต้องมาจากการกดปุ่มนี้); ปิด = ยกเลิก
  async function togglePush(on: boolean) {
    if (on) {
      const r = await enablePush(lang);
      setPushS(r);
      if (r === 'on') showToast(t(lang, 'toast.pushOn'), 'success');
      else if (r === 'denied') showToast(t(lang, 'toast.pushDenied'), 'error');
      else if (r === 'off')
        void 0; // ผู้ใช้กดยกเลิก dialog สิทธิ์ → เงียบ
      else showToast(t(lang, 'toast.pushFail'), 'error');
    } else {
      await disablePush();
      setPushS('off');
    }
  }

  const SEG_SECS = [15, 30, 45, 60];
  const segDisabled = !isHost || st.timer === false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="settings-modal" className="settings-box" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            <Icon name="settings" /> <span>{t(lang, 'set.title')}</span>
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="settings-list">
          <p className="settings-group-label">
            <Icon name="users" /> <span>{t(lang, 'set.room')}</span>
            {!isHost && (
              <span id="settings-host-tag" className="settings-tag">
                {t(lang, 'set.hostTag')}
              </span>
            )}
          </p>
          <label className="setting-row" htmlFor="set-timer">
            <span className="setting-label">
              <Icon name="timer" /> <span>{t(lang, 'set.timer')}</span>
            </span>
            <Switch
              id="set-timer"
              checked={st.timer !== false}
              disabled={!isHost}
              onCheckedChange={(c) => emitSettings({ timer: c, autoPass: st.autoPass !== false })}
            />
          </label>
          <label className="setting-row" htmlFor="set-autopass">
            <span className="setting-label">
              <Icon name="skip-forward" /> <span>{t(lang, 'set.autopass')}</span>
            </span>
            <Switch
              id="set-autopass"
              checked={st.autoPass !== false}
              disabled={!isHost || st.timer === false}
              onCheckedChange={(c) => emitSettings({ timer: st.timer !== false, autoPass: c })}
            />
          </label>
          <label className="setting-row" htmlFor="set-autostuck">
            <span className="setting-label">
              <Icon name="skip-forward" /> <span>{t(lang, 'set.autostuck')}</span>
            </span>
            <Switch
              id="set-autostuck"
              checked={st.autoPassStuck !== false}
              disabled={!isHost}
              onCheckedChange={(c) => emitSettings({ autoPassStuck: c })}
            />
          </label>
          <div className="setting-row">
            <span className="setting-label">
              <Icon name="clock" /> <span>{t(lang, 'set.turnsec')}</span>
            </span>
            <div
              className="seg"
              id="turn-seconds-seg"
              role="group"
              aria-label={t(lang, 'set.turnsec')}
            >
              {SEG_SECS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  data-sec={sec}
                  className={sec === curSec ? 'active' : undefined}
                  disabled={segDisabled}
                  onClick={() => emitSettings({ turnSeconds: sec })}
                >
                  {sec}
                </button>
              ))}
            </div>
          </div>

          <p className="settings-sub-label">
            <Icon name="bomb" /> <span>{t(lang, 'set.combos')}</span>
          </p>
          <label className="setting-row setting-row-sub" htmlFor="set-allow-triple">
            <span className="setting-label">
              <Icon name="layers" /> <span>{t(lang, 'set.allowTriple')}</span>
            </span>
            <Switch
              id="set-allow-triple"
              checked={st.allowTriple !== false}
              disabled={!isHost}
              onCheckedChange={(c) => emitSettings({ allowTriple: c })}
            />
          </label>
          <label className="setting-row setting-row-sub" htmlFor="set-allow-quad">
            <span className="setting-label">
              <Icon name="bomb" /> <span>{t(lang, 'set.allowQuad')}</span>
            </span>
            <Switch
              id="set-allow-quad"
              checked={st.allowQuad !== false}
              disabled={!isHost}
              onCheckedChange={(c) => emitSettings({ allowQuad: c })}
            />
          </label>
          <label className="setting-row setting-row-sub" htmlFor="set-allow-straight">
            <span className="setting-label">
              <Icon name="target" /> <span>{t(lang, 'set.allowStraight')}</span>
            </span>
            <Switch
              id="set-allow-straight"
              checked={st.allowStraight !== false}
              disabled={!isHost}
              onCheckedChange={(c) => emitSettings({ allowStraight: c })}
            />
          </label>

          {isHost && s?.phase === 'lobby' && (
            <>
              <p className="settings-group-label">
                <Icon name="shield" /> <span>{t(lang, 'host.title')}</span>
              </p>
              {s.players.filter((p) => !p.isYou).length === 0 ? (
                <div className="setting-row is-disabled">
                  <span className="setting-label">{t(lang, 'host.empty')}</span>
                </div>
              ) : (
                s.players.map((p, i) =>
                  p.isYou ? null : (
                    <div className="setting-row" key={i}>
                      <span className="setting-label">
                        <Icon name={p.isBot ? 'bot' : 'user'} />{' '}
                        <span>{displayName(p.name, lang)}</span>
                      </span>
                      <button
                        type="button"
                        className="btn-destructive kick-btn"
                        onClick={() => socket.emit('kick', { name: p.name })}
                      >
                        <Icon name="user-x" /> <span>{t(lang, 'host.kick')}</span>
                      </button>
                    </div>
                  ),
                )
              )}
            </>
          )}

          <p className="settings-group-label">
            <Icon name="user" /> <span>{t(lang, 'set.personal')}</span>
          </p>
          <div className="setting-row">
            <span className="setting-label">
              <Icon name="languages" /> <span>{t(lang, 'set.lang')}</span>
            </span>
            <div className="seg" id="lang-seg" role="group" aria-label="Language">
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
          </div>
          <div className="setting-row">
            <span className="setting-label">
              <Icon name="palette" /> <span>{t(lang, 'set.color')}</span>
            </span>
            <ColorPicker
              value={color}
              onChange={onColorInput}
              onCommit={onColorCommit}
              swatches={AVATAR_COLORS}
            />
          </div>
          <p className="settings-sub-label">
            <Icon name="bell" /> <span>{t(lang, 'set.notif')}</span>
          </p>
          <label className="setting-row setting-row-sub" htmlFor="set-notif-sound">
            <span className="setting-label">
              <Icon name="volume-2" /> <span>{t(lang, 'set.notifSound')}</span>
            </span>
            <Switch
              id="set-notif-sound"
              checked={notifSound}
              onCheckedChange={(c) => {
                setNotifSound(c);
                setNotifSoundS(c);
                if (c) {
                  primeAudio();
                  beep();
                }
              }}
            />
          </label>
          <label className="setting-row setting-row-sub" htmlFor="set-notif-vibrate">
            <span className="setting-label">
              <Icon name="vibrate" /> <span>{t(lang, 'set.notifVibrate')}</span>
            </span>
            <Switch
              id="set-notif-vibrate"
              checked={notifVibrate}
              onCheckedChange={(c) => {
                setNotifVibrate(c);
                setNotifVibrateS(c);
                if (c) navigator.vibrate?.(120);
              }}
            />
          </label>
          {pushSupported() && (
            <>
              <label className="setting-row setting-row-sub" htmlFor="set-notif-push">
                <span className="setting-label">
                  <Icon name="bell" /> <span>{t(lang, 'set.notifPush')}</span>
                </span>
                <Switch
                  id="set-notif-push"
                  checked={push === 'on'}
                  disabled={push === 'denied'}
                  onCheckedChange={togglePush}
                />
              </label>
              {push === 'denied' && (
                <div className="setting-row setting-row-sub">
                  <span className="setting-sub">{t(lang, 'set.notifPushDenied')}</span>
                </div>
              )}
            </>
          )}
          <p className="settings-sub-label">
            <Icon name="volume-2" /> <span>{t(lang, 'set.sfx')}</span>
          </p>
          <label className="setting-row setting-row-sub" htmlFor="set-sfx-play">
            <span className="setting-label">
              <Icon name="play" /> <span>{t(lang, 'set.sfxPlay')}</span>
            </span>
            <Switch
              id="set-sfx-play"
              checked={sfxState.play}
              onCheckedChange={(c) => toggleSfx('play', 'play', c)}
            />
          </label>
          <label className="setting-row setting-row-sub" htmlFor="set-sfx-bomb">
            <span className="setting-label">
              <Icon name="bomb" /> <span>{t(lang, 'set.sfxBomb')}</span>
            </span>
            <Switch
              id="set-sfx-bomb"
              checked={sfxState.bomb}
              onCheckedChange={(c) => toggleSfx('bomb', 'bomb', c)}
            />
          </label>
          <label className="setting-row setting-row-sub" htmlFor="set-sfx-win">
            <span className="setting-label">
              <Icon name="trophy" /> <span>{t(lang, 'set.sfxWin')}</span>
            </span>
            <Switch
              id="set-sfx-win"
              checked={sfxState.win}
              onCheckedChange={(c) => toggleSfx('win', 'win', c)}
            />
          </label>
          <div className="setting-row is-disabled">
            <span className="setting-label">
              <Icon name="message-circle" /> <span>{t(lang, 'set.chat')}</span>
            </span>
            <span className="setting-soon">{t(lang, 'set.soon')}</span>
          </div>
        </DialogBody>
        <DialogFooter>
          <button
            id="logout-btn"
            className="btn-destructive settings-logout"
            type="button"
            onClick={onLeave}
          >
            <Icon name="door-open" /> <span>{t(lang, 'set.logout')}</span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
