import { getClientDiscovery } from "../../spitball/discovery";
import type { Dispatch, SetStateAction } from "react";
import { runChatDiagnostics } from "../../spitball/diagnostics";
import { listModels } from "../../spitball/models";
import { getClientSession } from "../../spitball/session";
import type { AuthState, ChatDiagnostic, ClientDiscovery, ClientModel, ClientSession } from "../../spitball/types";
import { listBackendProjects } from "../../spitball/projects";
import { saveProfile, saveProject } from "../../storage";
import type { Project } from "../../storage/types";
import { mergeProjects } from "../utils/chatState";
import type { ConnectionStatus } from "../utils/settings";

type UseConnectionSetupArgs = {
  backendUrl: string;
  selectedModel: string;
  requestType: string | null;
  maxTokens: number;
  agentToolMaxIterations: number;
  auth: AuthState | null;
  rememberKey: boolean;
  discovery: ClientDiscovery | null;
  models: ClientModel[];
  connectionStatus: ConnectionStatus;
  setDiscovery: Dispatch<SetStateAction<ClientDiscovery | null>>;
  setBackendMode: Dispatch<SetStateAction<string>>;
  setSession: Dispatch<SetStateAction<ClientSession | null>>;
  setModels: Dispatch<SetStateAction<ClientModel[]>>;
  setRequestType: Dispatch<SetStateAction<string | null>>;
  setConnectionStatus: Dispatch<SetStateAction<ConnectionStatus>>;
  setSetupError: Dispatch<SetStateAction<string>>;
  setDiagnostic: Dispatch<SetStateAction<ChatDiagnostic | null>>;
  setIsChecking: Dispatch<SetStateAction<boolean>>;
  setIsRunningDiagnostic: Dispatch<SetStateAction<boolean>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setSelectedProjectId: Dispatch<SetStateAction<string>>;
};

export function useConnectionSetup(args: UseConnectionSetupArgs): {
  markConnectionEdited: () => void;
  runSetup: () => Promise<void>;
  runModelDiagnostic: () => Promise<void>;
} {
  function markConnectionEdited() {
    if (args.connectionStatus !== "missing") args.setConnectionStatus("loaded");
    args.setSetupError("");
    args.setDiagnostic(null);
  }

  async function refreshBackendProjects(currentBackendUrl: string, currentAuth: AuthState) {
    const backendProjects = await listBackendProjects(currentBackendUrl, currentAuth);
    await Promise.all(backendProjects.map((project) => saveProject(project)));
    args.setProjects((items) => mergeProjects(backendProjects, items));
    if (backendProjects[0]) args.setSelectedProjectId((current) => current || backendProjects[0].id);
  }

  async function runSetup() {
    args.setIsChecking(true);
    args.setConnectionStatus("checking");
    args.setSetupError("");
    args.setDiagnostic(null);
    try {
      const discovered = await getClientDiscovery(args.backendUrl);
      args.setDiscovery(discovered);
      args.setBackendMode(discovered.mode);
      if (!args.auth) throw new Error("Enter an external app key before continuing.");
      const currentSession = await getClientSession(args.backendUrl, args.auth);
      const safeModels = currentSession.models.length ? currentSession.models : await listModels(args.backendUrl, args.auth);
      const selectedSafeModel = safeModels.find((item) => item.id === args.selectedModel);
      const selectedRequestType = selectedSafeModel?.metadata.request_types.includes(args.requestType || "")
        ? args.requestType
        : selectedSafeModel
          ? selectedSafeModel.metadata.default_request_type || selectedSafeModel.metadata.request_types[0] || null
          : args.requestType;
      args.setSession(currentSession);
      args.setModels(safeModels);
      args.setRequestType(selectedRequestType);
      await saveProfile({
        id: "default",
        name: discovered.mode === "controller" ? "Controller backend" : "Agent backend",
        backendUrl: args.backendUrl,
        backendMode: discovered.mode,
        authMode: "external_api_key",
        apiKey: args.rememberKey ? args.auth.apiKey : undefined,
        defaultModel: args.selectedModel,
        requestType: selectedRequestType,
        maxTokens: args.maxTokens,
        agentToolMaxIterations: args.agentToolMaxIterations,
        validatedAt: new Date().toISOString(),
        cachedModels: safeModels,
      });
      args.setConnectionStatus("ready");
      if (discovered.mode === "controller") {
        void refreshBackendProjects(args.backendUrl, args.auth).catch((error) => {
          args.setSetupError(error instanceof Error ? error.message : "Project sync failed.");
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Setup failed";
      args.setSetupError(message);
      args.setConnectionStatus("failed");
      await saveProfile({
        id: "default",
        name: "Saved backend",
        backendUrl: args.backendUrl,
        backendMode: args.discovery?.mode || "unknown",
        authMode: "external_api_key",
        apiKey: args.rememberKey ? args.auth?.apiKey : undefined,
        defaultModel: args.selectedModel,
        requestType: args.requestType,
        maxTokens: args.maxTokens,
        agentToolMaxIterations: args.agentToolMaxIterations,
        lastConnectionError: message,
        cachedModels: args.models,
      });
    } finally {
      args.setIsChecking(false);
    }
  }

  async function runModelDiagnostic() {
    if (!args.auth) {
      args.setSetupError("Cannot run model diagnostic: enter an external app key first.");
      return;
    }
    if (!args.selectedModel) {
      args.setSetupError("Cannot run model diagnostic: select a model first.");
      return;
    }
    args.setIsRunningDiagnostic(true);
    args.setSetupError("");
    try {
      const result = await runChatDiagnostics(args.backendUrl, args.auth, {
        model: args.selectedModel,
        request_type: args.requestType,
        stream: true,
      });
      args.setDiagnostic(result);
    } catch (error) {
      args.setSetupError(error instanceof Error ? error.message : "Model diagnostic failed.");
    } finally {
      args.setIsRunningDiagnostic(false);
    }
  }

  return { markConnectionEdited, runSetup, runModelDiagnostic };
}
