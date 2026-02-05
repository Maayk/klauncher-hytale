import React from 'react';

export function Hero() {
    return (
        <section className="flex h-full flex-col justify-start pt-12 pb-8 relative">
            <div className="z-10 max-w-3xl space-y-3">
                {/* Main Title - Always fixed */}
                <h1 className="text-8xl leading-none font-black tracking-tighter text-white drop-shadow-2xl">
                    HYTALE
                </h1>

                {/* Static subtitle */}
                <p className="text-xl font-light text-white/90 leading-tight max-w-lg drop-shadow-lg">
                    The moment has arrived, Hytale is releasing into Early Access today!
                </p>
            </div>
        </section>
    );
}
