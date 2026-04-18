/**
 * Thin wrapper around tauri-plugin-updater.
 * Check for updates, download, and install.
 */
import { logger } from '../utils/logger';

/** Minimal shape of tauri-plugin-updater's Update object we use. */
type Update = {
  version: string;
  body?: string;
  date?: string;
  available?: boolean;
  download: () => Promise<void>;
  install: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  close: () => Promise<void>;
};

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  releaseDate?: string;
  update?: Update;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const { getVersion } = await import('@tauri-apps/api/app');
    const currentVersion = await getVersion();
    const update = await check();
    if (!update) {
      return { available: false, currentVersion };
    }
    return {
      available: true,
      currentVersion,
      latestVersion: update.version,
      releaseNotes: update.body,
      releaseDate: update.date,
      update,
    };
  } catch (err) {
    logger.error('[cortx] Update check failed:', err);
    throw err;
  }
}

export async function downloadAndInstall(
  update: Update,
  onProgress?: (downloaded: number, total?: number) => void,
): Promise<void> {
  let downloaded = 0;
  let contentLength: number | undefined;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        contentLength = event.data.contentLength;
        break;
      case 'Progress':
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, contentLength);
        break;
      case 'Finished':
        break;
    }
  });
}

export async function relaunchApp(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}
