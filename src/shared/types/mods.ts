export interface CurseForgeMod {
  id: number;
  name: string;
  summary: string;
  description: string | null;
  logo: {
    id: number;
    modId: number;
    title: string;
    thumbnailUrl: string;
    url: string;
  };
  author: string;
  downloads: number;
  lastUpdated: string;
  version: string;
}

export interface InstalledMod {
  id?: number;
  name: string;
  fileName: string;
  enabled: boolean;
  path: string;
  summary?: string;
  logo?: {
    thumbnailUrl: string;
  };
  author?: string;
  version?: string;
}

export type ModStatus = 'idle' | 'loading' | 'success' | 'error';

export type ModsTab = 'available' | 'installed';

export interface ModState {
  availableMods: CurseForgeMod[];
  installedMods: InstalledMod[];
  selectedTab: ModsTab;
  searchQuery: string;
  status: ModStatus;
  error: string | null;
}

export interface ModFilters {
  category?: string;
  sortField?: 'featured' | 'popular' | 'lastUpdated' | 'name';
  sortOrder?: 'asc' | 'desc';
}
