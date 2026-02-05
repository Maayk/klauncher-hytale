import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';
import { Download, Package } from 'lucide-react';
import type { ModsTab } from '@/shared/types/mods';

const tabSelectorVariants = cva(
  'tab-selector inline-flex items-center gap-1 rounded-lg bg-black/40 border border-white/10 p-1',
  {
    variants: {
      size: {
        default: '',
        sm: 'bg-transparent p-0',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
);

const tabButtonVariants = cva(
  'tab-button flex items-center gap-2.5 rounded-md px-4 py-2 text-sm font-medium transition-all duration-200',
  {
    variants: {
      active: {
        true: 'bg-black/60 text-white shadow-sm',
        false: 'text-white/70 hover:text-white hover:bg-black/50',
      },
    },
    defaultVariants: {
      active: false,
    },
  }
);

export interface TabSelectorProps extends VariantProps<typeof tabSelectorVariants> {
  activeTab: ModsTab;
  onTabChange: (tab: ModsTab) => void;
  availableCount?: number;
  installedCount?: number;
  className?: string;
}

export function TabSelector({
  activeTab,
  onTabChange,
  availableCount,
  installedCount,
  size = 'default',
  className,
}: TabSelectorProps) {
  const tabs: Array<{ key: ModsTab; label: string; icon: React.ReactNode; count?: number }> = [
    {
      key: 'available',
      label: 'Disponíveis',
      icon: <Download size={18} />,
      count: availableCount,
    },
    {
      key: 'installed',
      label: 'Instalados',
      icon: <Package size={18} />,
      count: installedCount,
    },
  ];

  return (
    <div className={cn(tabSelectorVariants({ size }), className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={cn(
            tabButtonVariants({ active: activeTab === tab.key }),
            'whitespace-nowrap'
          )}
          title={`${tab.label} - ${tab.count ?? 0} mods`}
        >
          {tab.icon}
          <span>{tab.label}</span>
          {tab.count !== undefined && (
            <span className={cn(
              'tab-badge px-2 py-0.5 rounded-full text-xs font-medium',
              activeTab === tab.key
                ? 'bg-blue-600/40 text-blue-100'
                : 'bg-black/30 text-white/70'
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
