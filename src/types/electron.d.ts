import type { DesktopStorageApi } from "../storage/electronStorage";

declare global {
  interface Window {
    spitballDesktop?: {
      storage: DesktopStorageApi;
    };
  }
}

export {};
