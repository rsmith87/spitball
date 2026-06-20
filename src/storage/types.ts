import type { AuthMode, ChatMessage, ClientModel } from "../spitball/types";

export type ConnectionProfile = {
  id: string;
  name: string;
  backendUrl: string;
  backendMode: string;
  authMode: AuthMode;
  apiKey?: string;
  defaultModel: string;
  requestType: string | null;
  maxTokens?: number;
  agentToolMaxIterations?: number;
  validatedAt?: string;
  lastConnectionError?: string;
  cachedModels?: ClientModel[];
};

export type Conversation = {
  id: string;
  title: string;
  model: string;
  requestType: string | null;
  threadId?: string;
  taxonomyItemId?: string;
  messages: ChatMessage[];
  updatedAt: string;
};

export type TaxonomyItem = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  root: string;
  createdAt: string;
  updatedAt: string;
};
