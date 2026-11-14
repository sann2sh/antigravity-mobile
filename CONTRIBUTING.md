# Contributing to Antigravity Mobile Companion

Thanks for your interest in contributing! Here is how to set up a local development environment.

## Prerequisites

- Linux with Python 3.10+, Node.js 18+, and `agy` CLI installed
- Initial setup completed via `./install.sh` (or a Python `venv` and `frontend/node_modules` installed)

## Development Setup

Run the backend and frontend dev servers in two separate terminals:

### 1. Backend (FastAPI)

```bash
PYTHONPATH=backend ./venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Frontend (Vite Dev Server)

```bash
cd frontend
npm run dev
```

The Vite dev server runs on `http://localhost:5173` and automatically proxies `/api` and `/ws` requests to the FastAPI backend on `127.0.0.1:8000`.

## Building & Linting

Before opening a pull request, verify that the TypeScript check, production bundle, and linter pass:

```bash
cd frontend
npm run lint
npm run build
```

## Submitting Changes

1. Fork the repository and create a branch for your change.
2. Keep pull requests focused and include a short summary of what changed and how you tested it.
3. Never commit `.env` files, personal paths, tokens, or local IP addresses.
