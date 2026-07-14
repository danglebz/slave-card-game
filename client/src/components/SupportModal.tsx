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

/**
 * Card donations for people who have no Thai banking app. Empty = the row is hidden, so a missing
 * page can never ship as a dead link.
 *
 * Deliberately the *secondary* channel: cards cost ~3.65% + THB 10 per donation, PromptPay costs
 * nothing, so anyone who can scan the QR is told to scan the QR.
 */
const CARD_DONATE_URL: string = 'https://ko-fi.com/danglebz';

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
          <p className="support-sub">
            {t(lang, 'support.lead1')}
            <br />
            {t(lang, 'support.lead2')}
          </p>

          {/* the plate a Thai merchant QR actually looks like — and the number rides on it, so a
              screenshotted or saved code still says who it pays. Tap the number to copy it. */}
          <div className="thaiqr">
            <div className="thaiqr-head">
              <Icon name="qr-code" />
              <span>
                THAI QR
                <br />
                PAYMENT
              </span>
            </div>
            <div className="thaiqr-body">
              <span className="promptpay-mark">
                <span className="pp-th">พร้อมเพย์</span>
                <span className="pp-en">
                  <b>Prompt</b>
                  <i>Pay</i>
                </span>
              </span>
              <img width={172} height={172} alt={t(lang, 'support.qrAlt')} src={qr ?? undefined} />
            </div>
            <button
              type="button"
              className="thaiqr-id"
              title={t(lang, 'support.copyId')}
              onClick={onCopyId}
            >
              <Icon name="copy" />
              <span>{formatPromptPayId(PROMPTPAY_ID)}</span>
            </button>
          </div>

          <p className="support-hint">{t(lang, 'support.hint')}</p>

          {/* no Thai banking app → cards. Hidden until CARD_DONATE_URL is set, so no dead link ships. */}
          {CARD_DONATE_URL && (
            <a
              className="support-row support-card-pay"
              href={CARD_DONATE_URL}
              target="_blank"
              rel="noopener"
            >
              <Icon name="credit-card" />
              <span>{t(lang, 'support.card')}</span>
              <Icon name="link" />
            </a>
          )}

          <div className="support-split">
            <span>{t(lang, 'support.freeTitle')}</span>
          </div>

          <ul className="support-ways">
            <li>
              <a className="support-row" href={REPO} target="_blank" rel="noopener">
                <GithubMark />
                <span>{t(lang, 'support.waysStar')}</span>
                <Icon name="star" />
              </a>
            </li>
            <li>
              <button type="button" className="support-row" onClick={onShare}>
                <Icon name="share-2" />
                <span>{t(lang, 'support.waysShare')}</span>
                <Icon name="copy" />
              </button>
            </li>
            <li>
              <a className="support-row" href={`${REPO}/issues`} target="_blank" rel="noopener">
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
