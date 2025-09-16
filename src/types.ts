export interface BranchFailure {
  branch: string;
  commitSha: string;
  workflowRunId: number;
  workflowName: string;
  conclusion: string;
  htmlUrl: string;
  createdAt: string;
  logsUrl?: string;
}

export interface AmpAnalysis {
  branch: string;
  rootCause: string;
  suggestedFix: string;
  ampThreadUrl: string;
}

export interface TriageOptions {
  owner: string;
  repo: string;
  mode: 'list' | 'analyze' | 'triage';
  branches: string[];
}
