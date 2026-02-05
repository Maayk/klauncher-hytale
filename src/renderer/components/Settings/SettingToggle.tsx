import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';
import React from 'react';

const toggleVariants = cva(
    'relative inline-flex items-center h-5 rounded-full transition-all duration-200 cursor-pointer select-none',
    {
        variants: {
            size: {
                sm: 'w-9',
                md: 'w-10',
            },
        },
        defaultVariants: {
            size: 'md',
        },
    }
);

const thumbVariants = cva(
    'absolute left-0.5 top-0.5 rounded-full bg-white shadow-sm transition-all duration-200 pointer-events-none',
    {
        variants: {
            size: {
                sm: 'h-4 w-4',
                md: 'h-4 w-4',
            },
        },
        defaultVariants: {
            size: 'md',
        },
    }
);

export interface SettingToggleProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>,
    VariantProps<typeof toggleVariants> {
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export const SettingToggle = React.forwardRef<HTMLButtonElement, SettingToggleProps>(
    ({ className, size, checked, onChange, disabled, ...props }, ref) => {
        const handleClick = () => {
            if (!disabled) {
                onChange(!checked);
            }
        };

        return (
            <button
                ref={ref}
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={handleClick}
                disabled={disabled}
                className={cn(
                    toggleVariants({ size }),
                    checked
                        ? 'bg-white/20 hover:bg-white/30'
                        : 'bg-white/5 hover:bg-white/10',
                    disabled && 'opacity-40 cursor-not-allowed',
                    className
                )}
                {...props}
            >
                <span
                    className={cn(
                        thumbVariants({ size }),
                        checked && 'translate-x-5'
                    )}
                />
            </button>
        );
    }
);

SettingToggle.displayName = 'SettingToggle';

export { toggleVariants };
