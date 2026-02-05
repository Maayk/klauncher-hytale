declare module 'node-stream-zip' {
    export interface StreamZipOptions {
        file: string;
        storeEntries?: boolean;
    }

    export class async {
        constructor(options: StreamZipOptions);
        extract(entry: string | null, outPath: string): Promise<number>;
        close(): Promise<void>;
        entries(): Promise<any>;
        entry(name: string): Promise<any>;
    }
}
