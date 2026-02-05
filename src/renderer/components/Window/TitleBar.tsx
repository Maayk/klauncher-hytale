import React from 'react';
import { Minus, X } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { IPC_CHANNELS } from '@/shared/constants/channels';

// Optimized for overlay usage - transparent by default
const controlButtonVariants = cva(
    'inline-flex h-full w-12 items-center justify-center transition-colors duration-200 cursor-pointer',
    {
        variants: {
            action: {
                minimize: 'hover:bg-white/10 text-white/50 hover:text-white',
                close: 'hover:bg-red-500 hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] text-white/50 hover:text-white',
            },
        },
        defaultVariants: {
            action: 'minimize',
        },
    }
);

export function TitleBar() {
    const handleMinimize = () => {
        window.electronAPI.invoke(IPC_CHANNELS.WINDOW.MINIMIZE);
    };

    const handleClose = () => {
        window.electronAPI.invoke(IPC_CHANNELS.WINDOW.CLOSE);
    };

    return (
        <header className="draggable absolute top-0 left-0 right-0 z-50 flex h-10 w-full select-none items-center justify-end px-2">
            <div className="non-draggable flex h-full items-center gap-1">
                <button
                    onClick={handleMinimize}
                    className={controlButtonVariants({ action: 'minimize' })}
                    aria-label="Minimize"
                >
                    <Minus size={16} />
                </button>
                <button
                    onClick={handleClose}
                    className={controlButtonVariants({ action: 'close' })}
                    aria-label="Close"
                >
                    <X size={16} />
                </button>
            </div>
        </header>
    );
}
