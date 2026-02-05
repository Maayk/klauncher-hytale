import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';
import React from 'react';
import { ChevronDown } from 'lucide-react';

const selectVariants = cva(
    'flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border text-sm font-medium text-white/95 transition-all duration-200 cursor-pointer select-none',
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

export interface SelectOption {
    value: string;
    label: string;
    description?: string;
}

export interface SettingSelectProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>,
    VariantProps<typeof selectVariants> {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export const SettingSelect = React.forwardRef<HTMLDivElement, SettingSelectProps>(
    ({ className, size, options, value, onChange, disabled, ...props }, ref) => {
        const [isOpen, setIsOpen] = React.useState(false);
        const selectRef = React.useRef<HTMLDivElement>(null);

        const selectedOption = options.find(opt => opt.value === value);

        React.useEffect(() => {
            function handleClickOutside(event: MouseEvent) {
                if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                }
            }
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, []);

        const handleToggle = () => {
            if (!disabled) {
                setIsOpen(!isOpen);
            }
        };

        const handleSelect = (optionValue: string) => {
            onChange(optionValue);
            setIsOpen(false);
        };

        return (
            <div ref={selectRef} className="relative">
                <div
                    ref={ref}
                    onClick={handleToggle}
                    className={cn(
                        selectVariants({ size }),
                        'bg-[#0f111a]/70 border-white/10 hover:border-white/20 hover:bg-[#0f111a]/90',
                        disabled && 'opacity-40 cursor-not-allowed',
                        className
                    )}
                    {...props}
                >
                    <span className="truncate">{selectedOption?.label || value}</span>
                    <ChevronDown
                        size={13}
                        className={cn(
                            'text-white/30 transition-transform duration-200 shrink-0',
                            isOpen && 'rotate-180'
                        )}
                    />
                </div>

                {isOpen && (
                    <div className="absolute bottom-full mb-1.5 right-0 min-w-[160px] py-1 rounded-md bg-[#0f111a]/95 border border-white/15 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-1 duration-200 max-h-60 overflow-y-auto launcher-scrollbar">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => handleSelect(option.value)}
                                className={cn(
                                    'w-full px-2.5 py-1.5 flex flex-col items-start text-left transition-colors cursor-pointer',
                                    'hover:bg-white/5',
                                    value === option.value && 'bg-white/5'
                                )}
                            >
                                <span className={cn(
                                    'text-sm font-medium',
                                    value === option.value ? 'text-white' : 'text-white/80'
                                )}>
                                    {option.label}
                                </span>
                                {option.description && (
                                    <span className="text-xs text-white/30 mt-0.5">
                                        {option.description}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    }
);

SettingSelect.displayName = 'SettingSelect';

export { selectVariants };
