import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/channels';

const VALID_SEND_CHANNELS = [
    IPC_CHANNELS.GAME.LAUNCH,
    IPC_CHANNELS.GAME.KILL,
    IPC_CHANNELS.PATCHER.START,
    IPC_CHANNELS.PATCHER.CANCEL,
    IPC_CHANNELS.WINDOW.MINIMIZE,
    IPC_CHANNELS.WINDOW.MAXIMIZE,
    IPC_CHANNELS.WINDOW.CLOSE,
    IPC_CHANNELS.SHELL.OPEN_EXTERNAL,
    IPC_CHANNELS.SHELL.OPEN_PATH
];

const VALID_INVOKE_CHANNELS = [
    IPC_CHANNELS.SETTINGS.GET,
    IPC_CHANNELS.SETTINGS.SET,
    IPC_CHANNELS.SETTINGS.UPDATE,
    IPC_CHANNELS.SETTINGS.RESET,
    IPC_CHANNELS.NEWS.GET,
    IPC_CHANNELS.MODS.SEARCH,
    IPC_CHANNELS.MODS.GET_DESCRIPTION,
    IPC_CHANNELS.MODS.LIST_INSTALLED,
    IPC_CHANNELS.MODS.INSTALL,
    IPC_CHANNELS.MODS.TOGGLE,
    IPC_CHANNELS.MODS.DELETE,
    IPC_CHANNELS.JAVA.GET_VERSION,
    IPC_CHANNELS.JAVA.SELECT_PATH,
    IPC_CHANNELS.JAVA.AUTO_INSTALL,
    IPC_CHANNELS.JAVA.GET_PATH,
    IPC_CHANNELS.JAVA.OPEN_LOCATION,
    IPC_CHANNELS.GAME.LAUNCH,
    IPC_CHANNELS.GAME.STATUS,
    IPC_CHANNELS.GAME.KILL,
    IPC_CHANNELS.GAME.IS_RUNNING,
    IPC_CHANNELS.GAME.REPAIR,
    IPC_CHANNELS.GAME.OPEN_LOCATION,
    IPC_CHANNELS.GAME.GET_GPU_INFO,
    IPC_CHANNELS.VERSION.GET,
    IPC_CHANNELS.VERSION.CHECK,
    IPC_CHANNELS.UPDATES.CHECK,
    IPC_CHANNELS.UPDATES.GET_CONFIG,
    IPC_CHANNELS.UPDATES.GET_HYTALE_CONFIG,
    // Window Controls
    IPC_CHANNELS.WINDOW.MINIMIZE,
    IPC_CHANNELS.WINDOW.MAXIMIZE,
    IPC_CHANNELS.WINDOW.CLOSE
];

const VALID_ON_CHANNELS = [
    IPC_CHANNELS.GAME.PROGRESS,
    IPC_CHANNELS.GAME.ERROR,
    IPC_CHANNELS.GAME.SUCCESS,
    IPC_CHANNELS.GAME.PATCH_PROGRESS,
    IPC_CHANNELS.GAME.STARTED,
    IPC_CHANNELS.GAME.STOPPED,
    IPC_CHANNELS.PATCHER.PROGRESS,
    IPC_CHANNELS.PATCHER.ERROR,
    IPC_CHANNELS.PATCHER.COMPLETE,
    IPC_CHANNELS.PATCHER.STATUS
];

interface ElectronAPIType {
    send: (channel: string, ...args: unknown[]) => void;
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => () => void;
    once: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => void;
}

const api: ElectronAPIType = {
    send: (channel: string, ...args: unknown[]) => {
        if (VALID_SEND_CHANNELS.includes(channel as typeof VALID_SEND_CHANNELS[number])) {
            ipcRenderer.send(channel, ...args);
        }
    },

    invoke: (channel: string, ...args: unknown[]) => {
        if (VALID_INVOKE_CHANNELS.includes(channel as typeof VALID_INVOKE_CHANNELS[number])) {
            return ipcRenderer.invoke(channel, ...args);
        }
        return Promise.reject(new Error(`Invalid invoke channel: ${channel}`));
    },

    on: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => {
        if (VALID_ON_CHANNELS.includes(channel as typeof VALID_ON_CHANNELS[number])) {
            const wrapper = (event: IpcRendererEvent, ...args: unknown[]) => {
                listener(event, ...args);
            };
            ipcRenderer.on(channel, wrapper);
            return () => ipcRenderer.removeListener(channel, wrapper);
        }
        return () => { };
    },

    once: (channel: string, listener: (event: IpcRendererEvent, ...args: unknown[]) => void) => {
        if (VALID_ON_CHANNELS.includes(channel as typeof VALID_ON_CHANNELS[number])) {
            const wrapper = (event: IpcRendererEvent, ...args: unknown[]) => {
                listener(event, ...args);
            };
            ipcRenderer.once(channel, wrapper);
        }
    }
};

contextBridge.exposeInMainWorld('electronAPI', api);

export type ElectronAPI = ElectronAPIType;
