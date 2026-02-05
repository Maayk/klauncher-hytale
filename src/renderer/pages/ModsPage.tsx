import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useModsStore } from '@/renderer/store/useModsStore';
import { useNavigationStore } from '@/renderer/store/useNavigationStore';
import { ModCard } from '@/renderer/components/Mods/ModCard';
import { SearchBar } from '@/renderer/components/Mods/SearchBar';
import { TabSelector } from '@/renderer/components/Mods/TabSelector';
import { EmptyState } from '@/renderer/components/Mods/EmptyState';
import { ConfirmationDialog } from '@/renderer/components/ui/ConfirmationDialog';
import type { CurseForgeMod, InstalledMod } from '@/shared/types/mods';
import { ArrowLeft, RefreshCw, Filter, ChevronDown } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { InstalledModRow } from '@/renderer/components/Mods/InstalledModRow';
import { cn } from '@/shared/utils/cn';

export function ModsPage({ onBack }: { onBack: () => void }) {
  const modsPageKey = useNavigationStore((state) => state.modsPageKey);
  const [isLoading, setIsLoading] = useState(true);
  const [modToDelete, setModToDelete] = useState<string | null>(null);

  const {
    availableMods,
    installedMods,
    selectedTab,
    searchQuery,
    error,
    installingIds,
    togglingIds,
    deletingIds,
    setSelectedTab,
    setSearchQuery,
    searchMods,
    fetchInstalledMods,
    installMod,
    toggleModState,
    deleteMod,
  } = useModsStore();

  useEffect(() => {
    const loadMods = async () => {
      setIsLoading(true);
      try {
        // Fetch both available and installed mods to ensure "Installed" status works correctly
        await Promise.all([
          searchMods(''),
          fetchInstalledMods()
        ]);
      } finally {
        setIsLoading(false);
      }
    };
    loadMods();
  }, [modsPageKey]);

  // Refetch when tab changes to installed just to be sure, but the main fetch is above
  useEffect(() => {
    if (selectedTab === 'installed' && !isLoading) {
      fetchInstalledMods();
    }
  }, [selectedTab]);

  const filteredAvailableMods = useMemo(() => {
    if (!searchQuery) return availableMods;
    const query = searchQuery.toLowerCase();
    return availableMods.filter(
      (mod) =>
        mod.name.toLowerCase().includes(query) ||
        mod.summary.toLowerCase().includes(query) ||
        mod.author.toLowerCase().includes(query)
    );
  }, [availableMods, searchQuery]);

  const filteredInstalledMods = useMemo(() => {
    if (!searchQuery) return installedMods;
    const query = searchQuery.toLowerCase();
    return installedMods.filter((mod) =>
      mod.name.toLowerCase().includes(query)
    );
  }, [installedMods, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleDebouncedSearch = (query: string) => {
    if (selectedTab === 'available') {
      searchMods(query);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      if (selectedTab === 'available') {
        await searchMods(searchQuery);
      } else {
        await fetchInstalledMods();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInstall = async (mod: CurseForgeMod) => {
    await installMod(mod);
  };

  const handleToggle = async (fileName: string) => {
    await toggleModState(fileName);
  };

  const handleDeleteClick = (fileName: string) => {
    setModToDelete(fileName);
  };

  const handleConfirmDelete = async () => {
    if (modToDelete) {
      await deleteMod(modToDelete);
      setModToDelete(null);
    }
  };

  const currentMods = selectedTab === 'available' ? filteredAvailableMods : filteredInstalledMods;
  const currentCount = currentMods.length;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="mods-page h-full flex flex-col"
    >
      <div className="mods-page__header flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="mods-page__back flex-shrink-0"
          title="Voltar"
        >
          <ArrowLeft size={18} />
        </Button>
        <div className="mods-page__title flex-1">
          <h1 className="text-3xl font-bold text-white tracking-tight">Mods</h1>
          <p className="text-sm text-white/50 mt-1">
            Gerencie seus mods de Hytale através do CurseForge
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={isLoading}
          className="mods-page__refresh flex-shrink-0"
          title="Atualizar lista"
        >
          <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <div className="mods-page__toolbar flex flex-col gap-4 mb-6">
        <div className="mods-page__search-row flex items-center gap-3">
          <SearchBar
            value={searchQuery}
            onChange={handleSearch}
            onSearch={handleDebouncedSearch}
            placeholder="Buscar mods..."
            disabled={isLoading}
            className="mods-page__search flex-1"
            size="sm"
            variant="compact"
            debounceMs={300}
          />
          <Button
            variant="outline"
            size="sm"
            className="mods-page__filters flex-shrink-0 gap-2"
          >
            <Filter size={16} />
            <span>Filtros</span>
            <ChevronDown size={14} className="opacity-50" />
          </Button>
        </div>

        <TabSelector
          activeTab={selectedTab}
          onTabChange={setSelectedTab}
          availableCount={availableMods.length}
          installedCount={installedMods.length}
          className="mods-page__tabs"
        />
      </div>

      <div className="mods-page__content flex-1 min-h-0 overflow-y-auto pr-2 launcher-scrollbar">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mods-page__loading h-full flex items-center justify-center"
          >
            <EmptyState
              variant="loading"
              title="Carregando mods..."
              description="Aguarde enquanto buscamos os mods disponíveis"
            />
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mods-page__error h-full flex items-center justify-center"
          >
            <EmptyState
              variant="error"
              title="Erro ao carregar mods"
              description={error}
              actionLabel="Tentar novamente"
              onAction={handleRefresh}
            />
          </motion.div>
        ) : currentCount === 0 ? (
          <motion.div
            key={`empty-${selectedTab}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mods-page__empty h-full flex items-center justify-center"
          >
            {selectedTab === 'available' ? (
              searchQuery ? (
                <EmptyState
                  variant="noResults"
                  title="Nenhum mod encontrado"
                  description="Tente buscar com outros termos ou limpe a busca"
                />
              ) : (
                <EmptyState
                  variant="noMods"
                  title="Nenhum mod disponível"
                  description="A lista de mods está sendo carregada do CurseForge"
                  actionLabel="Atualizar"
                  onAction={handleRefresh}
                />
              )
            ) : (
              <EmptyState
                variant="noMods"
                title="Nenhum mod instalado"
                description="Navegue até a aba 'Disponíveis' para instalar mods"
              />
            )}
          </motion.div>
        ) : (
          <motion.div
            key={`content-${selectedTab}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              "mods-page__content pb-20",
              selectedTab === 'available'
                ? "grid grid-cols-2 gap-3"
                : "flex flex-col gap-2"
            )}
          >
            {currentMods.map((mod) => (
              <motion.div
                key={selectedTab === 'available' ? (mod as CurseForgeMod).id : (mod as InstalledMod).fileName}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {selectedTab === 'available' ? (
                  <ModCard
                    variant="available"
                    mod={mod as CurseForgeMod}
                    onInstall={handleInstall}
                    isInstalled={installedMods.some(
                      (im) => im.name === (mod as CurseForgeMod).name
                    )}
                    isInstalling={installingIds.includes((mod as CurseForgeMod).id)}
                  />
                ) : (
                  <InstalledModRow
                    mod={mod as InstalledMod}
                    onToggle={handleToggle}
                    onDelete={handleDeleteClick}
                    isToggling={togglingIds.includes((mod as InstalledMod).fileName)}
                    isDeleting={deletingIds.includes((mod as InstalledMod).fileName)}
                  />
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <ConfirmationDialog
        isOpen={!!modToDelete}
        onClose={() => setModToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Desinstalar Mod"
        description="Tem certeza que deseja remover este mod? O arquivo será excluído permanentemente."
        confirmLabel="Desinstalar"
        variant="danger"
        isLoading={modToDelete ? deletingIds.includes(modToDelete) : false}
      />
    </motion.div>
  );
}
