// promptpay.ts — build the payload string behind a PromptPay QR (EMVCo merchant-presented mode, BOT spec)
// Pure, so the amount presets are unit-testable; the QR image itself is rendered with `qrcode` (same lib as ShareModal).
//
// The payload is a chain of TLV fields — id(2) + length(2, zero-padded) + value:
//   00  payload format         "01"
//   01  point of initiation    "11" static (scanner types the amount) / "12" dynamic (amount baked in)
//   29  merchant account info  00: PromptPay AID · 01: mobile / 02: national ID / 03: e-wallet
//   58  country                "TH"
//   53  currency               "764" (THB)
//   54  amount                 e.g. "100.00" — present only when an amount is set
//   63  CRC                    CRC-16/CCITT-FALSE over everything above, including the trailing "6304"

const AID_PROMPTPAY = 'A000000677010111';

/**
 * Who every donation QR in this app pays. Lives here (not in the component) so it has exactly one
 * home and a unit test can pin it — a wrong digit silently sends people's money to a stranger.
 */
export const PROMPTPAY_ID = '085-796-8525';

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value;
}

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection) — the checksum PromptPay QRs carry in field 63
export function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// e-wallet (15 digits) · national/tax ID (13 digits) · otherwise a mobile number
function subFieldId(digits: string): '01' | '02' | '03' {
  if (digits.length >= 15) return '03';
  if (digits.length >= 13) return '02';
  return '01';
}

// mobile: drop the leading 0, prefix the country code, left-pad to 13 → 0857968525 becomes 0066857968525
// IDs of 13+ digits are already in their final form
function formatTarget(digits: string): string {
  if (digits.length >= 13) return digits;
  return `0000000000000${digits.replace(/^0/, '66')}`.slice(-13);
}

/**
 * PromptPay QR payload.
 * @param id receiver — mobile number, national ID or e-wallet id (any punctuation is ignored)
 * @param amount THB to bake into the QR; omit (or 0) for a QR where the payer types the amount
 */
export function promptPayPayload(id: string, amount?: number | null): string {
  const digits = id.replace(/\D/g, '');
  if (!digits) throw new Error('promptpay: empty id');
  const merchant = tlv('00', AID_PROMPTPAY) + tlv(subFieldId(digits), formatTarget(digits));
  const withAmount = typeof amount === 'number' && amount > 0;
  const body =
    tlv('00', '01') +
    tlv('01', withAmount ? '12' : '11') +
    tlv('29', merchant) +
    tlv('58', 'TH') +
    tlv('53', '764') +
    (withAmount ? tlv('54', amount.toFixed(2)) : '');
  // the CRC is computed over the payload *plus* its own "63" + "04" header
  return `${body}6304${crc16(`${body}6304`)}`;
}

// 0857968525 → 085-796-8525 (display only; other id types are shown as-is)
export function formatPromptPayId(id: string): string {
  const d = id.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : id;
}
