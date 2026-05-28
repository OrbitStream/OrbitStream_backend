# Contributing to OrbitStream Backend

Thank you for your interest in contributing to OrbitStream! This guide will help you get started.

## Code of Conduct

This project adheres to the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Architecture

For a full understanding of the OrbitStream system, see the [architecture documentation](https://github.com/orbitstream/orbitstream_docs/tree/main/architecture).

## Getting Started

### Prerequisites

- Node.js >= 20
- PostgreSQL

### Setup

```bash
npm install
cp .env.example .env
npm run dev
```

### Checks

```bash
npm run lint
npm run build
npm test
```

## Development Workflow

1. Fork this repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Ensure all checks pass (see above)
5. Commit using [conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`
6. Open a Pull Request against `main`

## Pull Request Guidelines

- PRs must be linked to an issue
- All CI checks must pass
- Include a description of what changed and why
- Add tests for new functionality
