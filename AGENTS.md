# Repository Guidelines

## Project Structure & Module Organization

CaseForge is a pnpm monorepo. `apps/api/` contains the NestJS backend; organize domain code under `src/modules/<domain>/` with `controller`, `service`, `entity`, `dto`, and `util` folders as needed. `apps/web/` is the Vue 3/Vite frontend, with application code in `src/`. Shared TypeScript contracts live in `packages/shared/src/`; prefer these over duplicating API types. Operational files are under `deploy/`, product documentation under `doc/`, and reusable prompt skills under `skill/`. Do not commit generated `dist/`, `.data/`, or dependency directories.

## Build, Test, and Development Commands

Use Node.js 20+ and pnpm 10.

- `pnpm install` installs all workspace dependencies.
- `pnpm dev:api` starts the API in watch mode after building shared types.
- `pnpm dev:web` starts the Vite frontend.
- `pnpm build` builds every workspace package.
- `pnpm lint` and `pnpm typecheck` run TypeScript checks across the monorepo.
- `pnpm --filter @case-forge/api test` runs the API Jest suite.
- `pnpm --filter @case-forge/api test:cov` produces API coverage output.

## Coding Style & Naming Conventions

Write TypeScript with two-space indentation, double quotes, semicolons, and trailing commas where supported. Run `pnpm --filter @case-forge/api format` for backend formatting. Use `PascalCase` for classes and Vue components, `camelCase` for functions and variables, and kebab-case filenames with role suffixes such as `case-editor.service.ts` or `save-struct-doc.dto.ts`. Keep feature logic in its owning module and share code only when both frontend and backend genuinely consume it.

## Testing Guidelines

Backend tests use Jest and `ts-jest`. Place focused tests beside implementation files and name them `*.spec.ts`, matching existing examples in `apps/api/src/modules/api-test/`. Add a regression test for bug fixes and cover validation, queueing, parsing, and security-sensitive paths. No fixed coverage threshold is configured; preserve or improve coverage for changed code.

## Commit & Pull Request Guidelines

History currently favors concise Conventional Commit-style subjects such as `feat: ...`; use `feat:`, `fix:`, `refactor:`, or `docs:` followed by a specific imperative summary. Keep commits scoped to one change. Pull requests should explain the problem and solution, list verification commands, link relevant issues, and include screenshots or recordings for UI changes. Call out schema, environment, or deployment changes explicitly.

## Security & Configuration

Never commit API keys, database credentials, or local data. Document new environment variables and provide safe defaults where possible. Validate external input through NestJS DTOs and avoid logging secrets or full request payloads.
