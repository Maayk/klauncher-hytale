import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { CurseForgeMod, InstalledMod, ModsTab, ModStatus } from '@/shared/types/mods';
import { IPC_CHANNELS } from '@/shared/constants/channels';

interface ModsStore {
  availableMods: CurseForgeMod[];
  installedMods: InstalledMod[];
  selectedTab: ModsTab;
  searchQuery: string;
  status: ModStatus;
  error: string | null;

  // Granular loading states
  installingIds: number[];
  togglingIds: string[];
  deletingIds: string[];

  setAvailableMods: (mods: CurseForgeMod[]) => void;
  setInstalledMods: (mods: InstalledMod[]) => void;
  setSelectedTab: (tab: ModsTab) => void;
  setSearchQuery: (query: string) => void;
  setStatus: (status: ModStatus) => void;
  setError: (error: string | null) => void;

  addInstalledMod: (mod: InstalledMod) => void;
  removeInstalledMod: (fileName: string) => void;
  toggleMod: (fileName: string) => void;

  searchMods: (query: string) => Promise<void>;
  fetchInstalledMods: () => Promise<void>;
  installMod: (mod: CurseForgeMod) => Promise<void>;
  toggleModState: (fileName: string) => Promise<void>;
  deleteMod: (fileName: string) => Promise<void>;

  reset: () => void;
}

const initialState = {
  availableMods: [],
  installedMods: [],
  selectedTab: 'available' as ModsTab,
  searchQuery: '',
  status: 'idle' as ModStatus,
  error: null as string | null,
  installingIds: [] as number[],
  togglingIds: [] as string[],
  deletingIds: [] as string[],
};

export const useModsStore = create<ModsStore>()(
  subscribeWithSelector(
    immer((set, get) => ({
      ...initialState,

      setAvailableMods: (mods) => set((state) => { state.availableMods = mods; }),

      setInstalledMods: (mods) => set((state) => { state.installedMods = mods; }),

      setSelectedTab: (tab) => set((state) => { state.selectedTab = tab; }),

      setSearchQuery: (query) => set((state) => { state.searchQuery = query; }),

      setStatus: (status) => set((state) => { state.status = status; }),

      setError: (error) => set((state) => { state.error = error; }),

      addInstalledMod: (mod) => set((state) => { state.installedMods.push(mod); }),

      removeInstalledMod: (fileName) => set((state) => {
        state.installedMods = state.installedMods.filter(m => m.fileName !== fileName);
      }),

      toggleMod: (fileName) => set((state) => {
        const mod = state.installedMods.find(m => m.fileName === fileName);
        if (mod) {
          mod.enabled = !mod.enabled;
        }
      }),

      searchMods: async (query) => {
        const { setStatus, setError, setAvailableMods, setSearchQuery } = get();
        setSearchQuery(query);
        setStatus('loading');
        setError(null);

        try {
          const result = await window.electronAPI?.invoke(IPC_CHANNELS.MODS.SEARCH, query) as any;
          if (result.success) {
            setAvailableMods(result.data);
            setStatus('success');
          } else {
            setError(result.error || 'Erro ao buscar mods');
            setStatus('error');
          }
        } catch (_error) {
          setError('Erro ao conectar com o serviço de mods');
          setStatus('error');
        }
      },

      fetchInstalledMods: async () => {
        const { setStatus, setError, setInstalledMods } = get();
        // Only set loading if we don't have mods yet to avoid flicker
        if (get().installedMods.length === 0) setStatus('loading');
        setError(null);

        try {
          const result = await window.electronAPI?.invoke('mods:list-installed') as any;
          if (result.success) {
            setInstalledMods(result.data);
            setStatus('success');
          } else {
            setError(result.error || 'Erro ao buscar mods instalados');
            setStatus('error');
          }
        } catch (_error) {
          setError('Erro ao conectar com o serviço de mods');
          setStatus('error');
        }
      },

      installMod: async (mod) => {
        const { setError, fetchInstalledMods } = get();
        console.log('[ModsStore] Requesting install for:', mod);
        set((state) => { state.installingIds.push(mod.id); });
        setError(null);

        try {
          console.log('[ModsStore] Invoking IPC...');
          const result = await window.electronAPI?.invoke(IPC_CHANNELS.MODS.INSTALL, mod) as any;
          console.log('[ModsStore] IPC Result:', result);
          if (result.success) {
            await fetchInstalledMods();
          } else {
            setError(result.error || 'Erro ao instalar mod');
          }
        } catch (_error) {
          setError('Erro ao conectar com o serviço de mods');
        } finally {
          set((state) => {
            state.installingIds = state.installingIds.filter(id => id !== mod.id);
          });
        }
      },

      toggleModState: async (fileName) => {
        const { setError, fetchInstalledMods } = get();
        set((state) => { state.togglingIds.push(fileName); });
        setError(null);

        try {
          const result = await window.electronAPI?.invoke('mods:toggle', fileName) as any;
          if (result.success) {
            await fetchInstalledMods();
          } else {
            setError(result.error || 'Erro ao alternar mod');
          }
        } catch (_error) {
          setError('Erro ao conectar com o serviço de mods');
        } finally {
          set((state) => {
            state.togglingIds = state.togglingIds.filter(id => id !== fileName);
          });
        }
      },

      deleteMod: async (fileName) => {
        const { setError, fetchInstalledMods } = get();
        set((state) => { state.deletingIds.push(fileName); });
        setError(null);

        try {
          const result = await window.electronAPI?.invoke(IPC_CHANNELS.MODS.DELETE, fileName) as any;
          if (result.success) {
            await fetchInstalledMods();
          } else {
            setError(result.error || 'Erro ao deletar mod');
          }
        } catch (_error) {
          setError('Erro ao conectar com o serviço de mods');
        } finally {
          set((state) => {
            state.deletingIds = state.deletingIds.filter(id => id !== fileName);
          });
        }
      },

      reset: () => set(() => ({ ...initialState })),
    }))
  )
);
