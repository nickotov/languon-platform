---
type: adr
id: ADR-0067
title: 'Isolate external website and image previews in Knowledge documents'
status: accepted
date: 2026-11-26
supersedes: 'Extends ADR-0050 for user-authored website and image previews'
---

# Isolate external website and image previews in Knowledge documents

## Context

Authors want to embed websites and images by URL and enlarge them while reading.
The existing video block already recognizes validated YouTube sources. The web
app's content security policy previously allowed only its YouTube player origin
as a frame source.

## Decision

Persist a typed website or image URL with explicit, top-level document nodes.
The browser loads the HTTPS resource following activation by the viewer. Keep
the hostname, external link and dialog controls in the trusted parent UI.
The document services store the URL and carry it through copies. They perform
no retrieval or conversion. Model-generated prose has its own admission rules.

For websites, the application frames a fixed static preview document. The target
travels in the URL fragment, which browsers omit from HTTP requests. A hash-pinned
bootstrap validates the URL, installs an origin-specific frame policy, and creates
an inner iframe with an empty sandbox and a no-referrer policy. The outer sandbox
permits the bootstrap to run with an opaque origin. Server response headers allow
this one document to be framed locally. Ordinary application pages deny framing.
Images use the browser image element with no referrer.

## Alternatives considered

A global HTTPS frame policy would relax the browser boundary for unrelated frames.
A server proxy would introduce remote fetching and change the remote site's own
embedding controls. A provider allowlist remains appropriate for the separate,
script-enabled YouTube player.

## Consequences

User activation exposes ordinary connection metadata to the remote host. Website
scripts, forms and pop-ups are restricted. Sites can refuse embedding and may
require their scripts to display useful content. The external link remains
available. Changes to the static bootstrap or styling require updating its
response policy hashes and rerunning the policy and browser checks.

[ADR-0050](0050-interactive-workbook-content-and-learning-boundaries.md) ·
[Feature specification](../../.agent/features/076-knowledge-document-embeds/FEATURE.md)
