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

// the code is encoded at this size, then displayed smaller — a phone camera reads the downscaled one fine
const QR_PX = 440;

/**
 * Bake the Thai QR mark into the middle of the code, the way a real merchant QR carries one.
 * The mark only — the "THAI QR PAYMENT" wordmark is stripped out, because the full logo is 3.3:1
 * and as a centre stamp it would cover a wide band of modules for text too small to read anyway.
 * Original colours, not the knockout in the header: the code's background is white.
 *
 * Baked on the canvas rather than laid over the image with CSS, so it survives a save-image as well
 * as a screenshot. Safe because the code is generated at error-correction level H (30% recoverable)
 * and the mark covers only the centre — never a finder or timing pattern. e2e decodes the stamped
 * PNG to prove it still scans; if you enlarge the mark, that test is what tells you you went too far.
 */
async function stampThaiQrMark(qrUrl: string): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = QR_PX;
  canvas.height = QR_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return qrUrl;

  const qr = new Image();
  qr.src = qrUrl;
  await qr.decode();
  ctx.drawImage(qr, 0, 0, QR_PX, QR_PX);

  const mark = new Image();
  mark.src = '/thai-qr-mark.svg';
  await mark.decode();
  const w = QR_PX * 0.22;
  const h = (w / mark.naturalWidth) * mark.naturalHeight;
  const pad = QR_PX * 0.018;
  // white bed under the mark → the modules it covers read as "quiet", not as noise
  ctx.fillStyle = '#fff';
  ctx.fillRect((QR_PX - w) / 2 - pad, (QR_PX - h) / 2 - pad, w + pad * 2, h + pad * 2);
  ctx.drawImage(mark, (QR_PX - w) / 2, (QR_PX - h) / 2, w, h);

  return canvas.toDataURL('image/png');
}

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
      width: QR_PX,
      margin: 1,
      // H = 30% of the code is recoverable → the PromptPay mark can sit on top of the middle
      // without breaking the scan. Do NOT drop this to M while a logo is stamped on it.
      errorCorrectionLevel: 'H',
      color: { dark: '#18181b', light: '#ffffff' },
    })
      .then(stampThaiQrMark)
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
              screenshotted or saved code still says who it pays. Tap the number to copy it.
              Both marks are the official ones (Wikimedia Commons: Thai QR is CC0, PromptPay is
              public domain) — the Thai QR one is recoloured to its knockout form for the navy bar. */}
          <div className="thaiqr">
            <div className="thaiqr-head">
              <img src="/thai-qr-payment.svg" alt="Thai QR Payment" width={132} height={40} />
            </div>
            <div className="thaiqr-body">
              <img className="promptpay-mark" src="/promptpay.png" alt="PromptPay" />
              <img
                className="thaiqr-qr"
                width={172}
                height={172}
                alt={t(lang, 'support.qrAlt')}
                src={qr ?? undefined}
              />
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
