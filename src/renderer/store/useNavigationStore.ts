import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

type PageType = 'home' | 'mods' | 'settings';

interface NavigationStore {
  currentPage: PageType;
  modsPageKey: number;
  navigateTo: (page: PageType) => void;
  goBack: () => void;
  incrementModsPageKey: () => void;
}

export const useNavigationStore = create<NavigationStore>()(
  subscribeWithSelector(
    immer((set) => ({
      currentPage: 'home',
      modsPageKey: 0,
      navigateTo: (page) => set((state) => { 
        state.currentPage = page; 
        if (page === 'mods') {
          state.modsPageKey += 1;
        }
      }),
      goBack: () => set((state) => { state.currentPage = 'home'; }),
      incrementModsPageKey: () => set((state) => { state.modsPageKey += 1; }),
    }))
  )
);
