/**
 * `present_artefact`: one review gate for any produced artefact.
 *
 * The tool hands the user a single artefact — an inline body (plan, document,
 * code, diff, table) or a file on disk — and blocks until the user answers
 * from the card. The card is the Client half of this package: it reads the
 * call's arguments from the conversation, so the body travels in the tool call
 * and the session log. Nothing is written to disk, which is what lets the
 * review work under a read-only sandbox.
 *
 * The answer comes back over one authenticated Fetch route below `/api`,
 * keyed by the tool call identity. The route resolves the deferred that
 * `execute` is awaiting.
 *
 * File artefacts are only read. The Client opens them through the shipped
 * `dsh-resource://file/…` preview, which already renders pdf, Office, Excel,
 * images, code and plain text by extension.
 *
 * @module dsh-present-artefact
 */

/** The model-facing tool name, and the Client tool-view key. */
const TOOL_NAME = 'present_artefact';
/** The answer route below `/api`; routes register the full shared-channel path. */
const ANSWER_ROUTE = '/api/present-artefact/answer';

/** Decisions as machine values; the card renders its own localized labels. */
const AGREE = 'agree';
const REVISE = 'revise';

const DESCRIPTION = 'Show one produced artefact to the user for review: a plan, document, code, diff, table, image, or Office file. The user approves it or asks for changes. Works in any mode and needs no write access: inline content travels in this call, and a file is only read. Approval means carry on with your next step; a change request ends the turn so the user can say what to change.';

const PARAMETERS = {
	type: 'object',
	properties: {
		title: {
			type: 'string',
			description: 'Short name of the artefact, shown as the card heading.',
		},
		summary: {
			type: 'string',
			description: 'One or two sentences the card shows under the heading. Omit to use the body\'s first paragraph.',
		},
		body: {
			type: 'string',
			description: 'The artefact itself as markdown text. Use this for anything you produced inline; never write a file just to show it.',
		},
		path: {
			type: 'string',
			description: 'Path of an existing regular file to review. Relative paths use the session working directory. The tool only reads it.',
		},
	},
	required: ['title'],
};

const OUTPUT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		decision: {
			type: 'string',
			enum: [AGREE, REVISE],
			description: 'Whether the user approved the artefact or asked for changes.',
		},
		feedback: {
			type: 'string',
			description: 'The change the user asked for, when they typed one.',
		},
	},
	required: ['decision'],
};

/**
 * State one outcome to the model.
 *
 * @param value - The validated canonical result.
 * @returns The model-facing result text.
 */
function outcomeText(value) {
	if (value.decision === AGREE) return 'The user approved this artefact. Carry on from your next step.';
	return 'The user asked for changes to this artefact. The turn ends here; read their next message before revising it.';
}

/** The services this plugin needs before it can mount. */
export const inject = ['tools', 'connection'];

/**
 * Register the tool and its answer route.
 *
 * @param ctx - Plugin context.
 */
export function apply(ctx) {
	/** Pending reviews by tool call identity. */
	const pending = new Map();

	ctx.effect(() => ctx.connection.fetch.register({
		path: ANSWER_ROUTE,
		methods: ['POST'],
		requestBody: 'buffered',
		fetch: async (request) => {
			let body;
			try {
				body = await request.json();
			} catch {
				return Response.json({ ok: false, error: 'invalid-json' }, { status: 400 });
			}
			const callId = body?.callId;
			const decision = body?.decision;
			if (typeof callId !== 'string' || callId === '') return Response.json({ ok: false, error: 'missing-call' }, { status: 400 });
			if (decision !== AGREE && decision !== REVISE) return Response.json({ ok: false, error: 'invalid-decision' }, { status: 400 });
			const entry = pending.get(callId);
			if (entry === undefined) return Response.json({ ok: false, error: 'not-pending' }, { status: 409 });
			pending.delete(callId);
			const feedback = typeof body?.feedback === 'string' && body.feedback.trim() !== '' ? body.feedback.trim() : undefined;
			entry.resolve(feedback === undefined ? { decision } : { decision, feedback });
			return Response.json({ ok: true });
		},
	}, 'present-artefact: answer route'));

	ctx.tools.register({
		name: TOOL_NAME,
		description: DESCRIPTION,
		parameters: PARAMETERS,
		output: {
			schema: OUTPUT_SCHEMA,
			render: (_args, value) => [{ type: 'text', text: outcomeText(value) }],
		},
		async execute(args, exec) {
			const agent = exec.agent;
			if (agent === undefined) throw new Error(`${TOOL_NAME} needs a calling agent whose session can show the artefact`);
			const title = typeof args?.title === 'string' ? args.title.trim() : '';
			if (title === '') throw new Error(`${TOOL_NAME} needs a non-empty title`);
			const hasBody = typeof args.body === 'string' && args.body.trim() !== '';
			const hasPath = typeof args.path === 'string' && args.path.trim() !== '';
			if (hasBody === hasPath) throw new Error(`${TOOL_NAME} needs exactly one of \`body\` (inline text) or \`path\` (existing file)`);

			if (hasPath) {
				const fs = ctx.get('fs');
				const workingDirectory = ctx.get('workingDirectory');
				if (fs === undefined || workingDirectory === undefined) throw new Error(`${TOOL_NAME} cannot read files in this composition`);
				const cwd = await workingDirectory.ensure(agent, exec.signal);
				const target = await fs.resolve(args.path, { cwd, signal: exec.signal });
				const info = await fs.stat(target, exec.signal);
				if (info === undefined || info.type !== 'file') throw new Error(`${TOOL_NAME}: ${args.path} is not an existing regular file`);
			}

			let settle;
			const settled = new Promise((resolve) => {
				settle = resolve;
			});
			pending.set(exec.callId, { resolve: settle });

			const aborted = new Promise((_resolve, reject) => {
				if (exec.signal.aborted) {
					reject(new Error(`${TOOL_NAME} was cancelled`));
					return;
				}
				exec.signal.addEventListener('abort', () => reject(new Error(`${TOOL_NAME} was cancelled`)), { once: true });
			});

			let value;
			try {
				value = await Promise.race([settled, aborted]);
			} finally {
				pending.delete(exec.callId);
			}
			if (value.decision === REVISE) exec.concludeTurn();
			return value;
		},
	});
}
