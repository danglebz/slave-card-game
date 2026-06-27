// ShareModal.tsx — แชร์ห้อง (QR + คัดลอกลิงก์) (port share-modal)
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Icon } from '@/lib/icons';
import { copyText } from '@/lib/clipboard';
import { useStore } from '@/store';

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
  const [qr, setQr] = useState<string | null>(null);

  const url = `${location.origin}/?room=${encodeURIComponent(code)}`;
  const shortUrl = url.replace(/^https?:\/\//, ''); // ตัด scheme ให้อ่านสั้น

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
    showToast(ok ? 'คัดลอกลิงก์แล้ว' : 'คัดลอกไม่สำเร็จ', ok ? 'success' : 'error');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent open={open} id="share-modal" className="share-box" ariaLabelledby="share-title">
        <h2 id="share-title">
          <Icon name="qr-code" /> ชวนเพื่อนเข้าห้อง
        </h2>
        <p className="share-sub">
          ให้เพื่อนใน Wi-Fi เดียวกัน <b>สแกน QR</b> หรือเปิดลิงก์ด้านล่าง
        </p>
        <div className="share-code">
          รหัสห้อง <strong id="share-code">{code}</strong>
        </div>
        <div id="share-qr" className="share-qr">
          <img id="share-qr-img" alt="QR เข้าห้อง" width={220} height={220} src={qr ?? undefined} />
        </div>
        <button id="share-link" className="share-link" type="button" title="คัดลอกลิงก์" onClick={onCopy}>
          <span id="share-url" className="share-url">
            {shortUrl}
          </span>
          <Icon name="copy" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
