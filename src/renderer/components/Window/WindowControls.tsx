import React from 'react';
import { Minus, X } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { IPC_CHANNELS } from '@/shared/constants/channels';

const controlButtonVariants = cva(
    'inline-flex h-full w-11 items-center justify-center transition-colors duration-200 cursor-pointer non-draggable',
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

export function WindowControls() {
    const handleMinimize = () => {
        window.electronAPI.invoke(IPC_CHANNELS.WINDOW.MINIMIZE);
    };

    const handleClose = () => {
        window.electronAPI.invoke(IPC_CHANNELS.WINDOW.CLOSE);
    };

    return (
        <div className="flex h-full items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
                onClick={handleMinimize}
                className={controlButtonVariants({ action: 'minimize' })}
                aria-label="Minimize"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                <Minus size={16} />
            </button>
            <button
                onClick={handleClose}
                className={controlButtonVariants({ action: 'close' })}
                aria-label="Close"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
                <X size={16} />
            </button>
        </div>
    );
}
