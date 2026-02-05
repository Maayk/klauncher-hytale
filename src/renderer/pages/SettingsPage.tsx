import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, FolderOpen, Monitor, Cpu, HardDrive, Languages } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { SettingCard } from '@/renderer/components/Settings/SettingCard';
import { SettingToggle } from '@/renderer/components/Settings/SettingToggle';
import { SettingSelect, type SelectOption } from '@/renderer/components/Settings/SettingSelect';
import { SettingInput } from '@/renderer/components/Settings/SettingInput';
import { cn } from '@/shared/utils/cn';
import { IPC_CHANNELS } from '@/shared/constants/channels';

import { useGameStore } from '@/renderer/store/useGameStore';

export function SettingsPage({ onBack }: { onBack: () => void }) {
    // State
    const [hideLauncher, setHideLauncher] = React.useState(false);
    const [customJava, setCustomJava] = React.useState(false);
    const [isRepairing, setIsRepairing] = React.useState(false);
    const [confirmingRepair, setConfirmingRepair] = React.useState(false);

    const [javaPath, setJavaPath] = React.useState('');
    const [language, setLanguage] = React.useState('pt-BR');
    const [gameChannel, setGameChannel] = React.useState('latest');

    const { status } = useGameStore();

    // Initial Load
    React.useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.GET) as any;
                if (settings) {
                    setHideLauncher(settings.hideLauncher || false);
                    setCustomJava(settings.useCustomJava || false);
                    setJavaPath(settings.customJavaPath || '');
                    setLanguage(settings.language || 'pt-BR');
                    setGameChannel(settings.gameChannel || 'latest');
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
            }
        };
        loadSettings();
    }, []);

    // Persistence Helper
    const updateSetting = async (key: string, value: any) => {
        try {
            await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.SET, { [key]: value });
        } catch (error) {
            console.error(`Failed to save setting ${key}:`, error);
        }
    };

    // Handlers
    const handleHideLauncherChange = (checked: boolean) => {
        setHideLauncher(checked);
        updateSetting('hideLauncher', checked);
    };

    const handleCustomJavaChange = (checked: boolean) => {
        setCustomJava(checked);
        updateSetting('useCustomJava', checked);
    };

    const handleLanguageChange = (value: string) => {
        setLanguage(value);
        updateSetting('language', value);
    };

    const handleSelectJavaPath = async () => {
        try {
            const result = await window.electronAPI.invoke(IPC_CHANNELS.JAVA.SELECT_PATH) as { success: boolean; path?: string };
            if (result.success && result.path) {
                setJavaPath(result.path);
            }
        } catch (error) {
            console.error('Failed to select Java path:', error);
        }
    };

    const handleOpenGameFolder = () => {
        window.electronAPI.invoke(IPC_CHANNELS.GAME.OPEN_LOCATION);
    };

    const handleRepairGame = async () => {
        if (!confirmingRepair) {
            setConfirmingRepair(true);
            setTimeout(() => setConfirmingRepair(false), 3000);
            return;
        }

        setIsRepairing(true);
        setConfirmingRepair(false);
        try {
            await window.electronAPI.invoke(IPC_CHANNELS.GAME.REPAIR, gameChannel);
        } catch (error) {
            console.error("Repair failed", error);
        } finally {
            setIsRepairing(false);
        }
    };

    // Listeners for progress would go here if needed...
    React.useEffect(() => {
    }, []);

    // Options
    const languageOptions: SelectOption[] = [
        { value: 'pt-BR', label: '🇧🇷 Português (BR)' },
        { value: 'en-US', label: '🇺🇸 English (US)' },
        { value: 'es-ES', label: '🇪🇸 Español' },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="settings-page h-full flex flex-col"
        >
            <div className="settings-page__header flex items-center gap-4 mb-6">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onBack}
                    className="settings-page__back shrink-0"
                    title="Voltar"
                >
                    <ArrowLeft size={18} />
                </Button>
                <div className="settings-page__title flex-1">
                    <h1 className="text-3xl font-bold text-white tracking-tight">Configurações</h1>
                    <p className="text-sm text-white/50 mt-1">
                        Personalize sua experiência no Kyam Launcher
                    </p>
                </div>
            </div>

            <div className="settings-page__content flex-1 min-h-0 overflow-y-auto pr-2 launcher-scrollbar flex flex-col gap-6 pb-8">

                {/* PERFIL */}

                {/* JOGO */}
                <section className="settings-section">
                    <h2 className="text-xs font-bold tracking-[0.15em] text-white/40 uppercase mb-3 px-1">
                        Jogo
                    </h2>
                    <div className="settings-section__cards flex flex-col gap-2">
                        <SettingCard
                            title="Pasta do Jogo"
                            description="Abrir pasta de instalação"
                            icon={<FolderOpen size={18} className="text-emerald-400" />}
                            action={
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleOpenGameFolder}
                                    className="h-8 px-3 gap-2"
                                >
                                    Abrir
                                </Button>
                            }
                        />

                        <SettingCard
                            title="Reparar Jogo"
                            description={`Reinstalar a versão: ${gameChannel}`}
                            icon={<HardDrive size={18} className="text-red-400" />}
                            action={
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRepairGame}
                                    disabled={isRepairing || status === 'launching' || status === 'running'}
                                    className={cn(
                                        "h-8 px-3 gap-2 transition-all duration-200",
                                        confirmingRepair
                                            ? "bg-red-500/10 text-red-400 border-red-500/50 hover:bg-red-500/20"
                                            : "hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50",
                                        (isRepairing || status === 'launching' || status === 'running') && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    {isRepairing
                                        ? 'Reparando...'
                                        : status === 'launching'
                                            ? 'Baixando...'
                                            : status === 'running'
                                                ? 'Em Execução'
                                                : confirmingRepair
                                                    ? 'Confirmar?'
                                                    : 'Reparar'
                                    }
                                </Button>
                            }
                        />
                    </div>
                </section>

                {/* PERFORMANCE (Simplificado) */}
                <section className="settings-section">
                    <h2 className="text-xs font-bold tracking-[0.15em] text-white/40 uppercase mb-3 px-1">
                        Comportamento
                    </h2>
                    <div className="settings-section__cards flex flex-col gap-2">
                        <SettingCard
                            title="Ocultar Launcher ao jogar"
                            description="Minimiza o launcher enquanto o jogo está rodando"
                            icon={<Monitor size={18} className="text-blue-400" />}
                            action={
                                <SettingToggle
                                    size="md"
                                    checked={hideLauncher}
                                    onChange={handleHideLauncherChange}
                                />
                            }
                        />
                    </div>
                </section>

                {/* JAVA */}
                <section className="settings-section">
                    <h2 className="text-xs font-bold tracking-[0.15em] text-white/40 uppercase mb-3 px-1">
                        Java
                    </h2>
                    <div className="settings-section__cards flex flex-col gap-2">
                        <SettingCard
                            title="Usar Java Personalizado"
                            description="Substituir Java padrão do launcher"
                            icon={<Cpu size={18} className="text-orange-400" />}
                            action={
                                <SettingToggle
                                    size="md"
                                    checked={customJava}
                                    onChange={handleCustomJavaChange}
                                />
                            }
                        />

                        {customJava && (
                            <SettingCard
                                title="Caminho do Executável Java"
                                description="Localização do java.exe"
                                icon={<Cpu size={18} className="text-orange-400/50" />}
                                action={
                                    <div className="flex items-center gap-2">
                                        <SettingInput
                                            size="sm"
                                            value={javaPath}
                                            readOnly
                                            placeholder="Nenhum selecionado"
                                            className="w-64 cursor-default bg-white/5"
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleSelectJavaPath}
                                            className="h-8 px-3"
                                        >
                                            Procurar
                                        </Button>
                                    </div>
                                }
                            />
                        )}
                    </div>
                </section>

                {/* INTERFACE */}
                <section className="settings-section">
                    <h2 className="text-xs font-bold tracking-[0.15em] text-white/40 uppercase mb-3 px-1">
                        Interface
                    </h2>
                    <div className="settings-section__cards flex flex-col gap-2">
                        <SettingCard
                            title="Idioma"
                            description="Selecionar idioma da interface"
                            icon={<Languages size={18} className="text-green-400" />}
                            action={
                                <SettingSelect
                                    size="sm"
                                    options={languageOptions}
                                    value={language}
                                    onChange={handleLanguageChange}
                                    className="w-40"
                                />
                            }
                        />
                    </div>
                </section>

            </div>
        </motion.div>
    );
}
