// Seat.test.tsx — PlayerChip: ชื่อ/จำนวนไพ่/สถานะ (ตา, หมดมือ, ออฟไลน์, หัวห้อง)
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PlayerChip } from '@/components/game/Seat';
import { useStore } from '@/store';
import { player, roomState } from './fixtures';

beforeEach(() => useStore.getState().setLang('en'));

const chip = (c: HTMLElement) => c.querySelector('.player-chip')!;

describe('PlayerChip', () => {
  it('แสดงชื่อ + (You) + จำนวนไพ่ของผู้เล่นตัวเอง', () => {
    const { container, getByText } = render(
      <PlayerChip p={player({ name: 'You', isYou: true, cardCount: 13 })} s={roomState()} />,
    );
    expect(getByText('13 cards')).toBeInTheDocument();
    expect(chip(container)).toHaveClass('you');
    expect(chip(container).textContent).toContain('You');
    expect(chip(container).textContent).toContain('(You)');
  });

  it('ใส่ class .turn เฉพาะตอนถึงตา + เฟส playing', () => {
    const { container } = render(
      <PlayerChip p={player({ isTurn: true })} s={roomState({ phase: 'playing' })} />,
    );
    expect(chip(container)).toHaveClass('turn');
  });

  it('ไม่ใส่ .turn ถ้ายังอยู่เฟส lobby แม้ isTurn', () => {
    const { container } = render(
      <PlayerChip p={player({ isTurn: true })} s={roomState({ phase: 'lobby' })} />,
    );
    expect(chip(container)).not.toHaveClass('turn');
  });

  it('คนหมดมือ → แสดง Finished + class finished', () => {
    const { container, getByText } = render(
      <PlayerChip p={player({ finished: true })} s={roomState()} />,
    );
    expect(getByText('Finished')).toBeInTheDocument();
    expect(chip(container)).toHaveClass('finished');
  });

  it('คนหลุดการเชื่อมต่อ → class offline', () => {
    const { container } = render(<PlayerChip p={player({ connected: false })} s={roomState()} />);
    expect(chip(container)).toHaveClass('offline');
  });
});
