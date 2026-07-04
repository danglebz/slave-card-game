// switch.tsx — shadcn-style toggle
// note: the existing CSS (.switch) relies on input[type=checkbox]:checked + appearance:none
// to keep the design pixel-exact without touching style.css we render a native checkbox using the existing .switch class
// (Radix Switch uses data-state, which would force rewriting the CSS — avoided to stay pixel-faithful)
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
