# Future Local Backend Startup

The guided setup includes a reserved path for starting or bundling a local
Neuraxis backend. The browser MVP does not implement this.

When implementing Electron packaging, define:

- how the app locates a bundled Neuraxis runtime
- how it starts and stops the backend process
- how it runs first-time migrations or onboarding
- where backend logs are stored
- how the renderer detects backend readiness
- how upgrades preserve local user data
