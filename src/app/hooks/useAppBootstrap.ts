import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getProfile, listConversations, listProjects, listTaxonomyItems } from "../../storage";
import type { Conversation, Project, TaxonomyItem } from "../../storage/types";
import { DEFAULT_AGENT_TOOL_MAX_ITERATIONS, DEFAULT_MAX_TOKENS, type ConnectionStatus } from "../utils/settings";
import { getInitialConnectionStatus, hydrateProfileState } from "../utils/profileState";
import type { ClientModel } from "../../spitball/types";

type UseAppBootstrapArgs = {
  setConversations: Dispatch<SetStateAction<Conversation[]>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setTaxonomyItems: Dispatch<SetStateAction<TaxonomyItem[]>>;
  setActiveId: Dispatch<SetStateAction<string>>;
  setSelectedProjectId: Dispatch<SetStateAction<string>>;
  setBackendUrl: Dispatch<SetStateAction<string>>;
  setBackendMode: Dispatch<SetStateAction<string>>;
  setSelectedModel: Dispatch<SetStateAction<string>>;
  setRequestType: Dispatch<SetStateAction<string | null>>;
  setMaxTokens: Dispatch<SetStateAction<number>>;
  setMaxTokensInput: Dispatch<SetStateAction<string>>;
  setAgentToolMaxIterations: Dispatch<SetStateAction<number>>;
  setAgentToolMaxIterationsInput: Dispatch<SetStateAction<string>>;
  setModels: Dispatch<SetStateAction<ClientModel[]>>;
  setSetupError: Dispatch<SetStateAction<string>>;
  setApiKey: Dispatch<SetStateAction<string>>;
  setRememberKey: Dispatch<SetStateAction<boolean>>;
  setConnectionStatus: Dispatch<SetStateAction<ConnectionStatus>>;
};

export function useAppBootstrap(args: UseAppBootstrapArgs): void {
  useEffect(() => {
    void listConversations().then((items) => {
      args.setConversations(items);
      if (items[0]) args.setActiveId(items[0].id);
    });
    void listProjects().then((items) => {
      args.setProjects(items);
      if (items[0]) args.setSelectedProjectId(items[0].id);
    });
    void listTaxonomyItems().then((items) => {
      args.setTaxonomyItems(items);
    });
    void getProfile("default").then((profile) => {
      if (!profile) return;
      const hydrated = hydrateProfileState(profile, DEFAULT_MAX_TOKENS, DEFAULT_AGENT_TOOL_MAX_ITERATIONS);
      args.setBackendUrl(hydrated.backendUrl);
      args.setBackendMode(hydrated.backendMode);
      args.setSelectedModel(hydrated.selectedModel);
      args.setRequestType(hydrated.requestType);
      args.setMaxTokens(hydrated.maxTokens);
      args.setMaxTokensInput(hydrated.maxTokensInput);
      args.setAgentToolMaxIterations(hydrated.agentToolMaxIterations);
      args.setAgentToolMaxIterationsInput(hydrated.agentToolMaxIterationsInput);
      args.setModels(hydrated.models);
      args.setSetupError(hydrated.setupError);
      args.setApiKey(hydrated.apiKey);
      args.setRememberKey(hydrated.rememberKey);
      args.setConnectionStatus(getInitialConnectionStatus(profile));
    });
  }, []);
}
