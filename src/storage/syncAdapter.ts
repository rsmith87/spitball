import type { Conversation } from "./types";

export type SyncAdapter = {
  enabled: boolean;
  pushConversation: (conversation: Conversation) => Promise<void>;
};

export const noSyncAdapter: SyncAdapter = {
  enabled: false,
  async pushConversation() {
    return undefined;
  },
};
