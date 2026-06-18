export type AuthMode = "external_api_key" | "llama_pack_business";

export type AuthState = {
  mode: AuthMode;
  apiKey?: string;
  businessToken?: string;
};

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

export type ProjectContextProject = {
  name: string;
  root: string | null;
};

export type ProjectContextArtifact = {
  id: string;
  kind: string;
  path: string | null;
  title: string | null;
  metadata: Record<string, string | number | boolean | null>;
};

export type ProjectContextSelectedPath = {
  path: string;
  content?: string;
  artifact_metadata?: Record<string, string | number | boolean | null>;
};

export type ProjectContextRequest = {
  project: ProjectContextProject | null;
  selected_paths: ProjectContextSelectedPath[];
  artifacts: ProjectContextArtifact[];
  focused_path: string | null;
};

export type ProjectContextSummaryPath = {
  path: string;
  characters?: number;
  artifactMetadata?: Record<string, string | number | boolean | null>;
};

export type ProjectContextResponse = {
  action: ProjectContextAction;
  policy: "explicit_user_selected_inputs_and_saved_artifact_metadata_only";
  summary: {
    project?: ProjectContextProject | null;
    selectedPathCount?: number;
    artifactCount?: number;
    path?: ProjectContextSummaryPath;
    paths?: ProjectContextSummaryPath[];
    artifacts?: ProjectContextArtifact[];
  };
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

export type ContextBudget = {
  model: string;
  context_window_tokens: number;
  prompt_tokens_estimated: number;
  reserved_completion_tokens: number;
  available_input_tokens: number;
  remaining_context_tokens: number;
  usage_ratio: number;
  status: "comfortable" | "getting_full" | "near_limit" | "too_large";
  estimation_method: string;
  precision: string;
  warnings: string[];
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
