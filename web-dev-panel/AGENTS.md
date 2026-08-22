# Web dev panel instructions

This directory owns a development-only local command runner. Preserve the
security boundary in accepted ADR-0013 and the active feature or correction
state before changing it.

- Keep runtime code dependency-free and use only Node.js and browser built-ins.
- Keep the server fixed to `127.0.0.1:4400` in the production entrypoint. Tests
  may inject a different loopback port and synthetic catalog.
- Resolve browser requests only to reviewed catalog IDs. Never add arbitrary
  shell text, browser-provided argv, stdin, PTY support, or `shell: true`.
- Keep process state and logs server-authoritative. Tabs are views and controls,
  never owners of child-process truth.
- Revalidate source revisions immediately before spawning. New, removed, or
  changed scripts stay disabled until `$web-dev-panel` reviews the catalog.
- Keep logs bounded and memory-only. Redact inherited sensitive values before
  buffering and never render command output as HTML.
- Use synthetic fixture commands for tests. Tests must not start real Languon
  services, mutate databases, deploy, reset, or call model providers.
