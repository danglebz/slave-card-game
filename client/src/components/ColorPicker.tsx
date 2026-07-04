// ColorPicker.tsx — pick a player color (react-colorful + preset swatches)
// fully controlled, doesn't touch the DOM itself → no clashes with React/Radix Dialog like the old Coloris
import { useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { useStore } from '@/store';
import { t } from '@/lib/i18n';

interface ColorPickerProps {
  /** current color (#rrggbb) */
  value: string;
  /** live change while dragging/typing */
  onChange: (color: string) => void;
  /** commit (when closing the popover / picking a swatch) — sent to the server */
  onCommit: (color: string) => void;
  /** preset colors */
  swatches: string[];
}

export function ColorPicker({ value, onChange, onCommit, swatches }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const lang = useStore((s) => s.lang);
  const ref = useRef<HTMLDivElement>(null);

  // close on outside click / Esc, then commit the current color
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
        // prevent closing the whole Dialog
        e.stopPropagation();
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
        title={t(lang, 'color.custom', { hex: value.toUpperCase() })}
        aria-label={t(lang, 'color.customAria', { hex: value.toUpperCase() })}
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
