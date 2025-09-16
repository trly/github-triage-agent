# AGENTS.md - Codebase Guide

## Commands
- **Build**: `pnpm run build` - Compile TypeScript to dist/
- **Run**: `pnpm run start` or `node dist/triage.js`
- **Dev**: `pnpm run dev` - Run with ts-node for development
- **CLI**: `triage owner/repo <command> [branch]` where command is list|analyze|triage
- No formal tests - uses test-remediate.ts for manual testing

## Architecture
- **Entry**: triage.ts (CLI orchestrator ~170 LOC)  
- **CLI parsing**: index.ts (yargs-based argument parsing)
- **GitHub API**: github.ts (Octokit wrapper for branches/workflows)
- **AI Integration**: amp.ts (the-orb-is-awake client for analysis/remediation)
- **Types**: types.ts (BranchFailure, AmpAnalysis, TriageOptions interfaces)
- **Total**: ~520 LOC simplified from 1400 LOC original

## Code Style
- **ES Modules**: Uses .js extensions in imports, type: "module" in package.json
- **TypeScript**: Strict mode, ES2020 target, explicit types for all interfaces  
- **Error handling**: Try/catch blocks, process.exit(1) on errors
- **Imports**: Use .js extensions for local files, named imports from npm packages
- **Classes**: PascalCase with private fields, constructor DI pattern
- **Functions**: Async/await preferred, explicit return types for complex functions
- **Logging**: Console.log for user feedback, console.error for errors
- **Config**: dotenv for environment variables, GITHUB_TOKEN required
