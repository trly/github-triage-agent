import { Octokit } from '@octokit/rest';
import type { BranchFailure } from './types.js';

export class GitHubClient {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    try {
      const repository = await this.octokit.rest.repos.get({
        owner,
        repo
      });
      return repository.data.default_branch;
    } catch (error) {
      console.error('Error getting default branch, falling back to "main":', error);
      return 'main';
    }
  }

  async listBranches(owner: string, repo: string, filters?: string[]): Promise<string[]> {
    try {
      const branches = await this.octokit.paginate(
        this.octokit.rest.repos.listBranches,
        { owner, repo, per_page: 100 }
      );
      
      const branchNames = branches.map(b => b.name);
      
      if (!filters || filters.length === 0) {
        // Default to main/master if no filters
        return branchNames.filter(name => name === 'main' || name === 'master');
      }
      
      // Special case: if filters contains just '*', return all branches
      if (filters.length === 1 && filters[0] === '*') {
        return branchNames;
      }
      
      return branchNames.filter(name => 
        filters.some(filter => 
          filter === name || 
          (filter.includes('*') && this.matchesWildcard(name, filter))
        )
      );
    } catch (error) {
      console.error('Error listing branches:', error);
      return [];
    }
  }

  private matchesWildcard(str: string, pattern: string): boolean {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(str);
  }

  async getLatestFailedRun(owner: string, repo: string, branch: string): Promise<BranchFailure | null> {
    try {
      // Get the most recent completed run (regardless of success/failure)
      const runs = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch,
        status: 'completed',
        per_page: 1 // Just get the most recent one
      });

      if (runs.data.workflow_runs.length === 0) {
        return null;
      }

      const latestRun = runs.data.workflow_runs[0];

      // Only return if the MOST RECENT run failed
      // If the most recent run succeeded, the branch doesn't need triage
      if (latestRun.conclusion !== 'failure' && 
          latestRun.conclusion !== 'timed_out' &&
          latestRun.conclusion !== 'action_required') {
        return null;
      }

      return {
        branch,
        commitSha: latestRun.head_sha,
        workflowRunId: latestRun.id,
        workflowName: latestRun.name ?? 'Unknown',
        conclusion: latestRun.conclusion ?? 'failure',
        htmlUrl: latestRun.html_url,
        createdAt: latestRun.created_at,
      };
    } catch (error) {
      console.error(`Error getting latest failed run for ${branch}:`, error);
      return null;
    }
  }

  async getWorkflowLogs(owner: string, repo: string, runId: number): Promise<string> {
    try {
      const jobs = await this.octokit.rest.actions.listJobsForWorkflowRun({
        owner,
        repo,
        run_id: runId
      });

      let allLogs = '';
      
      for (const job of jobs.data.jobs) {
        if (job.conclusion === 'failure') {
          try {
            const logs = await this.octokit.rest.actions.downloadJobLogsForWorkflowRun({
              owner,
              repo,
              job_id: job.id
            });
            
            allLogs += `\n=== Job: ${job.name} ===\n`;
            allLogs += logs.data;
          } catch (logError) {
            console.error(`Could not download logs for job ${job.id}:`, logError);
            allLogs += `\n=== Job: ${job.name} ===\nLogs unavailable\n`;
          }
        }
      }

      return allLogs;
    } catch (error) {
      console.error('Error getting workflow logs:', error);
      return 'Could not retrieve logs';
    }
  }

  async hasOpenPR(owner: string, repo: string, branch: string): Promise<number | null> {
    try {
      const prs = await this.octokit.rest.pulls.list({
        owner,
        repo,
        head: `${owner}:${branch}`,
        state: 'open'
      });

      return prs.data.length > 0 ? prs.data[0].number : null;
    } catch (error) {
      console.error('Error checking for open PRs:', error);
      return null;
    }
  }
}
