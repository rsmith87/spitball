# Spitball

Standalone local-first chat client for Llama Pack backends.

The app is currently a browser-based MVP built with Vite, React, and TypeScript. It is structured so it can later be packaged with Electron and use desktop storage such as encrypted SQLite and OS keychain credentials.

## Run Locally

```bash
npm install
npm run dev
```

Vite will print the local URL, usually `http://127.0.0.1:5173/` or the next available port.

## Connect To Llama Pack

Use a Llama Pack controller URL when possible:

```text
https://pi-controller.local
```

The controller should expose:

- `GET /lm-api/v1/client-discovery`
- `GET /v1/client/session`
- `GET /v1/models`
- `POST /v1/client/diagnostics/chat`
- `POST /v1/chat/completions`

Use an external app key created in Llama Pack core. For browser development, the controller must allow the Vite origin in `client_cors_origins`, for example:

```yaml
client_cors_origins:
  - "http://localhost:5173"
  - "http://127.0.0.1:5173"
```

Match the actual port printed by Vite.

## Local Storage

Browser MVP storage uses IndexedDB:

- connection profile
- optional remembered external app key
- local conversation history

The remembered key is device/browser-profile local. The future Electron build should move credentials to OS keychain storage and use encrypted SQLite for chat history.

## Scripts

```bash
npm test
npm run typecheck
npm run build
```

## Current Notes

- The chat pane keeps the composer fixed at the bottom.
- Messages scroll inside the center pane.
- `Enter` sends a message.
- `Shift+Enter` inserts a newline.
- The setup pane can collapse into a narrow right rail and reopen when needed.
