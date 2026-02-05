import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';
import React from 'react';

const inputVariants = cva(
    'flex items-center px-2.5 py-1.5 rounded-md border text-sm font-medium transition-all duration-200',
    {
        variants: {
            size: {
                sm: 'h-7 text-xs',
                md: 'h-8 text-sm',
            },
        },
        defaultVariants: {
            size: 'md',
        },
    }
);

export interface SettingInputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
}

export const SettingInput = React.forwardRef<HTMLInputElement, SettingInputProps>(
    ({ className, size, disabled, ...props }, ref) => {
        return (
            <input
                ref={ref}
                disabled={disabled}
                className={cn(
                    inputVariants({ size }),
                    'bg-black/50 border-white/5 text-white/95 placeholder:text-white/20 focus:border-white/15 focus:bg-black/60 focus:outline-none',
                    disabled && 'opacity-40 cursor-not-allowed',
                    className
                )}
                {...props}
            />
        );
    }
);

SettingInput.displayName = 'SettingInput';

export { inputVariants };
