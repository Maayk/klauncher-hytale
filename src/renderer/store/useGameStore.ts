import { create } from 'zustand';

interface GameState {
    status: 'idle' | 'launching' | 'running' | 'error';
    progress: number;
    stage: string;
    message: string;

    setStatus: (status: 'idle' | 'launching' | 'running' | 'error') => void;
    setProgress: (progress: number, stage: string, message: string) => void;
    setMessage: (message: string) => void;
    reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
    status: 'idle',
    progress: 0,
    stage: '',
    message: '',

    setStatus: (status) => set({ status }),
    setProgress: (progress, stage, message) => set({ progress, stage, message }),
    setMessage: (message) => set({ message }),
    reset: () => set({ status: 'idle', progress: 0, stage: '', message: '' }),
}));
