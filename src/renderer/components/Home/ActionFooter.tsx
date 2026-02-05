import React from 'react';
import { Button } from '@/renderer/components/ui/button';
import { VersionSelector } from './VersionSelector';
import { ChevronDown, Play, Check } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { IPC_CHANNELS } from '@/shared/constants/channels';
import type { Settings } from '@/shared/schemas/config';

type Channel = 'current' | 'legacy';

interface ChannelOption {
    value: Channel;
    label: string;
    description: string;
}

const CHANNEL_OPTIONS: ChannelOption[] = [
    { value: 'current', label: 'Current', description: 'Latest Beta Build' },
    { value: 'legacy', label: 'Legacy', description: 'Stable Release' }
];

export function ActionFooter() {
    const [isLaunching, setIsLaunching] = React.useState(false);
    const [settings, setSettings] = React.useState<Settings | null>(null);
    const [launchStatus, setLaunchStatus] = React.useState('');
    const [launchProgress, setLaunchProgress] = React.useState(0);

    React.useEffect(() => {
        const loadSettings = async () => {
            try {
                const settingsData = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.GET) as Settings;
                setSettings(settingsData);
            } catch (error) {
                console.error('Failed to load settings:', error);
            }
        };
        loadSettings();
    }, []);

    const handleLaunch = async () => {
        if (isLaunching) return;
        setIsLaunching(true);

        try {
            // Fetch fresh settings to get the latest nickname
            const freshSettings = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.GET) as Settings;

            const channel = freshSettings?.gameChannel || settings?.gameChannel || 'latest';
            const playerName = freshSettings?.playerName || settings?.playerName || 'Player';

            await window.electronAPI.invoke(IPC_CHANNELS.GAME.LAUNCH, channel, playerName);
        } catch (error) {
            console.error('Failed to launch game:', error);
        } finally {
            setIsLaunching(false);
        }
    };

    // Listen for game progress updates
    React.useEffect(() => {
        const handleProgress = (_event: unknown, progress: any) => {
            console.log('Game progress:', progress);
            if (progress.message) setLaunchStatus(progress.message);
            if (typeof progress.progress === 'number') setLaunchProgress(progress.progress);
        };

        const handlePatchProgress = (_event: unknown, progress: any) => {
            console.log('Patch progress:', progress);
            // Patch progress structure might be different, adapt as needed
            // Usually patch progress has stage, message, progress
        };

        const handleGameStarted = () => {
            setIsLaunching(false);
            console.log('Game started');
        };

        const handleGameStopped = () => {
            setIsLaunching(false);
            console.log('Game stopped');
        };

        const handleError = (_event: unknown, ...args: unknown[]) => {
            const error = args[0] as string;
            console.error('Game error:', error);
            setIsLaunching(false);
        };

        const unsubscribeProgress = window.electronAPI.on(IPC_CHANNELS.GAME.PROGRESS, handleProgress);
        const unsubscribePatchProgress = window.electronAPI.on(IPC_CHANNELS.GAME.PATCH_PROGRESS, handlePatchProgress);
        const unsubscribeGameStarted = window.electronAPI.on(IPC_CHANNELS.GAME.STARTED, handleGameStarted);
        const unsubscribeGameStopped = window.electronAPI.on(IPC_CHANNELS.GAME.STOPPED, handleGameStopped);
        const unsubscribeError = window.electronAPI.on(IPC_CHANNELS.GAME.ERROR, handleError);

        return () => {
            unsubscribeProgress();
            unsubscribePatchProgress();
            unsubscribeGameStarted();
            unsubscribeGameStopped();
            unsubscribeError();
        };
    }, []);

    return (
        <div className="flex flex-col items-end gap-3 shrink-0">

            {/* Version Display Only */}
            <VersionSelector />

            {/* Play Button - Clean White Style */}
            <Button
                variant="primary"
                size="lg"
                onClick={handleLaunch}
                disabled={isLaunching}
                className="w-44 h-12 text-base tracking-[0.15em] font-black bg-white hover:bg-white/90 text-black border-0 shadow-[0_0_30px_rgba(255,255,255,0.25)] hover:shadow-[0_0_40px_rgba(255,255,255,0.35)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLaunching ? (
                    <div className="flex flex-col items-center justify-center w-full">
                        <span className="text-[10px] font-bold tracking-wider mb-1 animate-pulse uppercase">{launchStatus || 'LAUNCHING...'}</span>
                        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-cyan-500 transition-all duration-300 ease-out" style={{ width: `${launchProgress}%` }} />
                        </div>
                    </div>
                ) : (
                    <>
                        <Play size={16} fill="currentColor" />
                        PLAY
                    </>
                )}
            </Button>

        </div>
    );
}
