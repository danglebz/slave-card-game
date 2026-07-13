// SupportSection.tsx — the "it's free, buy me a coffee" section below the lobby form
// PromptPay only: the QR is built client-side (shared/lib promptpay) so an amount preset can be baked
// straight into it — no payment provider, no backend, nothing to leak.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Icon, GithubMark } from '@/lib/icons';
import { copyText } from '@/lib/clipboard';
import { promptPayPayload, formatPromptPayId } from '@/lib/promptpay';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

const REPO = 'https://github.com/Danglebz/slave-card-game';
// receiver for every donation QR on this page
const PROMPTPAY_ID = '086-327-3566';
// null = let the payer type the amount in their banking app
const AMOUNTS: (number | null)[] = [null, 20, 50, 100];

export function SupportSection() {
  const lang = useStore((s) => s.lang);
  const showToast = useStore((s) => s.showToast);
  const [amount, setAmount] = useState<number | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(promptPayPayload(PROMPTPAY_ID, amount), {
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
  }, [amount]);

  async function onCopyId() {
    const ok = await copyText(PROMPTPAY_ID);
    showToast(t(lang, ok ? 'support.copied' : 'toast.copyFailShort'), ok ? 'success' : 'error');
  }

  async function onShare() {
    const ok = await copyText(location.origin);
    showToast(t(lang, ok ? 'toast.linkCopied' : 'toast.copyFailShort'), ok ? 'success' : 'error');
  }

  return (
    <section id="support" className="support">
      <p className="support-eyebrow">{t(lang, 'support.eyebrow')}</p>
      <h2 className="support-title">{t(lang, 'support.title')}</h2>
      <p className="support-lead">{t(lang, 'support.lead')}</p>

      <div className="support-grid">
        <div className="support-card">
          <h3>
            <Icon name="qr-code" /> {t(lang, 'support.qrTitle')}
          </h3>
          <p className="support-card-sub">{t(lang, 'support.qrSub')}</p>

          <div className="support-qr">
            {/* keep the box reserved while the QR encodes → the section never jumps on amount change */}
            <img width={200} height={200} alt={t(lang, 'support.qrAlt')} src={qr ?? undefined} />
          </div>

          <div
            className="amount-chips"
            role="group"
            aria-label={t(lang, 'support.amountLabel')}
            data-testid="amount-chips"
          >
            {AMOUNTS.map((a) => (
              <button
                key={a ?? 'any'}
                type="button"
                className={`amount-chip${a === amount ? ' active' : ''}`}
                aria-pressed={a === amount}
                onClick={() => setAmount(a)}
              >
                {a === null ? t(lang, 'support.amountAny') : `฿${a}`}
              </button>
            ))}
          </div>
          <p className="support-hint">
            {amount === null
              ? t(lang, 'support.hintAny')
              : t(lang, 'support.hintFixed', { amount: String(amount) })}
          </p>

          <button
            type="button"
            className="support-id"
            title={t(lang, 'support.copyId')}
            onClick={onCopyId}
          >
            <span>{formatPromptPayId(PROMPTPAY_ID)}</span>
            <Icon name="copy" />
          </button>
        </div>

        <div className="support-card">
          <h3>
            <Icon name="coffee" /> {t(lang, 'support.freeTitle')}
          </h3>
          <p className="support-card-sub">{t(lang, 'support.freeSub')}</p>

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

          <p className="support-thanks">{t(lang, 'support.thanks')}</p>
        </div>
      </div>
    </section>
  );
}
