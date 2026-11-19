# dsh-present-artefact

A DeepSeek Harness bundle that adds one tool, `present_artefact`: it shows a
single produced artefact to the user — a plan, document, code, diff, table,
image, or Office file — and waits for their decision.

It behaves like the shipped plan review, on purpose:

- the review **takes over the composer** (the input box) instead of sitting in
  the transcript;
- the full text **opens by itself** in the right sidebar when the card appears;
- the transcript keeps one card, the same card the shipped plan review uses,
  and it opens the full text again.

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
- **Sidebar** — two page types: the artefact list for the Session, and one
  operation preview that renders a single tool call's arguments.
- **Approval details** — the `conversation.approval.detail` occupant, shared by
  every approval in the Session. See below.
- **Answer** — `POST /api/present-artefact/answer` settles the pending review by
  tool call identity. `GET /api/present-artefact/list` lists a Session's
  artefacts and `GET /api/present-artefact/call` reads one call's arguments;
  both read the Session's own log rather than the loaded transcript.

## Approvals

The detail seat serves every approval request in the Session, not only this
tool's:

- one locating line — the file path, or the working directory when the call
  names no file — with a **View full text** link that follows the end of that
  line, whether it ends the text or wraps it;
- the loaded Chat node answers first, so the card paints without a round trip,
  and the Host's session-log copy replaces it when the request lands; a failed
  request leaves the Chat copy in place instead of blanking the card;
- rejecting an approval ends the turn and keeps whatever the user already
  typed, so a refusal is a decision rather than a new prompt to answer.

## The operation preview

One section per argument shape, each drawn by the shipped primitive for it:

| Arguments | Section | Renderer |
| --- | --- | --- |
| `command` | command | `TerminalBlock`, with the working directory, wrapping long commands |
| `file_path` + `content` | content | `MarkdownText` |
| `file_path` + `old_string` / `new_string` | diff | `DiffBlock` |
| anything else | arguments | plain code |

The approval card keeps the locating line; the preview holds the substance, and
scrolls as one pane when the content outgrows it.

## Development notes

- Editing `client.js` takes effect after a page refresh.
- Editing `index.js` needs a package reinstall **and a dsh restart**: a replaced
  package loads its Host module only in a fresh process.

## License

MIT
