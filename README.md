# dsh-tool-present-plan

A DeepSeek Harness bundle that adds one Host tool, `present_plan`: it shows a plan in the same review card plan mode uses for `exit_plan_mode`, and waits for the user's decision — in any mode, without entering or leaving plan mode.

## Install

```bash
dsh plugin install github:Gassery/dsh-tool-present-plan --profile <profile>
```

Or install the same spec from the Web UI's plugin manager.

## Behavior

- Approval returns `{ approved: true }`; the model carries the plan out from its next step.
- "Request changes" closes the review, ends the turn, and returns `{ approved: false }` so the user replies in their own words.
- The plan markdown travels in the question's `detail`, which is the field the review card renders and previews. `header` and `question` exist because the question API requires them; the card draws its own localized chrome.
- The review intentionally omits `intent.callId`. Plan mode uses that field to reopen a logged `exit_plan_mode` call; this tool's review is rendered from the question itself, so it works for any tool name.
- No Client half is needed. The review card and the plan preview ship with `@deepseek-ai/dsh-client-ui-user-questions` and `@deepseek-ai/dsh-client-ui-plan`.
- The package imports nothing from other Harness packages: a bundle linked into a profile from outside its `node_modules` cannot rely on the loader's package routing for its own imports.

## Layout

- `index.js` — the tool definition.
- `cordis.patch.yml` — the bundle's one row.
- `locale/{en,zh}.json` — Plugin Manager title and description.
- `icon.svg` — inventory icon.

## License

MIT
