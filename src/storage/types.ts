import type { AuthMode, ChatMessage } from "../spitball/types";

export type ConnectionProfile = {
  id: string;
  name: string;
  backendUrl: string;
  backendMode: string;
  authMode: AuthMode;
  apiKey?: string;
  defaultModel: string;
  requestType: string | null;
};

export type Conversation = {
  id: string;
  title: string;
  model: string;
  requestType: string | null;
  messages: ChatMessage[];
  updatedAt: string;
};

export type Project = {
  id: string;
  name: string;
  root: string;
  createdAt: string;
  updatedAt: string;
};
