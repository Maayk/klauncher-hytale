import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { IPC_CHANNELS } from '@/shared/constants/channels';
import { AnimatePresence, motion } from 'framer-motion';

interface Version {
    id: string;
    label: string;
    version: string;
}

export function VersionSelector() {
    const [isOpen, setIsOpen] = useState(false);
    const [versions, setVersions] = useState<Version[]>([]);
    const [selectedId, setSelectedId] = useState<string>('latest');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch versions separately to ensure UI always loads options even if settings fail
                let versionsData: Version[] = [];
                try {
                    versionsData = await window.electronAPI.invoke(IPC_CHANNELS.GAME.GET_VERSIONS) as Version[];
                } catch (e) {
                    console.error('Failed to fetch versions', e);
                    versionsData = [{ id: 'latest', label: 'Latest (Fallback)', version: 'Unknown' }];
                }

                setVersions(versionsData);

                // Fetch settings
                let currentChannel = 'latest';
                try {
                    const settings = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.GET) as { gameChannel: string };
                    currentChannel = settings.gameChannel || 'latest';
                } catch (e) {
                    console.error('Failed to fetch settings', e);
                }

                const exist = versionsData.find((v: Version) => v.id === currentChannel);
                setSelectedId(exist ? currentChannel : versionsData[0]?.id || 'latest');
            } catch (error) {
                console.error('Critical error in VersionSelector', error);
            }
        };
        fetchData();
    }, []);

    // Handle click outside to close
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = async (versionId: string) => {
        setSelectedId(versionId);
        setIsOpen(false);
        try {
            await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.SET, { gameChannel: versionId });
        } catch (error) {
            console.error('Failed to update game channel', error);
        }
    };

    const selectedVersion = versions.find(v => v.id === selectedId) || { id: 'latest', label: 'Loading...', version: '...' };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-4 rounded-lg bg-black/50 px-4 py-2.5 backdrop-blur-xl border border-white/10 hover:bg-black/70 hover:border-white/20 transition-all duration-200 group min-w-[140px]"
            >
                <div className="flex flex-col items-start mr-auto">
                    <span className="text-[8px] font-bold tracking-[0.15em] text-white/40 uppercase mb-0.5 group-hover:text-white/60 transition-colors">
                        Version
                    </span>
                    <span className="text-[11px] font-semibold text-white/90 tabular-nums">
                        {selectedVersion.version || selectedVersion.label}
                    </span>
                </div>
                <ChevronDown
                    size={14}
                    className={cn(
                        "text-white/40 transition-transform duration-300",
                        isOpen && "rotate-180 text-white/80"
                    )}
                />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute bottom-full mb-2 right-0 w-64 p-1 rounded-xl bg-[#0f0f0f]/95 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden z-50 flex flex-col gap-0.5"
                    >
                        {versions.map((ver) => (
                            <button
                                key={ver.id}
                                onClick={() => handleSelect(ver.id)}
                                className={cn(
                                    "relative w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-left group",
                                    selectedId === ver.id
                                        ? "bg-white/10 text-white"
                                        : "text-white/60 hover:text-white hover:bg-white/5"
                                )}
                            >
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-[12px] font-medium truncate">
                                        {ver.label || ver.id}
                                    </span>
                                    <span className="text-[10px] text-white/40 font-mono truncate">
                                        {ver.version}
                                    </span>
                                </div>

                                {selectedId === ver.id && (
                                    <motion.div
                                        layoutId="check"
                                        className="text-emerald-400"
                                    >
                                        <Check size={14} strokeWidth={3} />
                                    </motion.div>
                                )}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
