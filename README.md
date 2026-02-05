# KLAUNCHER

**Enterprise-Grade Custom Launcher for Hytale**

KyamLauncher is a high-performance, security-focused launcher built to provide a seamless and secure experience for Hytale players. Engineered from the ground up using modern web technologies and strictly typed architecture, it ensures stability, observability, and modularity.

![Preview do Launcher](https://i.ibb.co/fVmjDkN6/image.png)

---

## Security Architecture

Security is the core foundation of KyamLauncher. We implement a **Zero-Trust** model between the Renderer (UI) and Main (System) processes.

### 1. Restricted IPC Communication
- **Allowlist Only**: The Renderer process cannot execute arbitrary Node.js commands. All communications occur through improved Inter-Process Communication (IPC) channels defined in `src/shared/constants/channels.ts`.
- **Context Isolation**: Enabled by default (`contextIsolation: true`). The preload script exposes a minimal, safe API surface to the window object.
- **Node Integration Disabled**: `nodeIntegration: false` prevents the UI from accessing low-level system resources directly, mitigating RCE (Remote Code Execution) risks.

### 2. Input Validation (Zod)
- All data entering the Main process is strictly validated using **Zod** schemas.
- Malformed payloads, invalid file paths, or unauthorized protocol calls are rejected immediately before reaching business logic.

### 3. Secure External Handling
- External links are opened via a dedicated handler that verifies protocols (`httpsOnly`) to prevent malicious URI scheme execution.

---

## Modularity & Architecture

The codebase follows a **Service-Oriented Architecture (SOA)** to ensure scalability and ease of maintenance.

### Core Structure
- **Main Process (`src/main`)**: Orchestrates system operations. Logic is decoupled into single-responsibility Services (e.g., `GameLauncher`, `DownloadManager`).
- **Renderer (`src/renderer`)**: Built with **React 19** and **Tailwind CSS v4**. Components are atomic and reusable, utilizing `class-variance-authority` for semantic styling.
- **Shared Layer**: Type definitions and constants shared between processes to ensure type safety across the bridge.

### State Management
- **Zustand**: Utilizes atomic stores for predictable state management (e.g., `useGameStore`, `useAuthStore`).
- **TanStack Query**: Manages server state, caching, and background invalidation for News and Mod lists.

---

## Key Features

### Mod Management System
- **Integrated Browser**: Discover and search for mods directly within the launcher.
- **One-Click Install**: Seamless installation of `.jar` mods.
- **Dependency Isolation**: Mods are managed in isolated directories to prevent conflicts.

### Smart Patcher (Butler)
- **Differential Updates**: Leverages `butler` technology to download only binary differences between versions, significantly reducing bandwidth usage and update times.
- **Resilient Downloads**: Implements retry logic and bandwidth management for unstable connections.

### Operational Observability
- **Structured Logging (Winston)**: All system events are logged with severity levels (`INFO`, `ERROR`, `WARN`) to local files for easier troubleshooting.
- **Telemetry Ready**: Architecture supports hooking into analytics providers for crash reporting (opt-in).

### Advanced Configuration
- **Java Auto-Detection**: Automatically finds valid Java installations.
- **Hardware Optimization**: Configurable RAM allocation and GPU preference selection.
- **Integrated News Feed**: Stay updated with the latest Hytale news directly from the home screen.
- **Automatic Self-Updates**: The launcher seamlessly updates itself in the background.

---

## Technology Stack

| Category | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Core** | Electron | v33.x | Cross-platform desktop runtime |
| **Language** | TypeScript | v5.x | Static typing and interfaces |
| **Frontend** | React | v19.x | User Interface library |
| **Styling** | Tailwind CSS | v4.x | Utility-first styling engine |
| **Build Tool** | Vite | v6.x | fast HMR and bundling |
| **Validation** | Zod | v3.x | Schema validation |
| **Networking** | Axios | v1.x | HTTP Client |

---

## Future Updates & Localization

> **Note**: This project is currently available only in **Portuguese (PT-BR)**.

Internationalization (i18n) support is planned for future releases, which will introduce support for English, Spanish, and other languages. Our architecture is already prepared for this transition.

---

## Build & Installation

### Prerequisites
- Node.js 20 or higher
- npm 10 or higher

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build
```bash
# Type check and build
npm run build
```

---

*© 2024 KyamTale Team. All rights reserved.*
