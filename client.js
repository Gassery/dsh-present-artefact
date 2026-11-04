/**
 * Client half of `dsh-present-artefact`.
 *
 * Three pieces, all on public Client APIs:
 *
 *   - `PendingObserver` sits in `conversation.composer.dock` and watches the
 *     Chat nodes. While a `present_artefact` call is dispatched and unanswered
 *     it publishes an `artefact-review` pending interaction; when the call
 *     settles it unpublishes, which hands the composer back.
 *   - `ArtefactReview` is a `conversation.composer` chain entry elected only for
 *     that interaction, so the review takes over the composer exactly like the
 *     shipped plan review does, and opens the full text by itself.
 *   - `ArtefactRow` keeps the transcript row honest: one compact line, no
 *     duplicate controls.
 *
 * The full text is never rendered here. Inline artefacts open the shipped
 * temporary review preview (`dsh-resource://plan-review/…` with `planReview`
 * parameters), the same `MarkdownText` pane `exit_plan_mode` uses; file
 * artefacts open the shipped `dsh-resource://file/…` preview, which picks a
 * renderer by extension.
 */
window.__ModuleLoader__.load({
  id: 'dsh-present-artefact',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'presentArtefact';
    const TOOL_NAME = 'present_artefact';
    const KIND = 'artefact-review';

    const DICT = {
      en: {
        banner: 'Artefact review',
        approve: 'Approve',
        revise: 'Request changes',
        full: 'View full text',
        approved: 'Approved.',
        revised: 'Changes requested.',
        failed: 'Could not send the answer.',
        artefact: 'Artefact',
        pending: 'Preparing the artefact…',
        waiting: 'Waiting for your review',
      },
      zh: {
        banner: '产物待审',
        approve: '同意',
        revise: '要求修改',
        full: '查看全文',
        approved: '已同意。',
        revised: '已要求修改。',
        failed: '提交失败。',
        artefact: '产物',
        pending: '产物准备中…',
        waiting: '等待你的评审',
      },
    };

    /** Encode one path segment, keeping `:` literal for drive letters. */
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':');
    }

    /** Build the shipped file-preview address for one session path. */
    function fileAddress(sessionId, path) {
      const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
      return `dsh-resource://file/session/${encodeSegment(sessionId)}/${normalized.split('/').map(encodeSegment).join('/')}`;
    }

    /** Build the shipped temporary review preview address for one call. */
    function reviewAddress(sessionId, callId) {
      return `dsh-resource://plan-review/${encodeSegment(sessionId)}/${encodeSegment(callId)}`;
    }

    /** First non-heading paragraph of a markdown body, for the card summary. */
    function firstParagraph(body) {
      if (typeof body !== 'string') return '';
      for (const paragraph of body.split(/\n\s*\n/)) {
        const text = paragraph
          .split('\n')
          .filter((line) => !/^\s{0,3}#{1,6}\s/.test(line))
          .join(' ')
          .trim();
        if (text !== '') return text.length > 240 ? `${text.slice(0, 240)}…` : text;
      }
      return '';
    }

    /** Model-facing result text of a settled call, as one string. */
    function resultText(block) {
      if (block === undefined || !Array.isArray(block.content)) return '';
      return block.content
        .filter((part) => part !== null && typeof part === 'object' && part.type === 'text')
        .map((part) => part.text)
        .join(' ');
    }

    /** Read the decision out of the machine-readable result the Host returns. */
    function decisionOf(text) {
      try {
        const value = JSON.parse(text);
        return value !== null && typeof value === 'object' && (value.decision === 'agree' || value.decision === 'revise') ? value.decision : undefined;
      } catch {
        return undefined;
      }
    }

    /**
     * Find the newest dispatched, unanswered `present_artefact` call. Tool calls
     * are nested under their step, so this walks every materialized node rather
     * than the top-level key order.
     *
     * @param nodes - Chat node store.
     * @returns the call block, or undefined.
     */
    function findPendingRoot(nodes) {
      let found;
      let anchor = -1;
      for (const node of nodes.values()) {
        if (node === null || node.kind !== 'tool-call') continue;
        const root = node.data === undefined ? undefined : node.data.root;
        if (root === undefined || root.name !== TOOL_NAME || root.phase !== 'start') continue;
        if (typeof node.anchorSeq === 'number' && node.anchorSeq < anchor) continue;
        anchor = typeof node.anchorSeq === 'number' ? node.anchorSeq : anchor;
        found = root;
      }
      return found;
    }

    /** Inline styles; type sizes and spacing follow the shipped review card. */
    const styles = {
      frame: {
        display: 'flex',
        justifyContent: 'center',
        padding: '6px calc(var(--dsh-composer-side-clearance, 16px) + 16px) 10px',
      },
      card: {
        width: '100%',
        maxWidth: 'var(--dsh-composer-card-max-width, 752px)',
        border: '1px solid var(--dsw-alias-border-l2, #3a3a3a)',
        borderRadius: '12px',
        background: 'var(--dsw-specific-input-major, #1f1f1f)',
        color: 'var(--dsw-alias-label-primary, #eee)',
        padding: '12px 14px',
      },
      banner: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '14px',
        lineHeight: '20px',
        color: 'var(--dsw-alias-label-secondary, #aaa)',
        marginBottom: '8px',
      },
      dot: { width: '8px', height: '8px', borderRadius: '999px', background: 'var(--dsw-alias-state-warn-primary, #d8a03d)', flex: '0 0 auto' },
      title: { margin: '0 0 6px', fontSize: '15px', lineHeight: '22px', fontWeight: 500 },
      summary: {
        margin: 0,
        fontSize: '14px',
        lineHeight: '24px',
        color: 'var(--dsw-alias-label-secondary, #bbb)',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      },
      footer: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' },
      ghost: {
        border: '1px solid var(--dsw-alias-border-l2, #444)',
        background: 'transparent',
        color: 'inherit',
        borderRadius: '8px',
        padding: '6px 14px',
        cursor: 'pointer',
        fontSize: '14px',
        lineHeight: '22px',
      },
      primary: {
        border: '1px solid transparent',
        background: 'var(--dsw-alias-state-business-primary, #4169e1)',
        color: '#fff',
        borderRadius: '8px',
        padding: '6px 14px',
        cursor: 'pointer',
        fontSize: '14px',
        lineHeight: '22px',
      },
      link: {
        marginLeft: 'auto',
        border: 'none',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary, #aaa)',
        cursor: 'pointer',
        fontSize: '14px',
        lineHeight: '20px',
        padding: 0,
      },
      error: { color: 'var(--dsw-alias-state-error-primary, #e06c75)', fontSize: '14px', lineHeight: '20px', marginTop: '8px' },
      row: {
        fontSize: '14px',
        lineHeight: '24px',
        color: 'var(--dsw-alias-label-secondary, #aaa)',
        padding: '2px 0',
      },
    };

    /**
     * Publish one pending interaction per unanswered review, and withdraw it the
     * moment the call settles.
     *
     * @param props - dock slot props plus the publisher and translator.
     * @returns nothing; this seat only keeps the registry in sync.
     */
    function PendingObserver({ sessionId, useChat, publish, t }) {
      const nodes = useChat((snapshot) => snapshot.nodes);
      // A scalar selector: it re-renders only when the pending call identity
      // changes, while every store notification still re-evaluates it.
      const callId = useChat((snapshot) => {
        const root = findPendingRoot(snapshot.nodes);
        return root === undefined ? '' : root.callId;
      });

      React.useEffect(() => {
        if (callId === '') return undefined;
        const root = findPendingRoot(nodes);
        if (root === undefined) return undefined;
        const args = root.args;
        const carrier = {
          key: `${TOOL_NAME}:${root.callId}`,
          kind: KIND,
          sessionId,
          callId: root.callId,
          title: args.text('title'),
          summary: args.text('summary'),
          body: args.text('body'),
          path: args.text('path'),
        };
        const unpublish = publish(carrier, async () => {});
        return () => unpublish();
      }, [callId, nodes, publish, sessionId, t]);

      return null;
    }

    /**
     * The review card, elected into the composer seat.
     *
     * @param props - chain owner props; `matched` carries the published carrier.
     * @returns the review, or nothing when the carrier is gone.
     */
    function ArtefactReview({ matched, sessionId, t, openTab }) {
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const title = matched.title !== undefined && matched.title !== '' ? matched.title : t('artefact');
      const summary = matched.summary !== undefined && matched.summary !== '' ? matched.summary : firstParagraph(matched.body);

      // The shipped plan review opens its full text as soon as the card mounts;
      // this does the same, once per review.
      const autoOpened = React.useRef(false);
      React.useEffect(() => {
        if (autoOpened.current) return;
        autoOpened.current = true;
        if (typeof matched.body === 'string' && matched.body !== '') {
          openTab(reviewAddress(sessionId, matched.callId), { params: { planReview: { markdown: matched.body, title } } });
          return;
        }
        if (typeof matched.path === 'string' && matched.path !== '') openTab(fileAddress(sessionId, matched.path));
      }, [matched.callId, matched.body, matched.path, openTab, sessionId, title]);

      const answer = (decision) => {
        setBusy(true);
        setError(null);
        fetch('api/present-artefact/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ callId: matched.callId, decision }),
        })
          .then(async (response) => {
            const value = await response.json().catch(() => ({}));
            if (!response.ok || value.ok !== true) throw new Error(value.error ?? String(response.status));
          })
          .catch(() => {
            setBusy(false);
            setError(t('failed'));
          });
      };

      return h(
        'div',
        { style: styles.frame },
        h(
          'div',
          { style: styles.card, 'data-present-artefact': matched.callId },
          h(
            'div',
            { style: styles.banner },
            h('span', { style: styles.dot }),
            h('span', null, t('banner')),
            (typeof matched.body === 'string' || (typeof matched.path === 'string' && matched.path !== '')) &&
              h(
                'button',
                {
                  type: 'button',
                  style: styles.link,
                  onClick: () => {
                    if (typeof matched.body === 'string' && matched.body !== '') {
                      openTab(reviewAddress(sessionId, matched.callId), { params: { planReview: { markdown: matched.body, title } } });
                      return;
                    }
                    if (typeof matched.path === 'string' && matched.path !== '') openTab(fileAddress(sessionId, matched.path));
                  },
                },
                `${t('full')} ›`,
              ),
          ),
          h('h3', { style: styles.title }, title),
          summary !== '' && h('p', { style: styles.summary }, summary),
          h(
            'div',
            { style: styles.footer },
            h('button', { type: 'button', style: styles.ghost, disabled: busy, onClick: () => answer('revise') }, t('revise')),
            h('button', { type: 'button', style: styles.primary, disabled: busy, onClick: () => answer('agree') }, t('approve')),
          ),
          error !== null && h('div', { style: styles.error }, error),
        ),
      );
    }

    /**
     * One compact transcript line: the pending state, then the recorded outcome.
     * The actionable card lives in the composer, not here.
     *
     * @param props - tool view owner props.
     * @returns the row, or nothing before the call is dispatched.
     */
    function ArtefactRow({ phase, block, t }) {
      if (phase === 'preparing') return h('div', { style: styles.row }, t('pending'));
      if (phase === 'start') return h('div', { style: styles.row }, t('waiting'));
      const decision = decisionOf(resultText(block));
      const outcome = decision === 'agree' ? t('approved') : decision === 'revise' ? t('revised') : block.isError === true ? t('failed') : resultText(block);
      return h('div', { style: styles.row }, outcome);
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'uiSession'],
      apply(ctx) {
        // A package namespace outside the shipped LocaleNamespaceMap registers
        // one locale at a time.
        ctx.effect(() => {
          const disposers = [ctx.locale.register(NS, 'en', DICT.en), ctx.locale.register(NS, 'zh', DICT.zh)];
          return () => {
            for (const dispose of disposers) dispose();
          };
        }, 'present-artefact: dictionaries');
        const t = ctx.locale.bind(NS);
        const openTab = (address, options) => ctx.sidebarRight.openResource(address, options);

        const publish = ctx.uiSession.registerPendingInteraction((interaction) => (interaction.kind === KIND ? 3 : -1));

        ctx.slots.inject('conversation.composer.dock', () =>
          ctx.slots.register({ name: 'conversation.composer.dock', id: 'dsh-present-artefact', order: 50 }, (props) =>
            h(PendingObserver, { ...props, publish, t }),
          ),
        );

        ctx.slots.inject('conversation.composer', () =>
          ctx.slots.register(
            {
              name: 'conversation.composer',
              locale: NS,
              select: ({ pendingInteraction }) => (pendingInteraction !== undefined && pendingInteraction !== null && pendingInteraction.kind === KIND ? pendingInteraction : null),
            },
            (props) => h(ArtefactReview, { ...props, openTab, t }),
          ),
        );

        ctx.slots.inject('tool.call.toolview', () =>
          ctx.slots.register({ name: 'tool.call.toolview', key: TOOL_NAME, locale: NS }, ArtefactRow),
        );
      },
    };
  },
});
