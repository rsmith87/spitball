export type AuthMode = "external_api_key" | "llama_pack_business";

export type AuthState = {
  mode: AuthMode;
  apiKey?: string;
  businessToken?: string;
};
