import { create } from 'zustand';
import type { RoomState } from '@shared/types';
import { initialLang, type Lang } from './lib/i18n';

export interface ToastMsg {
  id: number;
  msg: string;
  variant?: 'error' | 'success';
}

interface GameStore {
  // ----- game -----
  /** single state blob from the server (event 'state') — single source of truth */
  state: RoomState | null;
  screen: 'lobby' | 'game';
  roomCode: string;
  /** cards currently selected in hand (cardId) */
  selected: Set<string>;

  // ----- connection -----
  connDown: boolean;

  // ----- UI -----
  lang: Lang;
  toast: ToastMsg | null;

  // ----- actions -----
  setRoomState: (s: RoomState) => void;
  goLobby: () => void;
  goGame: (code: string) => void;
  setConn: (down: boolean) => void;
  setLang: (lang: Lang) => void;
  toggleCard: (id: string) => void;
  setSelected: (ids: string[]) => void;
  clearSelected: () => void;
  showToast: (msg: string, variant?: 'error' | 'success') => void;
  hideToast: () => void;
}

let toastSeq = 0;

export const useStore = create<GameStore>((set) => ({
  state: null,
  screen: 'lobby',
  roomCode: '',
  selected: new Set<string>(),
  connDown: false,
  lang: initialLang(),
  toast: null,

  setRoomState: (s) => set({ state: s }),
  goLobby: () => set({ screen: 'lobby', state: null, selected: new Set() }),
  goGame: (code) => set({ screen: 'game', roomCode: code }),
  setConn: (down) => set({ connDown: down }),
  setLang: (lang) => {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    set({ lang });
  },
  toggleCard: (id) =>
    set((st) => {
      const next = new Set(st.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selected: next };
    }),
  setSelected: (ids) => set({ selected: new Set(ids) }),
  clearSelected: () => set({ selected: new Set() }),
  showToast: (msg, variant) => set({ toast: { id: ++toastSeq, msg, variant } }),
  hideToast: () => set({ toast: null }),
}));
