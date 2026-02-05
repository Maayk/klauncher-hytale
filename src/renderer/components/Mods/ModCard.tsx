import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';
import { Download, Check, MoreVertical } from 'lucide-react';
import type { CurseForgeMod, InstalledMod } from '@/shared/types/mods';
import { Button } from '@/renderer/components/ui/button';

const modCardVariants = cva(
  'mods-card group relative overflow-hidden rounded-xl border',
  {
    variants: {
      variant: {
        available: 'bg-[#0f111a]/85 border-white/15 hover:border-white/30 hover:bg-[#0f111a]/95 hover:shadow-2xl hover:shadow-black/50',
        installed: 'bg-[#0f111a]/70 border-white/10 hover:border-white/20 hover:bg-[#0f111a]/80 hover:shadow-2xl hover:shadow-black/50',
      },
      size: {
        default: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'available',
      size: 'default',
    },
  }
);

export interface ModCardProps extends VariantProps<typeof modCardVariants> {
  mod?: CurseForgeMod;
  installedMod?: InstalledMod;
  onInstall?: (mod: CurseForgeMod) => void;
  onToggle?: (fileName: string) => void;
  onDelete?: (fileName: string) => void;
  isInstalled?: boolean;
  isInstalling?: boolean;
  isToggling?: boolean;
  isDeleting?: boolean;
  className?: string;
}

export function ModCard({
  variant = 'available',
  mod,
  installedMod,
  onInstall,
  onToggle,
  onDelete,
  isInstalled = false,
  isInstalling = false,
  isToggling = false,
  isDeleting = false,
  className,
}: ModCardProps) {
  const isAvailable = variant === 'available';

  const handleInstall = () => {
    if (mod && onInstall && !isInstalled) {
      onInstall(mod);
    }
  };

  const handleToggle = () => {
    if (installedMod && onToggle) {
      onToggle(installedMod.fileName);
    }
  };

  const handleDelete = () => {
    if (installedMod && onDelete) {
      onDelete(installedMod.fileName);
    }
  };

  const modName = mod?.name || installedMod?.name || 'Unknown Mod';
  const modDescription = mod?.summary || installedMod?.name || '';
  const modVersion = mod?.version || 'Unknown';
  const modAuthor = mod?.author || 'Unknown';
  const modDownloads = mod?.downloads ? formatDownloads(mod.downloads) : null;
  const modLastUpdated = mod?.lastUpdated || null;
  const modLogo = mod?.logo?.thumbnailUrl || null;
  const isEnabled = installedMod?.enabled ?? true;

  return (
    <div className={cn(modCardVariants({ variant }), className)}>
      <div className="mods-card__content p-5 h-full flex flex-col">
        <div className="mods-card__header flex items-start gap-4 mb-4">
          {modLogo && (
            <div className="mods-card__logo flex-shrink-0 w-16 h-16 rounded-lg bg-white/10 overflow-hidden">
              <img
                src={modLogo}
                alt={modName}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
              />
            </div>
          )}
          <div className="mods-card__info flex-1 min-w-0">
            <h3 className="mods-card__title text-base font-semibold text-white leading-tight truncate group-hover:text-white transition-colors">
              {modName}
            </h3>
            <div className="mods-card__meta flex items-center gap-2 mt-1.5 text-xs text-white/50">
              <span className="font-medium text-white/80">{modAuthor}</span>
              {isAvailable && modVersion && (
                <>
                  <span className="w-1 h-1 bg-white/30 rounded-full" />
                  <span>v{modVersion}</span>
                </>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="mods-card__menu flex-shrink-0 w-8 h-8 rounded-md text-white/40 hover:text-white hover:bg-white/10"
            title="Mais opções"
          >
            <MoreVertical size={16} />
          </Button>
        </div>

        <p className="mods-card__description text-sm text-white/70 line-clamp-2 mb-4 flex-1">
          {modDescription}
        </p>

        {isAvailable && (
          <div className="mods-card__stats flex items-center gap-3 text-xs text-white/40 mb-4">
            {modDownloads && (
              <span className="flex items-center gap-1">
                <Download size={12} />
                {modDownloads}
              </span>
            )}
            {modLastUpdated && (
              <span>Atualizado: {modLastUpdated}</span>
            )}
          </div>
        )}

        <div className="mods-card__actions flex items-center gap-2.5 mt-auto">
          {isAvailable && (
            <Button
              variant={isInstalled ? 'secondary' : 'action'}
              size="sm"
              className="mods-card__install flex-1"
              onClick={handleInstall}
              disabled={isInstalled || isInstalling}
            >
              {isInstalling ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                  Instalando...
                </span>
              ) : isInstalled ? (
                <span className="flex items-center gap-2">
                  <Check size={14} />
                  Instalado
                </span>
              ) : (
                'Instalar'
              )}
            </Button>
          )}

          {!isAvailable && installedMod && (
            <>
              <Button
                variant={isEnabled ? 'secondary' : 'outline'}
                size="sm"
                className="mods-card__toggle flex-1"
                onClick={handleToggle}
                disabled={isToggling || isDeleting}
              >
                {isToggling ? (
                  <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full mx-auto" />
                ) : (
                  isEnabled ? 'Ativo' : 'Inativo'
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="mods-card__delete flex-shrink-0 w-9 h-9 rounded-md text-white/40 hover:text-red-400 hover:bg-red-500/10"
                onClick={handleDelete}
                disabled={isDeleting}
                title="Desinstalar"
              >
                {isDeleting ? (
                  <span className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  '×'
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {!isEnabled && !isAvailable && (
        <div className="mods-card__disabled-overlay absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-medium text-white/60">Inativo</span>
        </div>
      )}
    </div>
  );
}

function formatDownloads(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
