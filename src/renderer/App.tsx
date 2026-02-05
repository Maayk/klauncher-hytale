import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Header } from '@/renderer/components/Layout/Header';
import { Hero } from '@/renderer/components/Home/Hero';
import { NewsRail } from '@/renderer/components/Home/NewsRail';
import { ActionFooter } from '@/renderer/components/Home/ActionFooter';
import { ModsPage } from '@/renderer/pages/ModsPage';
import { SettingsPage } from '@/renderer/pages/SettingsPage';
import { useNavigationStore } from '@/renderer/store/useNavigationStore';

const backgroundImage = new URL('../assets/image/background.png', import.meta.url).href;

function App() {
    const currentPage = useNavigationStore((state) => state.currentPage);
    const modsPageKey = useNavigationStore((state) => state.modsPageKey);

    return (
        <div className="relative h-screen w-full overflow-hidden bg-[#0a0a0a] text-white selection:bg-blue-500/30 font-sans border border-white/5">

            {/* Background Layer */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-700"
                style={{ backgroundImage: `url(${backgroundImage})` }}
            />
            {/* Gradient Overlays for Readability */}
            <div className="absolute inset-0 z-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
            <div className="absolute inset-0 z-0 bg-gradient-to-t from-black/95 via-transparent to-black/50" />

            {/* Main Content Grid */}
            <div className="relative z-10 flex flex-col h-full max-h-full overflow-hidden">
                {/* Top Bar (Header + Controls) */}
                <Header />

                {/* Middle Section (Hero or Mods) */}
                <main className="flex flex-col flex-1 pl-6 pr-4 min-h-0 overflow-hidden">
                    <AnimatePresence mode="wait">
                        {currentPage === 'home' ? (
                            <motion.div
                                key="home"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="flex flex-col flex-1 justify-center min-h-0"
                            >
                                <Hero />
                            </motion.div>
                        ) : currentPage === 'mods' ? (
                            <ModsPage key={`mods-${modsPageKey}`} onBack={() => useNavigationStore.getState().navigateTo('home')} />
                        ) : (
                            <SettingsPage key="settings" onBack={() => useNavigationStore.getState().navigateTo('home')} />
                        )}
                    </AnimatePresence>
                </main>

                {/* Bottom Footer Section - Only show on home */}
                <AnimatePresence>
                    {currentPage === 'home' && (
                        <motion.div
                            key="footer"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            transition={{ duration: 0.3, delay: 0.1 }}
                            className="flex w-full items-end justify-between shrink-0 pl-6 pr-4 pb-3"
                        >
                            <NewsRail />
                            <ActionFooter />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default App;
