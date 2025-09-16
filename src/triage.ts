#!/usr/bin/env node

import * as dotenv from 'dotenv';
import { parseCliArgs } from './index.js';
import { GitHubClient } from './github.js';
import { AmpClient } from './amp.js';
import type { BranchFailure } from './types.js';

// Load environment variables
dotenv.config();

async function main() {
  try {
    const options = parseCliArgs();
    
    console.log(`GitHub Action Triage: ${options.owner}/${options.repo}`);
    console.log(`Mode: ${options.mode}`);
    
    // Initialize clients
    const github = new GitHubClient();
    const amp = new AmpClient();
    
    // Get branches to analyze
    let branches: string[];
    if (options.mode === 'list') {
      console.log('Fetching all branches...');
      branches = await github.listBranches(options.owner, options.repo, ['*']);
    } else {
      // For analyze/triage modes
      if (options.branches.includes('default')) {
        const defaultBranch = await github.getDefaultBranch(options.owner, options.repo);
        console.log(`Using repository default branch: ${defaultBranch}`);
        branches = [defaultBranch];
      } else {
        console.log(`Using specified branch: ${options.branches[0]}`);
        branches = options.branches;
      }
    }
    
    console.log(`   Found ${branches.length} branches to check`);
    
    if (branches.length === 0) {
      console.log('No branches found matching criteria');
      return;
    }
    
    // Process each branch - get latest failed run
    console.log('\nChecking for failed actions...');
    
    const failures: BranchFailure[] = [];
    const concurrency = 3; // Process 3 branches at a time
    
    for (let i = 0; i < branches.length; i += concurrency) {
      const chunk = branches.slice(i, i + concurrency);
      const chunkPromises = chunk.map(async (branch) => {
        const failure = await github.getLatestFailedRun(options.owner, options.repo, branch);
        if (failure) {
          failures.push(failure);
        }
        return failure;
      });
      
      await Promise.all(chunkPromises);
    }
    
    if (failures.length === 0) {
      console.log('No failed actions found!');
      return;
    }
    
    console.log(`   Found ${failures.length} failed workflows`);
    
    // LIST MODE: Just show the failures
    if (options.mode === 'list') {
      console.log('\nFailed Actions:\n');
      
      for (const failure of failures) {
        console.log(`FAILED: ${failure.branch}`);
        console.log(`   ├─ ${failure.workflowName} (${failure.conclusion})`);
        console.log(`   └─ ${failure.htmlUrl}`);
        console.log('');
      }
      return;
    }
    
    // ANALYZE or TRIAGE MODE: Process the single target branch
    if (failures.length === 0) {
      console.log(`No failed actions found on target branch(es).`);
      return;
    }

    // For analyze/triage, we should only have one target branch
    const targetBranch = branches[0];
    const failure = failures.find(f => f.branch === targetBranch);
    
    if (!failure) {
      console.log(`No failed actions found on branch: ${targetBranch}`);
      return;
    }

    console.log(`\nProcessing ${failure.branch}/${failure.workflowName}...`);
    
    // Download logs
    const logs = await github.getWorkflowLogs(options.owner, options.repo, failure.workflowRunId);
    
    const results = [];
    const isMainBranch = (branch: string) => branch === 'main' || branch === 'master';
    
    if (options.mode === 'analyze') {
      // Just analyze the failure
      const analysis = await amp.analyzeFailure(options.owner, options.repo, failure, logs);
      results.push(analysis);
      
      console.log(`\nRoot Cause: ${analysis.rootCause}`);
      console.log(`Suggested Fix: ${analysis.suggestedFix}`);
      if (analysis.ampThreadUrl) {
        console.log(`AMP Thread: ${analysis.ampThreadUrl}`);
      }
      
    } else if (options.mode === 'triage') {
      // Attempt to fix the failure
      let analysis;
      
      if (isMainBranch(failure.branch)) {
        console.log(`Main branch detected - creating PR for safety`);
        analysis = await amp.triageOnMain(options.owner, options.repo, failure, logs);
      } else {
        console.log(`Remediating directly on branch`);
        analysis = await amp.triageOnBranch(options.owner, options.repo, failure, logs);
      }
      
      results.push(analysis);
      
      console.log(`Remediation completed for ${failure.branch}`);
      if (analysis.ampThreadUrl) {
        console.log(`AMP Thread: ${analysis.ampThreadUrl}`);
      }
    }
    
    // Print summary
    console.log(`\nSummary:`);
    console.log(`   Processed: ${results.length} failures`);
    
    if (options.mode === 'triage') {
      const successful = results.filter(r => !r.rootCause.includes('failed') && !r.rootCause.includes('Error'));
      const failed = results.filter(r => r.rootCause.includes('failed') || r.rootCause.includes('Error'));
      
      console.log(`   Successful: ${successful.length}`);
      console.log(`   Failed: ${failed.length}`);
      
      if (failed.length > 0) {
        console.log('\nFailed remediations:');
        for (const failure of failed) {
          console.log(`   - ${failure.branch}: ${failure.rootCause}`);
        }
      }
    }
    
    console.log('\nTriage complete!');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
