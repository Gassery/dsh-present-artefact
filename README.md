# dsh-present-artefact

A DeepSeek Harness bundle that adds one tool, `present_artefact`: it shows a
single produced artefact to the user in a review card — a plan, document,
code, diff, table, image, or Office file — and waits for their decision.

The card keeps the review shape that matters: a heading, a summary, a
**View full text** link that opens the artefact in the right sidebar, and two
decisions — approve or request changes.

Inline content travels in the tool call's own arguments, so the review needs
**no write access**: nothing is created on disk, and the card is rebuilt from
the session log after a reload. File artefacts are only read, and open through
the shipped `dsh-resource://file/…` preview, which already renders PDF, Office,
Excel, images, code and plain text by extension.

## Install

```bash
dsh plugin install github:Gassery/dsh-tool-present-plan --profile <profile>
```

Or install the same spec from the Web UI's plugin manager.

## Tool contract

| Parameter | Meaning |
| --- | --- |
| `title` | Card heading. Required. |
| `summary` | One or two sentences under the heading. Omit to use the body's first paragraph. |
| `body` | The artefact as markdown. Inline artefacts never touch the filesystem. |
| `path` | An existing regular file to review. Read-only. |

Exactly one of `body` / `path` is required.

The result is `{ decision: 'agree' | 'revise', feedback?: string }`. Approving
lets the model carry on; requesting changes ends the turn so the user can say
what to change.

## Surfaces

- `tool.call.toolview` keyed `present_artefact` — the review card, at the call
  position in the conversation. It reads the call's arguments, so it survives a
  reload.
- `sidebar.right.pane.tab` keyed `dsh-present-artefact` — the full inline body
  at reading width. The tab holds the text in navigation parameters, so it is
  temporary: after a reload, click **View full text** again to reopen it.
- `POST /api/present-artefact/answer` — the one authenticated route the card
  uses to settle the pending review.

## Layout

- `index.js` — Host half: the tool, the pending-review registry, the answer route.
- `client.js` — Client half: the review card and the sidebar preview.
- `cordis.patch.yml` — the bundle's one row.
- `locale/{en,zh}.json` — Plugin Manager title and description.
- `icon.svg` — inventory icon.

## License

MIT
