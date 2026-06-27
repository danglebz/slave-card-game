// ComboHints.test.tsx — แสดงบอมบ์ในมือ + คลิกชิปเพื่อเลือก/ยกเลิก (ผ่าน store.selected)
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComboHints } from '@/components/game/ComboHints';
import { useStore } from '@/store';
import { card, roomState, settings } from './fixtures';

beforeEach(() => {
  useStore.getState().setLang('en');
  useStore.getState().clearSelected();
});

// ตอง 5 (สามใบ) + ไพ่อื่นที่ไม่เป็นบอมบ์
const tripleHand = [card(5, 0), card(5, 1), card(5, 2), card(7, 0), card(9, 3)];

describe('ComboHints', () => {
  it('ไม่มีบอมบ์ในมือ → ซ่อน (class hidden, ไม่มีชิป)', () => {
    const { container } = render(
      <ComboHints s={roomState({ hand: [card(3, 0), card(7, 1), card(9, 2)] })} />,
    );
    expect(container.querySelector('#combo-hints')).toHaveClass('hidden');
    expect(container.querySelectorAll('.combo-chip')).toHaveLength(0);
  });

  it('มีตองในมือ → แสดงชิปบอมบ์', () => {
    const { container } = render(<ComboHints s={roomState({ hand: tripleHand })} />);
    const chips = container.querySelectorAll('.combo-chip');
    expect(chips.length).toBeGreaterThanOrEqual(1);
  });

  it('คลิกชิป → เลือกไพ่ในชุดนั้นเข้า store.selected; คลิกซ้ำ → ยกเลิก', async () => {
    const user = userEvent.setup();
    const { container } = render(<ComboHints s={roomState({ hand: tripleHand })} />);
    const chip = container.querySelector('.combo-chip') as HTMLButtonElement;

    await user.click(chip);
    expect([...useStore.getState().selected].sort()).toEqual(['5.0', '5.1', '5.2']);
    expect(chip).toHaveClass('active');

    await user.click(chip);
    expect(useStore.getState().selected.size).toBe(0);
  });

  it('หัวห้องปิดตอง (allowTriple=false) → ไม่ใบ้ตอง', () => {
    const { container } = render(
      <ComboHints
        s={roomState({ hand: tripleHand, settings: settings({ allowTriple: false }) })}
      />,
    );
    expect(container.querySelector('#combo-hints')).toHaveClass('hidden');
  });
});
