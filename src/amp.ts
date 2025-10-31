import { execute } from "@sourcegraph/amp-sdk";
import type { AmpOptions } from "@sourcegraph/amp-sdk";
import { Octokit } from "@octokit/rest";
import type { BranchFailure, AmpAnalysis } from "./types.js";
import { GitHubClient } from "./github.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class AmpClient {
  private octokit: Octokit;
  private github: GitHubClient;

  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
    this.github = new GitHubClient();
  }

  private loadTemplate(templateName: string): string {
    const templatePath = join(
      __dirname,
      "..",
      ".github",
      "templates",
      templateName,
    );
    return readFileSync(templatePath, "utf-8");
  }

  private renderTemplate(
    template: string,
    variables: Record<string, string>,
  ): string {
    return Object.entries(variables).reduce(
      (result, [key, value]) =>
        result.replace(new RegExp(`{{${key}}}`, "g"), value),
      template,
    );
  }

  async analyzeFailure(
    owner: string,
    repo: string,
    failure: BranchFailure,
    logs: string,
  ): Promise<AmpAnalysis> {
    const repoUrl = `https://github.com/${owner}/${repo}`;

    const prompt = `You are an expert at analyzing GitHub Actions failures. Please analyze the following failed workflow and provide insights.

Repository: ${repoUrl}
Branch: ${failure.branch}
Workflow: ${failure.workflowName}
Commit: ${failure.commitSha}
Run URL: ${failure.htmlUrl}

Failure Details:
${logs}

Please provide:
1. Root cause analysis - what specifically caused this failure?
2. Suggested fix - concrete steps to resolve the issue
3. Whether this appears to be a common issue that might affect other branches

Be concise but thorough in your analysis.`;

    return this.runAmpAnalysis(prompt, failure);
  }

  async triageOnBranch(
    owner: string,
    repo: string,
    failure: BranchFailure,
    logs: string,
  ): Promise<AmpAnalysis> {
    const repoUrl = `https://github.com/${owner}/${repo}`;
    const prCommentTemplate = this.loadTemplate("pr-comment-automated-fix.md");
    const prBranchFixTemplate = this.loadTemplate("pr-branch-fix.md");

    const prompt = `You are an expert at fixing GitHub Actions failures. Please triage the following failed workflow.

Repository: ${repoUrl}
Branch: ${failure.branch}
Workflow: ${failure.workflowName}
Commit: ${failure.commitSha}
Run URL: ${failure.htmlUrl}

Failure Details:
${logs}

Task:
1. Create a unique temporary working directory: mkdir -p $TEMP_WORK_DIR && cd $TEMP_WORK_DIR
2. Clone the repository to temporary location: git clone ${repoUrl} repo && cd repo
3. Checkout the target branch: git checkout ${failure.branch}
4. Analyze the failure and identify the root cause
5. Implement fixes to resolve the CI/CD issues
6. Run tests/builds to verify the fixes work
7. Commit the changes with a descriptive message like "fix: resolve CI/CD failure in ${failure.workflowName}"
8. Push the changes to the remote origin/${failure.branch}
9. Clean up the temporary directory when done: cd / && rm -rf $TEMP_WORK_DIR
10. Provide a summary of what was fixed

IMPORTANT REQUIREMENTS:
- Always work in a clean temporary directory using $TEMP_WORK_DIR environment variable
- Clone the repository fresh for each remediation to avoid conflicts
- After committing your changes, you MUST push them to the remote with: git push origin ${failure.branch}
- Clean up the temporary working directory after pushing changes: rm -rf $TEMP_WORK_DIR

Please be thorough in testing your fixes before committing and pushing.

---

PR/COMMENT TEMPLATES:

If an existing PR is found for this branch, use this template for the comment:
${prCommentTemplate}

If creating a new PR, use this template:
${prBranchFixTemplate}

Template variables available: {{ampThreadUrl}}, {{summary}}, {{branch}}`;

    const analysis = await this.runAmpRemediation(prompt, failure, owner, repo);
    await this.handlePRForBranch(owner, repo, failure, analysis);
    return analysis;
  }

  async triageOnMain(
    owner: string,
    repo: string,
    failure: BranchFailure,
    logs: string,
  ): Promise<AmpAnalysis> {
    const repoUrl = `https://github.com/${owner}/${repo}`;
    const fixBranchName = `fix/triage-${failure.branch}-${Date.now()}`;
    const prMainBranchFixTemplate = this.loadTemplate("pr-main-branch-fix.md");

    const prompt = `You are an expert at fixing GitHub Actions failures. Please triage the following failed workflow by creating a feature branch and PR.

Repository: ${repoUrl}
Source Branch: ${failure.branch}
Fix Branch: ${fixBranchName}
Workflow: ${failure.workflowName}
Commit: ${failure.commitSha}
Run URL: ${failure.htmlUrl}

Failure Details:
${logs}

Task:
1. Create a unique temporary working directory: mkdir -p $TEMP_WORK_DIR && cd $TEMP_WORK_DIR
2. Clone the repository to temporary location: git clone ${repoUrl} repo && cd repo
3. Checkout the source branch: git checkout ${failure.branch}
4. Create and checkout a new fix branch: git checkout -b ${fixBranchName}
5. Analyze the failure and identify the root cause
6. Implement fixes to resolve the CI/CD issues
7. Run tests/builds to verify the fixes work
8. Commit the changes with a descriptive message like "fix: resolve CI/CD failure in ${failure.workflowName}"
9. Push the fix branch to remote: git push origin ${fixBranchName}
10. Clean up the temporary directory when done: cd / && rm -rf $TEMP_WORK_DIR
11. Provide a summary of what was fixed

IMPORTANT REQUIREMENTS:
- Always work in a clean temporary directory using $TEMP_WORK_DIR environment variable
- Clone the repository fresh for each remediation to avoid conflicts
- Create a feature branch ${fixBranchName} for the fix, NOT the main branch
- After committing your changes, you MUST push them to the remote with: git push origin ${fixBranchName}
- Clean up the temporary working directory after pushing changes: rm -rf $TEMP_WORK_DIR

Please be thorough in testing your fixes before committing and pushing.

---

PR TEMPLATE:

When creating the PR, use this template:
${prMainBranchFixTemplate}

Template variables available: {{workflowName}}, {{targetBranch}}, {{ampThreadUrl}}, {{summary}}`;

    const analysis = await this.runAmpRemediation(
      prompt,
      failure,
      owner,
      repo,
      fixBranchName,
    );
    await this.createFixPR(
      owner,
      repo,
      fixBranchName,
      failure.branch,
      analysis,
      failure.workflowName,
    );
    return analysis;
  }

  private async runAmpAnalysis(
    prompt: string,
    failure: BranchFailure,
  ): Promise<AmpAnalysis> {
    try {
      const ampOptions: AmpOptions = {
        dangerouslyAllowAll: true,
        visibility: "private",
        logLevel: "info",
      };

      let rootCause = "";
      let sessionId = "";

      for await (const message of execute({ prompt, options: ampOptions })) {
        if (message.type === "system" && message.subtype === "init") {
          sessionId = message.session_id;
        } else if (message.type === "assistant") {
          if (message.message.content) {
            const textContent = message.message.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("");
            rootCause += textContent;
          }
        } else if (message.type === "result") {
          if (message.is_error) {
            throw new Error(`Amp analysis failed: ${message.error}`);
          }
          break;
        }
      }

      return {
        branch: failure.branch,
        rootCause: rootCause || "Analysis completed",
        suggestedFix: "See analysis above",
        ampThreadUrl: sessionId
          ? `https://ampcode.com/threads/${sessionId}`
          : "",
      };
    } catch (error) {
      console.error("Error in Amp analysis:", error);
      return {
        branch: failure.branch,
        rootCause: `Error during analysis: ${error}`,
        suggestedFix: "Unable to analyze - manual investigation required",
        ampThreadUrl: "",
      };
    }
  }

  private async runAmpRemediation(
    prompt: string,
    failure: BranchFailure,
    owner: string,
    repo: string,
    fixBranch?: string,
  ): Promise<AmpAnalysis> {
    try {
      const tempDir = `/tmp/triage-work-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const ampOptions: AmpOptions = {
        dangerouslyAllowAll: true,
        visibility: "private",
        logLevel: "info",
        env: {
          GITHUB_TOKEN: process.env.GITHUB_TOKEN || "",
          REPO_OWNER: owner,
          REPO_NAME: repo,
          BRANCH_NAME: failure.branch,
          FIX_BRANCH: fixBranch || failure.branch,
          WORKFLOW_RUN_ID: failure.workflowRunId.toString(),
          TEMP_WORK_DIR: tempDir,
        },
      };

      let remediationResult = "";
      let sessionId = "";

      for await (const message of execute({ prompt, options: ampOptions })) {
        if (message.type === "system" && message.subtype === "init") {
          sessionId = message.session_id;
        } else if (message.type === "assistant") {
          if (message.message.content) {
            const textContent = message.message.content
              .filter((c: any) => c.type === "text")
              .map((c: any) => c.text)
              .join("");
            if (textContent.trim()) {
              console.log("Amp:", textContent);
            }
          }
        } else if (message.type === "result") {
          if (message.is_error) {
            throw new Error(`Amp remediation failed: ${message.error}`);
          } else {
            remediationResult = message.result;
            break;
          }
        }
      }

      return {
        branch: failure.branch,
        rootCause: "Remediation completed",
        suggestedFix: remediationResult || "Fixes applied successfully",
        ampThreadUrl: sessionId
          ? `https://ampcode.com/threads/${sessionId}`
          : "",
      };
    } catch (error) {
      console.error("Error in Amp remediation:", error);
      return {
        branch: failure.branch,
        rootCause: `Remediation failed: ${error}`,
        suggestedFix: "Manual intervention required",
        ampThreadUrl: "",
      };
    }
  }

  private async handlePRForBranch(
    owner: string,
    repo: string,
    failure: BranchFailure,
    analysis: AmpAnalysis,
  ): Promise<void> {
    try {
      const existingPR = await this.github.hasOpenPR(
        owner,
        repo,
        failure.branch,
      );

      if (existingPR) {
        // Comment on existing PR
        const commentTemplate = this.loadTemplate(
          "pr-comment-automated-fix.md",
        );
        const commentBody = this.renderTemplate(commentTemplate, {
          ampThreadUrl: analysis.ampThreadUrl,
          summary: analysis.suggestedFix,
        });

        await this.octokit.issues.createComment({
          owner,
          repo,
          issue_number: existingPR,
          body: commentBody,
        });
        console.log(`Added comment to existing PR #${existingPR}`);
      } else {
        // No existing PR - fixes were pushed but no PR created
        console.log(
          `Fixes pushed to ${failure.branch}, but no PR created (no existing PR found)`,
        );
      }
    } catch (error) {
      console.error("Error handling PR for branch:", error);
    }
  }

  private async createFixPR(
    owner: string,
    repo: string,
    fixBranch: string,
    targetBranch: string,
    analysis: AmpAnalysis,
    workflowName: string,
  ): Promise<void> {
    try {
      const prTemplate = this.loadTemplate("pr-main-branch-fix.md");
      const prBody = this.renderTemplate(prTemplate, {
        workflowName,
        targetBranch,
        ampThreadUrl: analysis.ampThreadUrl,
        summary: analysis.suggestedFix,
      });

      const prResponse = await this.octokit.pulls.create({
        owner,
        repo,
        title: `Fix CI/CD failures in ${workflowName} (${targetBranch})`,
        head: fixBranch,
        base: targetBranch,
        body: prBody,
      });

      console.log(
        `Created fix PR #${prResponse.data.number}: ${prResponse.data.html_url}`,
      );
    } catch (error) {
      console.error("Error creating fix PR:", error);
    }
  }
}

