import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { TriageOptions } from './types.js';

export function parseCliArgs(): TriageOptions {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 <owner/repo> <command> [options]')
    .command('list', 'List failed actions across all branches')
    .command('analyze <branch>', 'Analyze failures with AI for specific branch', (yargs) => {
      yargs.positional('branch', {
        describe: 'Branch to analyze (defaults to repository default branch)',
        type: 'string'
      });
    })
    .command('triage <branch>', 'Fix failures automatically for specific branch', (yargs) => {
    yargs.positional('branch', { 
    describe: 'Branch to triage (defaults to repository default branch)', 
    type: 'string'
    });
})
    .positional('repo', {
      describe: 'Repository in format owner/repo',
      type: 'string',
      demandOption: true
    })
    .help()
    .alias('help', 'h')
    .parseSync();

  // Parse owner/repo from first positional argument
  const repoArg = argv._[0] as string;
  if (!repoArg || !repoArg.includes('/')) {
    throw new Error('Repository must be in format owner/repo');
  }

  const [owner, repo] = repoArg.split('/');
  const mode = argv._[1] as 'list' | 'analyze' | 'triage';

if (!mode || !['list', 'analyze', 'triage'].includes(mode)) {
  throw new Error('Command must be one of: list, analyze, triage');
}

  let branches: string[] = [];
  if (mode === 'list') {
    branches = ['*']; // Always list all branches
  } else {
    // For analyze/triage, use specified branch or default to repo default
    const specifiedBranch = argv._[2] as string | undefined;
    branches = specifiedBranch ? [specifiedBranch] : ['default']; // 'default' is a marker
  }

  return {
    owner,
    repo,
    mode,
    branches
  };
}
