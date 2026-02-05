import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';
import React from 'react';

const buttonVariants = cva(
    'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer',
    {
        variants: {
            variant: {
                primary: 'bg-white text-black hover:bg-gray-100 shadow-[0_0_20px_rgba(255,255,255,0.3)] border border-transparent',
                secondary: 'bg-black/40 text-white hover:bg-black/50 hover:text-white border border-white/10',
                ghost: 'hover:bg-black/50 text-white',
                outline: 'border border-white/20 bg-black/40 hover:bg-black/50 hover:border-white/30 text-white',
                action: 'bg-gray-700 text-white hover:bg-gray-600 shadow-lg',
            },
            size: {
                default: 'h-10 px-4 py-2',
                sm: 'h-9 px-3',
                lg: 'h-14 px-8 text-lg uppercase tracking-widest font-bold',
                icon: 'h-10 w-10',
            },
        },
        defaultVariants: {
            variant: 'primary',
            size: 'default',
        },
    }
);

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
