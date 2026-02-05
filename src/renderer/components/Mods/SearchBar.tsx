import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/utils/cn';
import { Search, X } from 'lucide-react';
import { useRef, useEffect } from 'react';

const searchBarVariants = cva(
  'search-bar flex items-center gap-2 rounded-full border transition-all duration-200',
  {
    variants: {
      variant: {
        default: 'bg-[#0f111a]/70 border-white/15 focus-within:border-white/30 focus-within:bg-[#0f111a]/90 focus-within:shadow-[0_0_0_2px_rgba(255,255,255,0.05)]',
        compact: 'bg-[#0f111a]/50 border-white/10 focus-within:border-white/25',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface SearchBarProps extends VariantProps<typeof searchBarVariants> {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  debounceMs?: number;
  className?: string;
}

export function SearchBar({
  variant = 'default',
  size = 'default',
  value,
  onChange,
  onSearch,
  onClear,
  placeholder = 'Buscar mods...',
  disabled = false,
  debounceMs = 300,
  className,
}: SearchBarProps) {
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (onSearch) {
        onSearch(newValue);
      }
    }, debounceMs);
  };

  const handleClear = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onChange('');
    onClear?.();
    onSearch?.('');

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className={cn(searchBarVariants({ variant, size }), className)}>
      <Search size={size === 'sm' ? 16 : 18} className="search-bar__icon flex-shrink-0 text-white/40 transition-colors peer-focus-within:text-white" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'search-bar__input flex-1 bg-transparent text-white placeholder:text-white/30 focus:outline-none',
          size === 'sm' ? 'text-sm' : 'text-base'
        )}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="search-bar__clear flex-shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          title="Limpar busca"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}
