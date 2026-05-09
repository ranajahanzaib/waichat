# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.5-alpha.2] - 2026-05-09

**Security**

- Bumped `hono` to `4.12.18`, fixing three security issues:
  - **GHSA-p77w-8qqv-26rm** - Cache Middleware: responses cached for one authenticated user could be served to others when `Vary: Authorization` or `Vary: Cookie` was present
  - **GHSA-qp7p-654g-cw7p** - `hono/jsx`: untrusted input in `style` object values could inject additional CSS declarations during SSR
  - **GHSA-hm8q-7f3q-5f36** - `hono/utils/jwt`: falsy, non-finite, or non-numeric `exp/nbf/iat` values could silently bypass time-based JWT checks

## [0.1.5-alpha.1] - 2026-05-08

### Security

- Bumped `hono` to `4.12.16` (fixes GHSA-69xw-7hcm-h432, GHSA-9vqf-7f2p-gf9v)
- Forced `@ungap/structured-clone` to `^1.3.1` via pnpm overrides (CWE-502)

### Chore

- Upgraded pnpm to `11.0.8`

## [0.1.5-alpha] - 2026-05-08

Initial pre-release.
