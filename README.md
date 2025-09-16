# Action Triage Agent (Simplified)

A streamlined GitHub Actions failure triage tool powered by the-orb-is-awake (AMP). This tool analyzes failed CI/CD workflows and can automatically triage common issues.

## Features

- **Simple Branch Analysis**: Finds the latest failed workflow per branch
- **AMP Integration**: Uses the-orb-is-awake for AI-powered failure analysis and remediation  
- **Smart PR Management**: Creates PRs for main branch fixes, comments on existing PRs
- **Clean Output**: Clear, concise reporting without complexity

## Installation

```bash
# Clone the repository
git clone <repo-url>
cd action-triage-agent

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Edit .env with your GitHub token
vim .env
```

## Configuration

Create a `.env` file with:

```env
# Required: GitHub Personal Access Token with repo and actions permissions
GITHUB_TOKEN=ghp_your_github_token_here
```

### GitHub Token Permissions

Your GitHub token needs:
- `repo` - Read repository contents and metadata
- `actions:read` - Access workflow run information and logs

## Usage

```bash
# Build the project
pnpm run build

# Basic commands
triage <owner/repo> <command> [options]
```

### Commands

#### List Failures
Show failed workflows across all branches:

```bash
# List all branches with failed workflows
triage owner/repo list
```

#### Analyze Failures
Get AI-powered analysis of failure causes:

```bash
# Analyze failure on repository default branch
triage owner/repo analyze

# Analyze failure on specific branch
triage owner/repo analyze feature/auth
triage owner/repo analyze "dependabot/gradle/update-deps"
```

#### Triage Failures
Automatically fix detected issues:

```bash
# Triage failure on repository default branch
triage owner/repo triage

# Triage failure on specific branch
triage owner/repo triage feature/auth
triage owner/repo triage "dependabot/gradle/update-deps"
```

### Development Mode

```bash
# Run in development mode with TypeScript
pnpm run dev owner/repo list
pnpm run dev owner/repo analyze main
pnpm run dev owner/repo triage feature/auth
```

## How It Works

### 1. Branch Discovery
- Lists branches in the repository
- Applies filters to target specific branches or patterns
- Supports wildcards (`feature/*`) and exact matches

### 2. Failure Detection  
- Gets the latest failed workflow run per branch
- No complex grouping or fingerprinting - keeps it simple
- Downloads logs only when needed for analysis/remediation

### 3. AI Analysis & Remediation
- Sends failure context to the-orb-is-awake (AMP)
- Gets root cause analysis and suggested fixes
- For remediation: clones repo, applies fixes, commits and pushes changes

### 4. Smart PR Management
- **Main/Master branches**: Always creates a fix branch and PR for safety
- **Feature branches**: 
  - If existing PR exists: pushes changes and adds comment
  - If no PR exists: pushes changes and creates new PR
- All work done in isolated temporary directories

## Examples

### Daily Triage Workflow

```bash
# 1. See what's broken across all branches
triage myorg/myapp list

# 2. Analyze issues on main branch
triage myorg/myapp analyze

# 3. Fix main branch issues
triage myorg/myapp triage

# 4. Fix specific problematic branches
triage myorg/myapp triage feature/broken-feature
triage myorg/myapp triage dependabot/gradle/update-deps
```

### Focus on Specific Branches

```bash
# Focus on main branch
triage myorg/myapp analyze
triage myorg/myapp triage

# Focus on specific branches  
triage myorg/myapp analyze release/1.2.0
triage myorg/myapp triage release/1.2.0
```

## Architecture

The simplified tool has clean, focused components:

- **`triage-simple.ts`** - Main orchestrator and CLI entry point (~150 LOC)
- **`github-simple.ts`** - GitHub API client for branches and workflow data (~100 LOC)
- **`amp-simple.ts`** - Integration with the-orb-is-awake for AI analysis (~200 LOC)  
- **`cli-simple.ts`** - Command line argument parsing (~50 LOC)
- **`types-simple.ts`** - Type definitions (~20 LOC)

**Total: ~520 LOC** (down from ~1400 LOC in the original)

## Environment Variables in AMP Execution

The tool passes relevant environment variables to AMP:

- `GITHUB_TOKEN`: For repository access
- `REPO_OWNER`: Repository owner
- `REPO_NAME`: Repository name  
- `BRANCH_NAME`: Branch name to checkout
- `FIX_BRANCH`: Fix branch name (for main branch remediations)
- `WORKFLOW_RUN_ID`: Specific workflow run ID
- `TEMP_WORK_DIR`: Unique temporary directory for isolated work

## Output Examples

### List Mode
```
GitHub Action Triage: myorg/myapp
Mode: list
Fetching branches: main, master
   Found 2 branches to check

Checking for failed actions...
   Found 1 failed workflows

Failed Actions:

FAILED: main
   ├─ CI (failure)
   └─ https://github.com/myorg/myapp/actions/runs/123456

Summary:
   Processed: 1 failures

Triage complete!
```

### Triage Mode
```
GitHub Action Triage: myorg/myapp
Mode: triage
Fetching branches: main
   Found 1 branches to check

Checking for failed actions...
   Found 1 failed workflows

Processing 1 failures...

Processing main/CI...
Main branch detected - creating PR for safety

AMP: Cloning repository...
AMP: Checking out branch main...
AMP: Fixed missing import in src/auth/service.ts
AMP: Tests passing, committing changes...

Created fix PR #42: https://github.com/myorg/myapp/pull/42

Remediation completed for main
AMP Thread: https://ampcode.com/threads/T-abc123

Summary:
   Processed: 1 failures
   Successful: 1
   Failed: 0

Triage complete!
```

## License

MIT License - see LICENSE file for details
