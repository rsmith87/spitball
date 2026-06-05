export type AuthMode = "external_api_key" | "neuraxis_business";

export type AuthState = {
  mode: AuthMode;
  apiKey?: string;
  businessToken?: string;
};

export type ClientDiscovery = {
  product: "neuraxis";
  version: string;
  mode: "agent" | "controller" | string;
  capabilities: {
    openaiChatCompletions: boolean;
    streaming: boolean;
    localChatSessions: boolean;
    businessPlugin: boolean;
  };
  auth: {
    methods: string[];
    sessionHeader: string;
    apiKeyHeader: string;
  };
  endpoints: Record<string, string>;
};

export type ClientModel = {
  id: string;
  object: "model";
  owned_by: string;
  metadata: {
    display_label: string;
    request_types: string[];
    default_request_type: string | null;
    context_identity: string;
    model_family: string;
    context_profile: string | null;
    capabilities: {
      streaming: boolean;
      json_schema: boolean;
      grammar: boolean;
      vision: boolean;
    };
  };
};

export type ClientSession = {
  auth: { method: string; role: string; username: string };
  capabilities: { openaiChatCompletions: boolean; streaming: boolean; serverHistory: boolean };
  models: ClientModel[];
};

export type ChatDiagnostic = {
  ok: boolean;
  model: string;
  requestType: string | null;
  checks: {
    auth: boolean;
    modelUsable: boolean;
    routeResolved: boolean;
    chat: boolean;
    streaming: boolean | null;
  };
  route: { node?: string; model?: string; route: string } | null;
  error: { status: number; detail: string } | null;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
