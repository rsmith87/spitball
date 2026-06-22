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
  action: "summarize_project" | "summarize_path" | "refresh_context_item";
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
