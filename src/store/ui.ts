import { create } from 'zustand';

export type MainTab = 'single' | 'batch' | 'generate';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'error';
}

interface UiState {
  activeTab: MainTab;
  assistantOpen: boolean;
  settingsOpen: boolean;
  toasts: Toast[];
  setActiveTab: (tab: MainTab) => void;
  setAssistantOpen: (open: boolean) => void;
  toggleAssistant: () => void;
  setSettingsOpen: (open: boolean) => void;
  pushToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

export const useUi = create<UiState>((set) => ({
  activeTab: 'single',
  assistantOpen: false,
  settingsOpen: false,
  toasts: [],
  setActiveTab: (activeTab) => set({ activeTab }),
  setAssistantOpen: (assistantOpen) => set({ assistantOpen }),
  toggleAssistant: () => set((state) => ({ assistantOpen: !state.assistantOpen })),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  pushToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }],
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
