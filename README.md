# Action Triage Agent (Simplified)

A streamlined GitHub Actions failure triage tool powered by `@sourcegraph/amp-sdk`. This tool analyzes failed CI/CD workflows and can automatically triage them.

## Features

- **Simple Branch Analysis**: Finds the latest failed workflow per branch
- **Amp Integration**: Uses `@sourcegraph/amp-sdk` for analysis and remediation

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

Your GitHub token needs the following scopes:

- `repo` (or fine-grained equivalent):
  - `contents:read` - Read repository contents and metadata
  - `contents:write` - Push commits and create branches for automated fixes
  - `pull_requests:write` - Create and comment on pull requests
- `actions:read` - Access workflow run information and logs

**Note:** For fine-grained personal access tokens, ensure `Contents` (read & write) and `Pull requests` (read & write) permissions are enabled on the target repository.

[Create a token with required permissions →](https://github.com/settings/tokens/new?scopes=repo,actions:read&description=GitHub%20Triage%20Agent)

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

- Sends failure context to `@sourcegraph/amp-sdk` (Amp)
- Gets root cause analysis and suggested fixes
- For remediation: clones repo, applies fixes, commits and pushes changes

### 4. Smart PR Management

- **Main/Master branches**: Always creates a fix branch and PR for safety
- **Feature branches**:
  - If existing PR exists: pushes changes and adds comment
  - If no PR exists: only pushes changes (no PR created)
- All work done in isolated temporary directories

## CI Triage Workflows

The triage agent implements two distinct workflows depending on the branch where the failure occurred:

### 1. Triage on Feature Branch (`triageOnBranch`)

When a CI/CD failure occurs on a non-main branch (e.g., `feature/auth`, `dependabot/gradle/update-deps`):

- **Direct Fix**: The agent analyzes the failure and applies fixes directly to the failing branch
- **PR Management**:
  - **If an open PR already exists** for the branch:
    - Pushes the automated fixes to the existing branch
    - Adds a comment to the existing PR using the template in [.github/templates/pr-comment-automated-fix.md](file:///Users/trly/src/github.com/trly/github-triage-agent/.github/templates/pr-comment-automated-fix.md)
    - Comment includes the Amp analysis thread URL and a summary of changes
  - **If no open PR exists**:
    - Pushes the automated fixes to the branch only
    - No PR is created automatically

**Example:**

```bash
# Fix a failing feature branch
triage myorg/myapp triage feature/auth

# Process:
# 1. Clones repo to temporary directory
# 2. Checks out feature/auth branch
# 3. Applies automated fixes
# 4. Commits and pushes to feature/auth
# 5. If existing PR: adds comment. If no PR: changes pushed only
# 6. Cleans up temporary directory
```

### 2. Triage on Main Branch (`triageOnMain`)

When a CI/CD failure occurs on the main branch (or other protected branches):

- **Safe Fix Branch**: The agent creates a new fix branch to respect branch protection rules
- **Fix Branch Naming**: `fix/triage-{branch}-{timestamp}` (e.g., `fix/triage-main-1234567890`)
- **PR Creation**:
  - Creates a PR from the fix branch to the target branch (e.g., `main`)
  - Uses the template in [.github/templates/pr-main-branch-fix.md](file:///Users/trly/src/github.com/trly/github-triage-agent/.github/templates/pr-main-branch-fix.md)
  - PR includes workflow name, target branch, Amp thread URL, and fix summary
  - Ensures compliance with branch protection rules (no direct commits to main)

**Example:**

```bash
# Fix a failing main branch
triage myorg/myapp triage main

# Process:
# 1. Clones repo to temporary directory
# 2. Checks out main branch
# 3. Creates new branch: fix/triage-main-1234567890
# 4. Applies automated fixes
# 5. Commits and pushes fix branch
# 6. Creates PR from fix branch to main
# 7. Cleans up temporary directory
```

### Workflow Comparison

| Aspect                | Feature Branch                        | Main/Protected Branch            |
| --------------------- | ------------------------------------- | -------------------------------- |
| **Target**            | Non-main branches                     | Main/master/protected branches   |
| **Fix Location**      | Directly on the branch                | New fix branch created           |
| **PR Behavior**       | Comment on existing, no new PRs       | Always creates new PR            |
| **PR Template**       | `pr-comment-automated-fix.md` (if PR) | `pr-main-branch-fix.md`          |
| **Branch Protection** | N/A                                   | Respected via PR workflow        |
| **Use Case**          | Quick fixes to in-progress work       | Safe fixes to protected branches |

### Template Variables

All PR templates support the following variables:

- `{{ampThreadUrl}}` - Link to the Amp analysis thread for detailed debugging
- `{{summary}}` - Summary of fixes applied (main branch only)
- `{{branch}}` - Name of the source branch (feature branch only)
- `{{workflowName}}` - Name of the failed workflow (main branch only)
- `{{targetBranch}}` - Name of the target branch (main branch only)

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
- **`amp-simple.ts`** - Integration with `@sourcegraph/amp-sdk` for AI analysis (~200 LOC)
- **`cli-simple.ts`** - Command line argument parsing (~50 LOC)
- **`types-simple.ts`** - Type definitions (~20 LOC)

**Total: ~520 LOC** (down from ~1400 LOC in the original)

## Environment Variables in Amp Execution

The tool passes relevant environment variables to Amp:

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

Amp: Cloning repository...
Amp: Checking out branch main...
Amp: Fixed missing import in src/auth/service.ts
Amp: Tests passing, committing changes...

Created fix PR #42: https://github.com/myorg/myapp/pull/42

Remediation completed for main
Amp Thread: https://ampcode.com/threads/T-abc123

Summary:
   Processed: 1 failures
   Successful: 1
   Failed: 0

Triage complete!
```

## License

MIT License - see LICENSE file for details