// ShareModal.tsx — share the room (QR + copy link) (port share-modal)
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/lib/icons';
import { copyText } from '@/lib/clipboard';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

export function ShareModal({
  open,
  code,
  onOpenChange,
}: {
  open: boolean;
  code: string;
  onOpenChange: (o: boolean) => void;
}) {
  const showToast = useStore((s) => s.showToast);
  const lang = useStore((s) => s.lang);
  const [qr, setQr] = useState<string | null>(null);

  const url = `${location.origin}/?room=${encodeURIComponent(code)}`;
  // strip the scheme for a shorter display
  const shortUrl = url.replace(/^https?:\/\//, '');

  useEffect(() => {
    if (!open) return;
    let alive = true;
    QRCode.toDataURL(url, {
      width: 440,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#18181b', light: '#ffffff' },
    })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [open, url]);

  async function onCopy() {
    const ok = await copyText(url);
    showToast(t(lang, ok ? 'toast.linkCopied' : 'toast.copyFailShort'), ok ? 'success' : 'error');
  }
  async function onCopyCode() {
    const ok = await copyText(code);
    showToast(
      ok ? t(lang, 'toast.codeCopied', { code }) : t(lang, 'toast.copyFailShort'),
      ok ? 'success' : 'error',
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="share-modal" className="share-box" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            <Icon name="qr-code" /> {t(lang, 'share.title')}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="share-sub">
            {t(lang, 'share.sub1')}
            <b>{t(lang, 'share.subScan')}</b>
            {t(lang, 'share.sub2')}
          </p>
          <button
            type="button"
            className="share-code"
            title={t(lang, 'topbar.copyCode')}
            onClick={onCopyCode}
          >
            {t(lang, 'share.code')} <strong id="share-code">{code}</strong>
            <Icon name="copy" />
          </button>
          <div id="share-qr" className="share-qr">
            <img
              id="share-qr-img"
              alt={t(lang, 'share.qrAlt')}
              width={220}
              height={220}
              src={qr ?? undefined}
            />
          </div>
          <button
            id="share-link"
            className="share-link"
            type="button"
            title={t(lang, 'share.copyLink')}
            onClick={onCopy}
          >
            <span id="share-url" className="share-url">
              {shortUrl}
            </span>
            <Icon name="copy" />
          </button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
