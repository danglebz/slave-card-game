// switch.tsx — toggle แบบ shadcn
// หมายเหตุ: CSS เดิม (.switch) อิง input[type=checkbox]:checked + appearance:none
// เพื่อคงดีไซน์เป๊ะแบบไม่แตะ style.css เราจึง render native checkbox ที่ใช้คลาส .switch เดิม
// (Radix Switch ใช้ data-state ซึ่งจะทำให้ต้องเขียน CSS ใหม่ — เลี่ยงเพื่อความ pixel-faithful)
import type { InputHTMLAttributes } from 'react';

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({ checked, onCheckedChange, className, ...rest }: SwitchProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      className={`switch${className ? ` ${className}` : ''}`}
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      {...rest}
    />
  );
}
