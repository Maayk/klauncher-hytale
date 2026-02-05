import React from 'react';
import { Switch } from '@/renderer/components/ui/switch';
import { Trash2, AlertCircle } from 'lucide-react';
import { type InstalledMod } from '@/shared/types/mods';
import { cn } from '@/shared/utils/cn';
import { Button } from '@/renderer/components/ui/button';

interface InstalledModRowProps {
    mod: InstalledMod;
    onToggle: (fileName: string) => void;
    onDelete: (fileName: string) => void;
    isToggling: boolean;
    isDeleting: boolean;
}

export function InstalledModRow({
    mod,
    onToggle,
    onDelete,
    isToggling,
    isDeleting,
}: InstalledModRowProps) {
    const isEnabled = mod.enabled;

    return (
        <div
            className={cn(
                "group flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-[#0f111a]/70 hover:bg-[#0f111a]/90 transition-all duration-200 shadow-lg",
                !isEnabled && "opacity-50 grayscale-[0.5]"
            )}
        >
            {/* Icon */}
            <div className="shrink-0 w-12 h-12 rounded-lg bg-black/40 overflow-hidden border border-white/10">
                {mod.logo?.thumbnailUrl ? (
                    <img
                        src={mod.logo.thumbnailUrl}
                        alt={mod.name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20">
                        <AlertCircle size={24} />
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white truncate text-lg">
                        {mod.name}
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10">
                        {mod.fileName.endsWith('.zip') || mod.fileName.endsWith('.zip.disabled') ? 'ZIP' : 'JAR'}
                    </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-white/40 mt-1">
                    <span className="truncate max-w-[200px]">{mod.author}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span className="truncate">v{mod.version}</span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-medium transition-colors", isEnabled ? "text-green-400" : "text-white/30")}>
                        {isEnabled ? 'Ativo' : 'Desativado'}
                    </span>
                    <Switch
                        checked={isEnabled}
                        onCheckedChange={() => onToggle(mod.fileName)}
                        disabled={isToggling}
                        className={cn(isToggling && 'opacity-50 cursor-wait')}
                    />
                </div>

                <div className="w-px h-8 bg-white/10 mx-2" />

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDelete(mod.fileName)}
                    disabled={isDeleting}
                    className="text-white/40 hover:text-red-400 hover:bg-red-500/10"
                    title="Desinstalar Mod"
                >
                    {isDeleting ? (
                        <span className="animate-spin h-5 w-5 border-2 border-current border-t-transparent rounded-full" />
                    ) : (
                        <Trash2 size={20} />
                    )}
                </Button>
            </div>
        </div>
    );
}
