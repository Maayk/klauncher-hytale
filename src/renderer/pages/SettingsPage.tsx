import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, User, FolderOpen, Monitor, Cpu, HardDrive, Languages, Bell } from 'lucide-react';
import { Button } from '@/renderer/components/ui/button';
import { SettingCard } from '@/renderer/components/Settings/SettingCard';
import { SettingToggle } from '@/renderer/components/Settings/SettingToggle';
import { SettingSelect, type SelectOption } from '@/renderer/components/Settings/SettingSelect';
import { SettingInput } from '@/renderer/components/Settings/SettingInput';
import { IPC_CHANNELS } from '@/shared/constants/channels';

export function SettingsPage({ onBack }: { onBack: () => void }) {
    const [hideLauncher, setHideLauncher] = React.useState(false);
    const [customJava, setCustomJava] = React.useState(false);
    const [notifications, setNotifications] = React.useState(true);

    const [playerName, setPlayerName] = React.useState('');
    const [javaPath, setJavaPath] = React.useState('');

    const [gameChannel, setGameChannel] = React.useState('current');
    const [language, setLanguage] = React.useState('pt-BR');

    const [gpuPreference, setGpuPreference] = React.useState('auto');

    React.useEffect(() => {
        const loadSettings = async () => {
            try {
                const settings = await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.GET) as any;
                if (settings) {
                    setPlayerName(settings.playerName || '');
                    setHideLauncher(settings.hideLauncher || false);
                    setGameChannel(settings.gameChannel === 'beta' ? 'legacy' : 'current');
                    setLanguage(settings.language || 'pt-BR');
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
            }
        };
        loadSettings();
    }, []);

    const handlePlayerNameChange = async (value: string) => {
        setPlayerName(value);
        try {
            await window.electronAPI.invoke(IPC_CHANNELS.SETTINGS.SET, { playerName: value });
        } catch (error) {
            console.error('Failed to save player name:', error);
        }
    };

    const gameChannelOptions: SelectOption[] = [
        { value: 'current', label: 'Atual', description: 'Última versão beta' },
        { value: 'legacy', label: 'Legado', description: 'Versão estável' }
    ];

    const languageOptions: SelectOption[] = [
        { value: 'pt-BR', label: '🇧🇷 Português (BR)' },
        { value: 'en-US', label: '🇺🇸 English (US)' },
        { value: 'es-ES', label: '🇪🇸 Español' },
        { value: 'fr-FR', label: '🇫🇷 Français' },
        { value: 'de-DE', label: '🇩🇪 Deutsch' }
    ];

    const gpuOptions: SelectOption[] = [
        { value: 'auto', label: 'Automático', description: 'Sistema escolhe a melhor GPU' },
        { value: 'dedicated', label: 'Dedicada', description: 'Força GPU dedicada' },
        { value: 'integrated', label: 'Integrada', description: 'Força GPU integrada' }
    ];

    const handleOpenGameFolder = () => {
        window.electronAPI.invoke(IPC_CHANNELS.GAME.OPEN_LOCATION);
    };

    const handleRepairGame = () => {
        window.electronAPI.invoke(IPC_CHANNELS.GAME.REPAIR);
    };

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
                    className="settings-page__back flex-shrink-0"
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
                
                <section className="settings-section">
                    <h2 className="text-xs font-bold tracking-[0.15em] text-white/40 uppercase mb-3 px-1">
                        Perfil
                    </h2>
                    <div className="settings-section__cards flex flex-col gap-2">
                        <SettingCard
                            title="Nome do Jogador"
                            description="Este nome será usado no jogo"
                            icon={<User size={18} className="text-cyan-400" />}
                            action={
                                <SettingInput
                                    size="sm"
                                    value={playerName}
                                    onChange={(e) => handlePlayerNameChange(e.target.value)}
                                    placeholder="Seu nome"
                                    className="w-40"
                                />
                            }
                        />
                    </div>
                </section>

                <section className="settings-section">
                    <h2 className="text-xs font-bold tracking-[0.15em] text-white/40 uppercase mb-3 px-1">
                        Jogo
                    </h2>
                    <div className="settings-section__cards flex flex-col gap-2">
                        <SettingCard
                            title="Canal do Jogo"
                            description="Selecionar versão instalada"
                            icon={<HardDrive size={18} className="text-amber-400" />}
                            action={
                                <SettingSelect
                                    size="sm"
                                    options={gameChannelOptions}
                                    value={gameChannel}
                                    onChange={setGameChannel}
                                    className="w-40"
                                />
                            }
                        />

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
                            description="Reinstalar arquivos do jogo"
                            icon={<HardDrive size={18} className="text-red-400" />}
                            action={
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRepairGame}
                                    className="h-8 px-3 gap-2"
                                >
                                    Reparar
                                </Button>
                            }
                        />
                    </div>
                </section>

                <section className="settings-section">
                    <h2 className="text-xs font-bold tracking-[0.15em] text-white/40 uppercase mb-3 px-1">
                        Performance
                    </h2>
                    <div className="settings-section__cards flex flex-col gap-2">
                        <SettingCard
                            title="Preferência de GPU"
                            description="Selecionar placa de vídeo para renderização"
                            icon={<Monitor size={18} className="text-purple-400" />}
                            action={
                                <SettingSelect
                                    size="sm"
                                    options={gpuOptions}
                                    value={gpuPreference}
                                    onChange={setGpuPreference}
                                    className="w-40"
                                />
                            }
                        />

                        <SettingCard
                            title="Ocultar Launcher ao jogar"
                            description="Minimiza o launcher enquanto o jogo está rodando"
                            icon={<Monitor size={18} className="text-blue-400" />}
                            action={
                                <SettingToggle
                                    size="md"
                                    checked={hideLauncher}
                                    onChange={setHideLauncher}
                                />
                            }
                        />
                    </div>
                </section>

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
                                    onChange={setCustomJava}
                                />
                            }
                        />

                        {customJava && (
                            <SettingCard
                                title="Caminho do Executável Java"
                                description="Localização do java.exe"
                                icon={<Cpu size={18} className="text-orange-400" />}
                                action={
                                    <div className="flex items-center gap-2">
                                        <SettingInput
                                            size="sm"
                                            value={javaPath}
                                            onChange={(e) => setJavaPath(e.target.value)}
                                            placeholder="C:\\Program Files\\Java\\..."
                                            className="w-64"
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
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
                                    onChange={setLanguage}
                                    className="w-40"
                                />
                            }
                        />

                        <SettingCard
                            title="Notificações"
                            description="Receber alertas sobre atualizações e eventos"
                            icon={<Bell size={18} className="text-pink-400" />}
                            action={
                                <SettingToggle
                                    size="md"
                                    checked={notifications}
                                    onChange={setNotifications}
                                />
                            }
                        />
                    </div>
                </section>

            </div>
        </motion.div>
    );
}
