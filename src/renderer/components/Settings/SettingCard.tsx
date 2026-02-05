import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';
import React from 'react';

const settingCardVariants = cva(
    'setting-card rounded-lg border transition-all duration-200',
    {
        variants: {
            variant: {
                default: 'bg-black/50 border-white/5 hover:border-white/10 hover:bg-black/60',
                active: 'bg-black/60 border-white/10',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    }
);

export interface SettingCardProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof settingCardVariants> {
    title: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
}

export const SettingCard = React.forwardRef<HTMLDivElement, SettingCardProps>(
    ({ className, variant, title, description, icon, action, children, ...props }, ref) => {
        return (
            <div
                className={cn(settingCardVariants({ variant, className }))}
                ref={ref}
                {...props}
            >
                <div className="flex items-start justify-between gap-3 p-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        {icon && (
                            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-white/5 shrink-0">
                                {icon}
                            </div>
                        )}
                        <div className="flex flex-col min-w-0">
                            <h3 className="text-sm font-medium text-white/95 truncate">
                                {title}
                            </h3>
                            {description && (
                                <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                                    {description}
                                </p>
                            )}
                        </div>
                    </div>
                    {action && (
                        <div className="flex items-center shrink-0">
                            {action}
                        </div>
                    )}
                </div>
                {children && (
                    <div className="px-3 pb-3">
                        {children}
                    </div>
                )}
            </div>
        );
    }
);

SettingCard.displayName = 'SettingCard';

export { settingCardVariants };
