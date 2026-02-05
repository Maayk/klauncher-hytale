import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/renderer/components/ui/button';
import { AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface ConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'info' | 'warning';
    isLoading?: boolean;
}

export function ConfirmationDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    variant = 'warning',
    isLoading = false,
}: ConfirmationDialogProps) {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={isLoading ? undefined : onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />

                {/* Dialog */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative w-full max-w-md bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-start justify-between p-6 pb-2">
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                                variant === 'danger' ? "bg-red-500/20 text-red-500" :
                                    variant === 'warning' ? "bg-yellow-500/20 text-yellow-500" :
                                        "bg-blue-500/20 text-blue-500"
                            )}>
                                {variant === 'info' ? <Info size={20} /> : <AlertTriangle size={20} />}
                            </div>
                            <h3 className="text-xl font-bold text-white leading-none">{title}</h3>
                        </div>
                        {!isLoading && (
                            <button
                                onClick={onClose}
                                className="text-white/40 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    <div className="px-6 py-4">
                        <p className="text-white/70 leading-relaxed">
                            {description}
                        </p>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 p-6 pt-2">
                        <Button
                            variant="ghost"
                            onClick={onClose}
                            disabled={isLoading}
                            className="text-white/60 hover:text-white"
                        >
                            {cancelLabel}
                        </Button>
                        <Button
                            variant="primary"
                            onClick={onConfirm}
                            disabled={isLoading}
                            className={cn(
                                "min-w-[100px]",
                                variant === 'danger' && "bg-red-600 hover:bg-red-700 text-white border-none",
                                variant === 'warning' && "bg-yellow-600 hover:bg-yellow-700 text-white border-none"
                            )}
                        >
                            {isLoading ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-spin h-4 w-4 border-2 border-white/20 border-t-white rounded-full" />
                                    Processando...
                                </span>
                            ) : (
                                confirmLabel
                            )}
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
