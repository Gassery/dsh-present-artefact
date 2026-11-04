/**
 * `present_plan`: show a plan with the plan-review card that plan mode's
 * `exit_plan_mode` uses, without requiring plan mode.
 *
 * The card is not a dedicated tool UI. It is the user-questions channel's
 * `plan-review` presentation intent, and the question's `detail` field carries
 * the plan document: the Client renders its heading and first paragraph as the
 * card summary and opens the full markdown beside the conversation.
 *
 * The intent deliberately omits `callId`. That field points the preview at a
 * logged `exit_plan_mode` invocation, whose arguments the Client can replay;
 * this tool's review is rendered from the question's own `detail` instead, so
 * it works for any tool name and leaves no resolver to keep in sync.
 *
 * Copy ownership: this tool contributes the plan document — written in the
 * user's own language — and machine values. Every piece of card chrome
 * ("同意执行"/"Approve", "要求修改"/"Request changes", "计划待审"/"Plan
 * review", the full-plan link) is drawn by the shipped Client plugins from
 * their own locale dictionaries. So this tool never guesses the UI language,
 * and adds no chrome-like string of its own: no option tooltip, no result-card
 * title.
 *
 * The definition is written against the raw `ToolDefinition` contract instead
 * of importing `defineTool`, so the package has no runtime import of another
 * Harness package: a bundle linked into a profile from outside its
 * `node_modules` must not depend on the loader's package-routing generation for
 * its own imports.
 *
 * @module @local/dsh-tool-present-plan
 */

/** The model-facing tool name. */
const TOOL_NAME = 'present_plan';
/** The review question's id, echoed in the answer this tool reads. */
const REVIEW_ID = 'plan-review';
/**
 * The approve option's answer value, shared with the intent. The plan-review
 * card never displays it: the Client prints its own localized `plan.approve`
 * label and echoes this value back as the chosen answer, so it is a machine
 * value rather than user copy. It matches the label plan mode's
 * `exit_plan_mode` uses.
 */
const APPROVE_LABEL = 'Approve';
/** Answer code the user-questions channel rejects with when the user leaves the review. */
const CANCELLED = 'ASK_CANCELLED';

const DESCRIPTION = 'Present a plan for the user to review and approve, then wait for their decision. Works in any mode and does not change plan mode. Approval means carry out the plan from your next step. If the user leaves the review to reply in their own words, the turn ends unapproved. While plan mode is active, prefer exit_plan_mode: it shows the same review and also leaves plan mode.';

const PLAN_PARAMETER = 'The complete plan as markdown, starting with a `# ` heading that names it. The heading and first paragraph are the card summary; the whole document opens for reading beside the conversation. Make it decision-complete: goal, changes grouped by area, tests, risks, and open assumptions.';

/** The open parameter object the model fills. */
const PARAMETERS = {
	type: 'object',
	properties: {
		plan: {
			type: 'string',
			description: PLAN_PARAMETER,
		},
	},
	required: ['plan'],
};

/** The canonical result; `approved` is the only fact every outcome carries. */
const OUTPUT_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	properties: {
		approved: {
			type: 'boolean',
			description: 'Whether the user approved the plan.',
		},
		feedback: {
			type: 'string',
			description: 'The change the user asked for instead of approving; omitted when they gave none.',
		},
	},
	required: ['approved'],
};

/**
 * Read the plan's first markdown heading, for the transcript card title.
 *
 * @param plan - The plan markdown.
 * @returns The heading text, or undefined when the plan has none.
 */
function firstHeading(plan) {
	for (const line of plan.split('\n')) {
		const match = /^#{1,6}\s+(.+?)\s*$/.exec(line);
		if (match !== null) return match[1];
	}
	return undefined;
}

/**
 * State one outcome to the model without repeating the card the user saw.
 *
 * @param value - The validated canonical result.
 * @returns The model-facing result text.
 */
function outcomeText(value) {
	if (value.approved === true) return 'Plan approved. Carry it out starting with your next step.';
	if (typeof value.feedback === 'string' && value.feedback !== '') return `Plan not approved. The user asked for changes: ${value.feedback}`;
	return 'Plan not approved. The user left the review to reply in their own words; wait for their message before changing the plan.';
}

/**
 * Tell whether a rejection is the user leaving the review for the composer.
 *
 * @param cause - Whatever the ask rejected with; the wire rebuilds this error
 *   in the running Host, so the code is matched structurally.
 * @returns True for that one code.
 */
function isCancelled(cause) {
	return typeof cause === 'object' && cause !== null && cause.code === CANCELLED;
}

/** The tool registry this plugin registers into. */
export const inject = ['tools'];

/**
 * Register the global `present_plan` tool.
 *
 * @param ctx - Plugin context.
 */
export function apply(ctx) {
	const tool = {
		name: TOOL_NAME,
		description: DESCRIPTION,
		parameters: PARAMETERS,
		output: {
			schema: OUTPUT_SCHEMA,
			render: (_args, value) => [{ type: 'text', text: outcomeText(value) }],
		},
		async execute(args, exec) {
			const plan = typeof args?.plan === 'string' ? args.plan.trim() : '';
			if (!/^#\s+\S/.test(plan)) throw new Error(`${TOOL_NAME} needs a markdown plan that starts with a "# " heading naming it`);
			const agent = exec.agent;
			if (agent === undefined) throw new Error(`${TOOL_NAME} needs a calling agent whose session can show the plan`);
			const interaction = ctx.get('userQuestions');
			if (interaction === undefined) throw new Error('no user-question channel is available to show the plan; ask the user in a message instead');
			let answer;
			try {
				answer = await interaction.ask({
					questions: [{
						id: REVIEW_ID,
						header: 'Plan review',
						question: 'Approve this plan and carry it out?',
						detail: plan,
						options: [{
							label: APPROVE_LABEL,
						}],
						intent: {
							kind: 'plan-review',
							approve: APPROVE_LABEL,
						},
					}],
					agent,
					signal: exec.signal,
				});
			} catch (cause) {
				if (isCancelled(cause)) {
					exec.concludeTurn();
					return { approved: false };
				}
				throw cause;
			}
			const items = answer.answers.filter((item) => item.id === REVIEW_ID);
			const item = items.length === 1 ? items[0] : undefined;
			if (item !== undefined && item.selected.length === 1 && item.selected[0] === APPROVE_LABEL && item.custom === undefined) {
				return { approved: true };
			}
			const feedback = item?.custom?.trim();
			return feedback === undefined || feedback === '' ? { approved: false } : { approved: false, feedback };
		},
		presentCall(args) {
			if (typeof args?.plan !== 'string') return undefined;
			return {
				card: 'generic',
				title: firstHeading(args.plan) ?? TOOL_NAME,
				kind: 'other',
				content: [{ type: 'text', text: args.plan }],
			};
		},
	};
	ctx.effect(() => ctx.tools.register(tool), 'present-plan: register present_plan');
}
