// To add a language: add an entry here (and to LANGUAGES in workspace-service).
export const LANGUAGES = {
  python: {
    image: 'python:3.12-alpine',
    file: 'main.py',
    command: 'python -u /tmp/main.py',
    env: ['PYTHONDONTWRITEBYTECODE=1', 'PYTHONUNBUFFERED=1'],
  },
  javascript: {
    image: 'node:20-alpine',
    file: 'main.js',
    command: 'node /tmp/main.js',
    env: ['NODE_OPTIONS=--max-old-space-size=80'],
  },
};
