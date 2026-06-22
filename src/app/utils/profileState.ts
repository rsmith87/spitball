import type { ClientModel } from "../../spitball/types";
import type { ConnectionProfile } from "../../storage/types";
import { clampAgentToolMaxIterations, clampMaxTokens, type ConnectionStatus } from "./settings";

type PersistedProfileLike = Pick<
  ConnectionProfile,
  "backendUrl" | "backendMode" | "defaultModel" | "requestType" | "maxTokens" | "agentToolMaxIterations" | "cachedModels" | "lastConnectionError" | "apiKey" | "validatedAt"
>;

export type HydratedProfileState = {
  backendUrl: string;
  backendMode: string;
  selectedModel: string;
  requestType: string | null;
  maxTokens: number;
  maxTokensInput: string;
  agentToolMaxIterations: number;
  agentToolMaxIterationsInput: string;
  models: ClientModel[];
  setupError: string;
  apiKey: string;
  rememberKey: boolean;
};

export function hydrateProfileState(
  profile: PersistedProfileLike,
  defaultMaxTokens: number,
  defaultAgentToolMaxIterations: number,
): HydratedProfileState {
  const maxTokens = clampMaxTokens(profile.maxTokens || defaultMaxTokens);
  const agentToolMaxIterations = clampAgentToolMaxIterations(profile.agentToolMaxIterations || defaultAgentToolMaxIterations);
  return {
    backendUrl: profile.backendUrl,
    backendMode: profile.backendMode,
    selectedModel: profile.defaultModel,
    requestType: profile.requestType,
    maxTokens,
    maxTokensInput: String(maxTokens),
    agentToolMaxIterations,
    agentToolMaxIterationsInput: String(agentToolMaxIterations),
    models: profile.cachedModels || [],
    setupError: profile.lastConnectionError || "",
    apiKey: profile.apiKey || "",
    rememberKey: Boolean(profile.apiKey),
  };
}

export function getInitialConnectionStatus(
  profile: Pick<PersistedProfileLike, "validatedAt" | "apiKey" | "defaultModel">,
): ConnectionStatus {
  return profile.validatedAt && profile.apiKey && profile.defaultModel ? "ready" : "loaded";
}
