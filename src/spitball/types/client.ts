export type ClientDiscovery = {
  product: "llama_pack";
  version: string;
  mode: "agent" | "controller" | string;
  capabilities: {
    openaiChatCompletions: boolean;
    streaming: boolean;
    localChatSessions: boolean;
    projectContext?: boolean;
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
  capabilities: { openaiChatCompletions: boolean; streaming: boolean; serverHistory: boolean; projectContext?: boolean };
  projectContext?: ProjectContextMetadata;
  models: ClientModel[];
};

export type ProjectContextAction = "summarize_project" | "summarize_path" | "refresh_context_item";

export type ProjectContextMetadata = {
  actions: ProjectContextAction[];
  endpoint: string;
  inputPolicy: "explicit_user_selected_inputs_and_saved_artifact_metadata_only";
};
