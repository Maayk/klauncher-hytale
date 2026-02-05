export const IPC_CHANNELS = {
    WINDOW: {
        MINIMIZE: 'window:minimize',
        CLOSE: 'window:close',
        MAXIMIZE: 'window:maximize',
        RESTORE: 'window:restore'
    },
    GAME: {
        LAUNCH: 'game:launch',
        KILL: 'game:kill',
        STATUS: 'game:status',
        PROGRESS: 'game:progress',
        ERROR: 'game:error',
        SUCCESS: 'game:success',
        PATCH_PROGRESS: 'game:patch-progress',
        STARTED: 'game:started',
        STOPPED: 'game:stopped',
        IS_RUNNING: 'game:is-running',
        REPAIR: 'game:repair',
        OPEN_LOCATION: 'game:open-location',
        GET_GPU_INFO: 'game:get-gpu-info',
        GET_VERSIONS: 'game:get-versions'
    },
    PATCHER: {
        START: 'patcher:start',
        CANCEL: 'patcher:cancel',
        STATUS: 'patcher:status',
        PROGRESS: 'patcher:progress',
        ERROR: 'patcher:error',
        COMPLETE: 'patcher:complete'
    },
    SETTINGS: {
        GET: 'settings:get',
        SET: 'settings:set',
        UPDATE: 'settings:update',
        RESET: 'settings:reset'
    },
    NEWS: {
        GET: 'news:get'
    },
    VERSION: {
        GET: 'version:get',
        CHECK: 'version:check'
    },
    MODS: {
        SEARCH: 'mods:search',
        GET_DESCRIPTION: 'mods:get-description',
        LIST_INSTALLED: 'mods:list-installed',
        INSTALL: 'mods:install',
        TOGGLE: 'mods:toggle',
        DELETE: 'mods:delete'
    },
    JAVA: {
        GET_VERSION: 'java:get-version',
        GET_PATH: 'java:get-path',
        SELECT_PATH: 'java:select-path',
        OPEN_LOCATION: 'java:open-location',
        AUTO_INSTALL: 'java:auto-install'
    },
    SHELL: {
        OPEN_EXTERNAL: 'shell:open-external',
        OPEN_PATH: 'shell:open-path'
    },
    UPDATES: {
        CHECK: 'updates:check',
        GET_CONFIG: 'updates:get-config',
        GET_HYTALE_CONFIG: 'updates:get-hytale-config'
    }
} as const;

export type IPCChannelValue = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
export type IPCChannelName = IPCChannelValue[keyof IPCChannelValue];
