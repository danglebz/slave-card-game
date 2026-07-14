// SupportModal.tsx — "the game is free, a coffee keeps it going" (opened from the lobby)
// PromptPay only: the QR payload is built client-side (lib/promptpay) — no payment provider,
// no backend, nothing to leak. The QR carries no amount; the payer types one in their banking app.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon, GithubMark } from '@/lib/icons';
import { copyText } from '@/lib/clipboard';
import { promptPayPayload, formatPromptPayId, PROMPTPAY_ID } from '@/lib/promptpay';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

const REPO = 'https://github.com/Danglebz/slave-card-game';

export function SupportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const lang = useStore((s) => s.lang);
  const showToast = useStore((s) => s.showToast);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    QRCode.toDataURL(promptPayPayload(PROMPTPAY_ID), {
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
  }, [open]);

  async function onCopyId() {
    const ok = await copyText(PROMPTPAY_ID);
    showToast(t(lang, ok ? 'support.copied' : 'toast.copyFailShort'), ok ? 'success' : 'error');
  }

  async function onShare() {
    const ok = await copyText(location.origin);
    showToast(t(lang, ok ? 'toast.linkCopied' : 'toast.copyFailShort'), ok ? 'success' : 'error');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent id="support-modal" className="support-box" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            <Icon name="coffee" /> {t(lang, 'support.title')}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="support-sub">{t(lang, 'support.lead')}</p>

          {/* the label rides on the plate so a screenshotted QR still says who it pays */}
          <div className="support-qr">
            <span className="support-qr-brand">PromptPay · {formatPromptPayId(PROMPTPAY_ID)}</span>
            <img width={186} height={186} alt={t(lang, 'support.qrAlt')} src={qr ?? undefined} />
          </div>

          <p className="support-hint">{t(lang, 'support.hint')}</p>

          <button
            type="button"
            className="support-id"
            title={t(lang, 'support.copyId')}
            onClick={onCopyId}
          >
            <Icon name="copy" />
            <span>{formatPromptPayId(PROMPTPAY_ID)}</span>
          </button>

          <div className="support-split">
            <span>{t(lang, 'support.freeTitle')}</span>
          </div>

          <ul className="support-ways">
            <li>
              <a href={REPO} target="_blank" rel="noopener">
                <GithubMark />
                <span>{t(lang, 'support.waysStar')}</span>
                <Icon name="star" />
              </a>
            </li>
            <li>
              <button type="button" onClick={onShare}>
                <Icon name="share-2" />
                <span>{t(lang, 'support.waysShare')}</span>
                <Icon name="copy" />
              </button>
            </li>
            <li>
              <a href={`${REPO}/issues`} target="_blank" rel="noopener">
                <Icon name="bug" />
                <span>{t(lang, 'support.waysIssue')}</span>
                <Icon name="link" />
              </a>
            </li>
          </ul>

          <p className="support-fine">{t(lang, 'support.fine')}</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
