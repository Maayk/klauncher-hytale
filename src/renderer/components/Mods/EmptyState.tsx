import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';
import { Package, Search, Download, RefreshCw } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';

const emptyStateVariants = cva(
  'empty-state flex flex-col items-center justify-center p-10 text-center',
  {
    variants: {
      variant: {
        noMods: '',
        noResults: '',
        loading: '',
        error: '',
      },
    },
    defaultVariants: {
      variant: 'noMods',
    },
  }
);

export interface EmptyStateProps extends VariantProps<typeof emptyStateVariants> {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  variant = 'noMods',
  title,
  description,
  actionLabel,
  onAction,
  icon,
  className,
}: EmptyStateProps) {
  const defaultIcons: Record<string, React.ReactNode> = {
    noMods: <Package size={56} className="text-white/20" />,
    noResults: <Search size={56} className="text-white/20" />,
    loading: <RefreshCw size={56} className="text-blue-500/40 animate-spin" />,
    error: <Download size={56} className="text-red-500/20" />,
  };

  return (
    <div className={cn(emptyStateVariants({ variant }), className)}>
      <div className="empty-state__icon mb-5">
        {icon || defaultIcons[variant || 'noMods']}
      </div>
      <h3 className="empty-state__title text-xl font-semibold text-white mb-3">
        {title}
      </h3>
      <p className="empty-state__description text-base text-white/50 max-w-sm mb-5">
        {description}
      </p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
