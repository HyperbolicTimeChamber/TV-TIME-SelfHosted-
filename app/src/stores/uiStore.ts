import { create } from "zustand";

interface UiState {
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isConnected: true,
  setConnected: (isConnected) => set({ isConnected }),
}));
