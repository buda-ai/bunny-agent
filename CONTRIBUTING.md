# Contributing to Bunny Agent

Thank you for your interest in contributing to Bunny Agent!

---

## Development Setup

### Prerequisites

- Node.js >= 20.0.0
- pnpm 9.0.0+

### Installation

```bash
# Clone the repository
git clone https://github.com/vikadata/sandagent.git
cd bunny-agent

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test -- --watch
```

### Linting & Type Checking

```bash
# Run linter
pnpm lint

# Fix linting issues automatically
pnpm lint:fix

# Type check all packages
pnpm typecheck
```

---

## Project Structure

```
bunny-agent/
├── apps/
│   ├── web/              # Official documentation site
│   ├── manager-cli/      # Sandbox management CLI
│   └── runner-cli/       # Universal agent runner CLI
├── packages/
│   ├── manager/          # Core orchestration & interfaces
│   ├── sdk/             # SDK for product integration
│   ├── runner-claude/    # Claude runner implementation
│   ├── sandbox-*/       # Sandbox adapters (e2b, sandock, daytona, local)
│   ├── kui/             # UI components library
│   └── benchmark/        # GAIA benchmark tool
├── templates/               # Agent templates (coder, analyst, researcher, etc.)
├── spec/                   # Documentation and specifications
└── tasks/                  # Development tasks
```

---

## Code Style

We use [Biome](https://biomejs.dev) for code formatting and linting.

```bash
# Format code
pnpm lint:fix
```

- Use 2 spaces for indentation
- Follow TypeScript strict mode
- Prefer `const` over `let` when possible
- Use meaningful variable and function names

---

## Submitting Changes

### Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run tests and linting
5. Commit your changes
6. Push to your fork
7. Create a Pull Request to `main` or `develop`

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

Example:
```
feat: add OpenAI runner implementation

- Add @bunny-agent/runner-openai package
- Implement Runner interface for OpenAI Assistants API
- Add tests for new runner
```

### Pull Request Guidelines

- PRs should be small and focused
- Include tests for new features
- Update documentation for API changes
- Link related issues
- Ensure CI passes before requesting review

---

## Changesets

For changes that affect published packages, create a changeset:

```bash
pnpm changeset
```

Follow the prompts to:
1. Select affected packages
2. Choose version bump type (major/minor/patch)
3. Describe your changes

The changeset file will be committed and versioned when merging to `main` or `develop`.

---

## Developing Specific Packages

### Working on apps/web (Documentation Site)

```bash
cd apps/web
pnpm dev
```

Open http://localhost:3000

### Working on manager-cli

```bash
cd apps/manager-cli
pnpm build
pnpm start
```

### Working on runner-cli

```bash
cd apps/runner-cli
pnpm build
pnpm start
```

### Working on SDK

```bash
cd packages/sdk
pnpm build
pnpm test
```

---

## Adding New Sandbox Adapters

1. Create new package: `packages/sandbox-yourname/`
2. Implement `SandboxAdapter` interface from `@bunny-agent/manager`
3. Add tests
4. Update documentation in `spec/SANDBOX_ADAPTERS.md`
5. Add package to monorepo `pnpm-workspace.yaml`

---

## Adding New Runner Implementations

1. Create new package: `packages/runner-yourname/`
2. Implement `Runner` interface from `@bunny-agent/manager`
3. Add tests
4. Update documentation
5. Update runner-cli to support new runner via `--runner` flag

---

## Getting Help

- Open an issue on [GitHub](https://github.com/vikadata/sandagent/issues)
- Join discussions on [GitHub Discussions](https://github.com/vikadata/sandagent/discussions)

---

## License

By contributing to Bunny Agent, you agree that your contributions will be licensed under the Apache License 2.0.
