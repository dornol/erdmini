import { env } from '$env/dynamic/public';
import type { StorageProvider } from './types';

export type { StorageProvider, CanvasData } from './types';

export async function getStorageProvider(): Promise<StorageProvider> {
  if (env.PUBLIC_STORAGE_MODE === 'server') {
    const { ServerStorageProvider } = await import('./server-storage-provider');
    return new ServerStorageProvider();
  }
  const { LocalStorageProvider } = await import('./local-storage-provider');
  return new LocalStorageProvider();
}
