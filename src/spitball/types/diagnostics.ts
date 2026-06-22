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
