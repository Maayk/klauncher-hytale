import React from 'react';
import { useGameStore } from '@/renderer/store/useGameStore';
import { IPC_CHANNELS } from '@/shared/constants/channels';

export function GameStatusListener() {
    const { setStatus, setProgress, setMessage, reset } = useGameStore();

    React.useEffect(() => {
        const handleProgress = (_event: any, data: any) => {
            // Data might be just options object or proper progress object
            if (data) {
                const progress = typeof data.progress === 'number' ? data.progress : 0;
                const message = data.message || '';
                const stage = data.stage || '';

                setStatus('launching');
                setProgress(progress, stage, message);
            }
        };

        const handlePatchProgress = (_event: any, data: any) => {
            if (data) {
                const progress = typeof data.progress === 'number' ? data.progress : 0;
                const message = data.message || '';
                const stage = data.stage || '';

                setStatus('launching'); // Patching is part of launching sequence for UI
                setProgress(progress, stage, message);
            }
        };

        const handleStatus = (_event: any, ...args: unknown[]) => {
            const status = args[0] as string;
            setMessage(status);
        };

        const handleSuccess = (_event: any, ...args: unknown[]) => {
            const message = args[0] as string;
            setStatus('running');
            setMessage(message);
            // We might want to reset progress here
            setProgress(100, 'launched', message);
        };

        const handleError = (_event: any, ...args: unknown[]) => {
            const error = args[0] as string;
            setStatus('error');
            setMessage(error);
        };

        const handleStopped = () => {
            setStatus('idle');
            reset();
        };

        // Subscribe
        const unsubProgress = window.electronAPI.on(IPC_CHANNELS.GAME.PROGRESS, handleProgress);
        const unsubPatch = window.electronAPI.on(IPC_CHANNELS.GAME.PATCH_PROGRESS, handlePatchProgress);
        const unsubStatus = window.electronAPI.on(IPC_CHANNELS.GAME.STATUS, handleStatus);
        const unsubSuccess = window.electronAPI.on(IPC_CHANNELS.GAME.SUCCESS, handleSuccess);
        const unsubError = window.electronAPI.on(IPC_CHANNELS.GAME.ERROR, handleError);
        const unsubStopped = window.electronAPI.on(IPC_CHANNELS.GAME.STOPPED, handleStopped);

        return () => {
            unsubProgress();
            unsubPatch();
            unsubStatus();
            unsubSuccess();
            unsubError();
            unsubStopped();
        };
    }, [setStatus, setProgress, setMessage, reset]);

    return null; // Logic only component
}
