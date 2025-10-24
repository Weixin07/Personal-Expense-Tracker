declare module 'react-native-saf-x' {
  export type DirectoryPermission = {
    granted: boolean;
    uri?: string;
    error?: string;
  };

  export const StorageAccessFramework: {
    requestDirectoryPermissions(initialUri?: string | null): Promise<DirectoryPermission | null>;
    persistAccessPermissions(uri: string): Promise<void>;
    persistPermissions?(uri: string): Promise<void>;
    takePersistableUriPermission?(uri: string): Promise<void>;
    createFile(directoryUri: string, displayName: string, mimeType: string): Promise<string>;
    writeFile(uri: string, data: string, encoding?: 'utf8' | 'base64'): Promise<void>;
    readFile(uri: string, encoding?: 'utf8' | 'base64'): Promise<string>;
    deleteFile(uri: string): Promise<void>;
  };
}
