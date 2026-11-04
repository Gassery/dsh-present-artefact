# dsh-present-artefact

A DeepSeek Harness bundle that adds one tool, `present_artefact`: it shows a
single produced artefact to the user — a plan, document, code, diff, table,
image, or Office file — and waits for their decision.

It behaves like the shipped plan review, on purpose:

- the review **takes over the composer** (the input box) instead of sitting in
  the transcript;
- the full text **opens by itself** in the right sidebar when the card appears;
- the transcript keeps one compact line, with a link back into the full text.

Inline artefacts never touch the filesystem: the body travels in the tool
call's arguments and the session log, so the review works under a read-only
sandbox and can be reopened after a reload. File artefacts are only read.

## Install

```bash
dsh plugin install github:Gassery/dsh-present-artefact --profile <profile>
```

## Tool contract

| Parameter | Meaning |
| --- | --- |
| `title` | Card heading. Required. |
| `summary` | One or two sentences under the heading. Omit to use the body's first paragraph. |
| `body` | The artefact as markdown. Inline artefacts never touch the filesystem. |
| `path` | An existing regular file to review. Read-only. |

Exactly one of `body` / `path` is required.

The result is `{"decision":"agree"|"revise","feedback"?}`. Approving lets the
model carry on; requesting changes ends the turn so the user can say what to
change.

## How the Client half is wired

- **Pending observer** — a `conversation.composer.dock` entry watches the Chat
  nodes. While a `present_artefact` call is dispatched and unanswered it
  publishes an `artefact-review` pending interaction through
  `ctx.uiSession.registerPendingInteraction`; when the call settles it
  unpublishes, which hands the composer back.
- **Composer takeover** — a `conversation.composer` chain entry is elected only
  for that interaction, so the review replaces the input box exactly like the
  shipped question composer.
- **Transcript row** — a `tool.call.toolview` entry keyed `present_artefact`
  renders one line and a link back into the full text.
- **Full text** — never rendered here. Inline artefacts open the shipped
  temporary review preview (`dsh-resource://plan-review/…` with `planReview`
  parameters), the same `MarkdownText` pane `exit_plan_mode` uses. File
  artefacts open the shipped `dsh-resource://file/…` preview, which picks a
  renderer by extension.
- **Answer** — `POST /api/present-artefact/answer`, one authenticated route that
  settles the pending review by tool call identity.

## Development notes

- Editing `client.js` takes effect after a page refresh.
- Editing `index.js` needs a package reinstall **and a dsh restart**: a replaced
  package loads its Host module only in a fresh process.

## License

MIT
