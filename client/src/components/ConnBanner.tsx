// ConnBanner.tsx — connection status banner (appears when the network drops) — reads connDown from store
import { useStore } from '@/store';
import { Icon } from '@/lib/icons';
import { t } from '@/lib/i18n';

export function ConnBanner() {
  const connDown = useStore((s) => s.connDown);
  const lang = useStore((s) => s.lang);
  return (
    <div id="conn-banner" className={`conn-banner${connDown ? '' : ' hidden'}`} role="status">
      <Icon name="wifi-off" />
      <span>{t(lang, 'banner.conn')}</span>
    </div>
  );
}
