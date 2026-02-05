import React, { useState, useEffect } from 'react';
import { Puzzle, User, Home, Settings as SettingsIcon } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { WindowControls } from '@/renderer/components/Window/WindowControls';
import { useNavigationStore } from '@/renderer/store/useNavigationStore';
import { IPC_CHANNELS } from '@/shared/constants/channels';
import type { Settings } from '@/shared/schemas/config';

export function Header() {
    const currentPage = useNavigationStore((state) => state.currentPage);
    const navigateTo = useNavigationStore((state) => state.navigateTo);
    const [nickname, setNickname] = useState('');

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.GET) as Settings;
                if (settings && settings.playerName) {
                    setNickname(settings.playerName);
                }
            } catch (error) {
                console.error('Failed to load settings in Header:', error);
            }
        };
        loadSettings();
    }, []);

    const handleSaveNickname = async () => {
        try {
            if (!nickname.trim()) return;
            await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.SET, { playerName: nickname });
            console.log('Nickname saved:', nickname);
        } catch (error) {
            console.error('Failed to save nickname:', error);
        }
    };

    return (
        <header className="draggable flex items-center justify-between px-4 py-2.5 w-full max-w-full select-none z-50 h-[56px] shrink-0">
            {/* Brand / Left */}
            <div className="flex items-center gap-2 opacity-50 shrink-0">
                <span className="text-[10px] font-bold tracking-[0.15em] text-white uppercase">Kyam Launcher v1.0.0</span>
            </div>

            {/* Right Side: User, Nav, Controls - shrink-0 garante que nunca seja cortado */}
            <div className="flex items-center gap-2.5 non-draggable shrink-0">

                {/* Nickname Input Area */}
                <div className="flex items-center gap-2.5 rounded-full border border-white/5 bg-black/40 pl-2.5 pr-3.5 py-1.5 backdrop-blur-md transition-colors hover:border-white/10 group">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                        <User size={12} className="text-white/70" />
                    </div>
                    <input
                        type="text"
                        placeholder="Seu Nick"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        onBlur={handleSaveNickname}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveNickname()}
                        className="bg-transparent text-xs font-medium text-white/90 placeholder:text-white/20 focus:outline-none w-20 text-center"
                    />
                </div>

                {/* Separator */}
                <div className="h-4 w-px bg-white/10" />

                {/* Icons group */}
                <div className="flex items-center gap-1">
                    <Button
                        variant={currentPage === 'home' ? 'action' : 'ghost'}
                        size="icon"
                        className={`${currentPage === 'home' ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} rounded-full w-8 h-8`}
                        title="Home"
                        onClick={() => navigateTo('home')}
                    >
                        <Home size={18} />
                    </Button>
                    <Button
                        variant={currentPage === 'mods' ? 'action' : 'ghost'}
                        size="icon"
                        className={`${currentPage === 'mods' ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} rounded-full w-8 h-8`}
                        title="Mods"
                        onClick={() => navigateTo('mods')}
                    >
                        <Puzzle size={18} />
                    </Button>
                    <Button
                        variant={currentPage === 'settings' ? 'action' : 'ghost'}
                        size="icon"
                        className={`${currentPage === 'settings' ? 'text-white' : 'text-white/60 hover:text-white hover:bg-white/5'} rounded-full w-8 h-8`}
                        title="Configurações"
                        onClick={() => navigateTo('settings')}
                    >
                        <SettingsIcon size={18} />
                    </Button>
                </div>

                {/* Separator */}
                <div className="h-4 w-px bg-white/10" />

                {/* Language Utility */}
                <Button variant="ghost" size="sm" className="gap-1 text-white/60 hover:text-white h-8 px-2">
                    <span className="text-[10px] font-bold">🇺🇸 EN</span>
                </Button>

                {/* Window Controls - fixed position para nunca ser cortado */}
                <div className="pl-1.5 border-l border-white/5 h-8 flex items-center shrink-0 ml-1">
                    <WindowControls />
                </div>
            </div>
        </header>
    );
}
