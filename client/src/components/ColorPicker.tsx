// ColorPicker.tsx — เลือกสีประจำตัว (react-colorful + swatch พรีเซ็ต)
// controlled ล้วน ไม่แตะ DOM เอง → ไม่ตีกับ React/Radix Dialog เหมือน Coloris เดิม
import { useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';

interface ColorPickerProps {
  /** สีปัจจุบัน (#rrggbb) */
  value: string;
  /** เปลี่ยนสด ๆ ระหว่างลาก/พิมพ์ */
  onChange: (color: string) => void;
  /** ยืนยัน (ตอนปิด popover / เลือก swatch) — ใช้ส่งไป server */
  onCommit: (color: string) => void;
  /** สีพรีเซ็ต */
  swatches: string[];
}

export function ColorPicker({ value, onChange, onCommit, swatches }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ปิดเมื่อคลิกนอก/กด Esc แล้ว commit สีปัจจุบัน
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      onCommit(value);
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // กันไปปิด Dialog ทั้งอัน
        close();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, value, onCommit]);

  return (
    <div className="color-picker" ref={ref}>
      <button
        type="button"
        id="color-custom"
        className="color-swatch-btn"
        style={{ background: value }}
        title={'เลือกสีเอง (' + value.toUpperCase() + ')'}
        aria-label={'เลือกสีประจำตัว (' + value.toUpperCase() + ')'}
        onClick={() => setOpen((o) => !o)}
      />

      {open && (
        <div className="color-pop" role="dialog">
          <HexColorPicker color={value} onChange={onChange} />
          <div className="color-swatches">
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                className={
                  'color-swatch' + (c.toLowerCase() === value.toLowerCase() ? ' active' : '')
                }
                style={{ background: c }}
                aria-label={c}
                onClick={() => {
                  onChange(c);
                  onCommit(c);
                }}
              />
            ))}
          </div>
          <div className="color-hex-row">
            <span>#</span>
            <HexColorInput color={value} onChange={onChange} />
          </div>
        </div>
      )}
    </div>
  );
}
