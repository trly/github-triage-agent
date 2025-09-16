#!/usr/bin/env node

import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Test script to demonstrate the remediation functionality
 * This shows what would be sent to Amp without actually executing it
 */

class TestRemediation {
  private octokit: Octokit;

  constructor() {
    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });
  }

  async dryRunRemediation(owner: string, repo: string) {
    try {
      console.log('🧪 Testing Amp Remediation Functionality (Dry Run)\n');

      // Get dependency PRs
      const response = await this.octokit.rest.pulls.list({
        owner,
        repo,
        state: 'open',
      });
      
      const dependencyPRs = response.data.filter(pr => 
        pr.labels.some(label => label.name === 'dependencies')
      );

      if (dependencyPRs.length === 0) {
        console.log('No dependency PRs found.');
        return;
      }

      // Take first PR for testing
      const testPR = dependencyPRs[0];
      
      console.log(`📋 Testing with PR #${testPR.number}: ${testPR.title}`);

      // Get failed actions (if any)
      const failedActions = await this.octokit.rest.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        head_sha: testPR.head.sha,
        status: 'failure',
        per_page: 10,
      });

      console.log(`\nFound ${failedActions.data.workflow_runs.length} failed action(s)`);

      // Show what would be sent to Amp
      const repoUrl = `https://github.com/${owner}/${repo}`;
      const prNumber = testPR.number;
      const prTitle = testPR.title;
      const prBranch = testPR.head.ref;
      
      const mockPrompt = `
I need you to help triage a dependency update PR that has failed CI/CD checks.

Repository: ${repoUrl}
PR: #${prNumber} - ${prTitle}
Branch: ${prBranch}
PR URL: ${testPR.html_url}

Task:
1. Clone the repository: ${repoUrl}
2. Checkout the PR branch: ${prBranch}
3. Review the failed CI/CD actions and identify the root cause
4. Fix any compilation errors, test failures, or compatibility issues introduced by the dependency update
5. Run the build/test commands to verify fixes
6. Commit the fixes to the same branch with a descriptive commit message
7. Provide a summary of what was fixed

Failed Actions Summary:
${failedActions.data.workflow_runs.map(action => 
  `- ${action.name}: ${action.conclusion} (${action.html_url})`
).join('\n')}

The goal is to make this dependency update PR ready for developer review and merge.
Please be thorough in testing the fixes before committing.
`;

      console.log('\n📤 Prompt that would be sent to Amp:');
      console.log('=====================================');
      console.log(mockPrompt);
      console.log('=====================================\n');

      console.log('🔧 Environment variables that would be passed:');
      console.log(`- GITHUB_TOKEN: [REDACTED]`);
      console.log(`- REPO_OWNER: ${owner}`);
      console.log(`- REPO_NAME: ${repo}`);
      console.log(`- PR_NUMBER: ${prNumber}`);
      console.log(`- PR_BRANCH: ${prBranch}\n`);

      console.log('✅ Dry run completed successfully!');
      console.log('💡 To run actual triage: node dist/index.js trly/quad-ops triage');

    } catch (error) {
      console.error('❌ Error in dry run:', error);
    }
  }
}

async function main() {
  const tester = new TestRemediation();
  
  const repoArg = process.argv[2] || 'trly/quad-ops';
  const [owner, repo] = repoArg.split('/');
  
  if (!owner || !repo) {
    console.error('Invalid repository format. Use: owner/repo');
    process.exit(1);
  }

  await tester.dryRunRemediation(owner, repo);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
