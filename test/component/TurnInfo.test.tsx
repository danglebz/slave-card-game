// TurnInfo.test.tsx — turn message (your turn / waiting for others) + card exchange phase
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { TurnInfo } from '@/components/game/TurnInfo';
import { useStore } from '@/store';
import { roomState } from './fixtures';

beforeEach(() => useStore.getState().setLang('en'));

describe('TurnInfo', () => {
  it('ถึงตาคุณ → "Your turn!" + class your-turn', () => {
    const { container } = render(
      <TurnInfo s={roomState({ phase: 'playing', turn: 0, youIndex: 0 })} />,
    );
    const el = container.querySelector('#turn-info')!;
    expect(el.textContent).toContain('Your turn!');
    expect(el).toHaveClass('your-turn');
  });

  it('ตาคนอื่น → แสดงชื่อคนนั้น + ไม่มี class your-turn', () => {
    const { container } = render(
      <TurnInfo s={roomState({ phase: 'playing', turn: 1, youIndex: 0, turnName: 'Bot 1' })} />,
    );
    const el = container.querySelector('#turn-info')!;
    expect(el.textContent).toContain('Bot 1');
    expect(el).not.toHaveClass('your-turn');
  });

  it('เฟสแลกไพ่ (winner ยังไม่เลือก) → ขอให้เลือกไพ่ + your-turn', () => {
    const { container } = render(
      <TurnInfo
        s={roomState({
          phase: 'exchange',
          exchange: {
            role: 'winner',
            myCount: 2,
            toName: 'Bot 1',
            myDone: false,
            fromName: null,
            gaveCount: 0,
            waitingNames: [],
          },
        })}
      />,
    );
    expect(container.querySelector('#turn-info')).toHaveClass('your-turn');
  });
});
