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
 * The card is the shipped plan review down to the pixel: the same
 * `PlanReviewPanel` structure, the same stylesheet values, and the same
 * primitives (Button, StateDot, chevron and pencil icons). Only the data
 * wiring differs — this review lives in a tool call, not a user question.
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
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const Button = primitives.Button;
    const StateDot = primitives.StateDot;
    const IconChevronRightOutlineRegular = primitives.IconChevronRightOutlineRegular;
    const IconEditOutlineRegular = primitives.IconEditOutlineRegular;
    const FileTypeIcon = primitives.FileTypeIcon;
    const classifyFileType = primitives.classifyFileType;

    const NS = 'presentArtefact';
    const TOOL_NAME = 'present_artefact';
    const KIND = 'artefact-review';

    const DICT = {
      en: {
        banner: 'Artefact review',
        approve: 'Approve',
        revise: 'Request changes',
        full: 'View full text',
        open: 'Open',
        openAria: 'Open the artefact in the sidebar',
        file: 'File',
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
        open: '打开',
        openAria: '在侧边栏打开产物',
        file: '文件',
        approved: '已同意。',
        revised: '已要求修改。',
        failed: '提交失败。',
        artefact: '产物',
        pending: '产物准备中…',
        waiting: '等待你的评审',
      },
    };

    /**
     * The card's stylesheet, copied value for value from the shipped plan
     * review (`dsh-client-ui-user-questions` `PlanReviewPanel.module.css`) and
     * from the shipped `reviewLink` in `dsh-client-ui-plan`. Only the class
     * prefix is local, so a future change to the shipped card is a diff away.
     */
    const CSS = [
      '.pa_frame{padding:6px calc(var(--dsh-composer-side-clearance) + 16px) 10px;justify-content:center;display:flex}',
      '.pa_card{width:100%;max-width:var(--dsh-chat-content-width);--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xl);background:var(--dsw-specific-input-major);box-shadow:var(--dsw-elevation-panel);color:var(--dsw-alias-label-primary);border:0;flex-direction:column;display:flex;overflow:hidden}',
      '.pa_card,.pa_card *{box-sizing:border-box}',
      '.pa_strip{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-state-warn-primary);flex-shrink:0;align-items:center;gap:8px;padding:12px 16px;font-size:14px;line-height:20px;display:flex}',
      '.pa_footer{flex-shrink:0;justify-content:space-between;align-items:center;gap:12px;padding:8px 16px 12px;display:flex}',
      '.pa_feedback{min-height:16px;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px}',
      '.pa_actions{flex-shrink:0;align-items:center;gap:8px;display:flex}',
      '.pa_summary{min-width:0;padding:14px 16px 12px}',
      '.pa_title{text-overflow:ellipsis;white-space:nowrap;margin:0;font-size:15px;font-weight:500;line-height:22px;overflow:hidden}',
      '.pa_description{-webkit-line-clamp:2;color:var(--dsw-alias-label-secondary);-webkit-box-orient:vertical;margin:8px 0 0;font-size:14px;line-height:24px;display:-webkit-box;overflow:hidden}',
      '.pa_discuss{gap:6px}',
      '.pa_previewActions{align-items:center;margin-left:auto;display:flex}',
      '.pa_reviewLink{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;align-items:center;gap:4px;padding:0;display:inline-flex}',
      '.pa_reviewLink:hover{color:var(--dsw-alias-label-primary)}',
      '.pa_reviewLink:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:3px}',
      '@media (width<=720px){.pa_card{border-radius:var(--dsw-radius-xl)}.pa_footer{align-items:flex-end;padding:8px 12px 10px}}',
      '.pa_row{display:flex;align-items:center;gap:8px;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));color:var(--dsw-alias-label-tertiary);padding:2px 0}',
      '.pa_rowError{color:var(--dsw-alias-state-error-primary)}',
      '.pa_records{flex-direction:column;gap:10px;display:flex}',
      '.pa_record{--pa-record-fill:var(--dsw-static-neutral-50);--pa-record-hover:var(--dsw-static-neutral-100);box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--pa-record-fill);width:100%;min-width:0;height:60px;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;align-items:center;gap:10px;margin:0;padding:8px 10px;transition:background-color .12s;display:flex}',
      'body[data-ds-dark-theme] .pa_record{--pa-record-fill:var(--dsw-static-neutral-850);--pa-record-hover:var(--dsw-static-neutral-800)}',
      '.pa_record:hover{background:var(--pa-record-hover)}',
      '.pa_record:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:3px}',
      '.pa_recordIcon{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-static-neutral-00) 50%, transparent);border-radius:10px;flex:none;place-items:center;width:40px;height:40px;display:grid}',
      'body[data-ds-dark-theme] .pa_recordIcon{background:color-mix(in srgb, var(--dsw-static-neutral-00) 5%, transparent)}',
      '.pa_recordDetails{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}',
      '.pa_recordTitle{text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}',
      '.pa_recordDescription{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:16px;overflow:hidden}',
      '.pa_recordOpen{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-button-floating-fill);flex:none;align-items:center;height:28px;padding:4px 8px;font-size:12px;line-height:18px;display:inline-flex}',
    ].join('');

    const CSS_TAG_ID = 'dsh-present-artefact/PresentArtefact.module.css';
    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css=${JSON.stringify(CSS_TAG_ID)}]`) === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-present-artefact';
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

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

    /** Open the artefact's full text in the right sidebar, whichever carrier it has. */
    function openFull(review, sessionId, openTab) {
      if (typeof review.body === 'string' && review.body !== '') {
        openTab(reviewAddress(sessionId, review.callId), {
          params: { planReview: { markdown: review.body, title: review.title } },
        });
        return;
      }
      if (typeof review.path === 'string' && review.path !== '') openTab(fileAddress(sessionId, review.path));
    }

    /**
     * The review card, elected into the composer seat.
     *
     * Mirrors the shipped plan review: warn strip with a state dot and the
     * "view full text" link, a title over a two-line description, and the
     * outline/primary decision pair.
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
        openFull({ ...matched, title }, sessionId, openTab);
      }, [matched, sessionId, openTab, title]);

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
        { className: 'pa_frame', 'data-present-artefact': matched.callId },
        h(
          'section',
          {
            className: 'pa_card',
            'aria-label': title,
            'aria-busy': busy,
          },
          h(
            'div',
            { className: 'pa_strip' },
            h(StateDot, { state: busy ? 'ongoing' : 'warning' }),
            h('span', null, t('banner')),
            h(
              'div',
              { className: 'pa_previewActions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'pa_reviewLink',
                  title: t('openAria'),
                  'aria-label': t('openAria'),
                  onClick: () => openFull({ ...matched, title }, sessionId, openTab),
                },
                t('full'),
                h(IconChevronRightOutlineRegular, { size: 14 }),
              ),
            ),
          ),
          h(
            'div',
            { className: 'pa_summary' },
            h('h3', { className: 'pa_title' }, title),
            summary !== '' && h('p', { className: 'pa_description' }, summary),
          ),
          h(
            'div',
            { className: 'pa_footer' },
            h('div', { className: 'pa_feedback', role: 'status' }, error),
            h(
              'div',
              { className: 'pa_actions' },
              h(
                Button,
                {
                  variant: 'outline',
                  className: 'pa_discuss',
                  icon: h(IconEditOutlineRegular, { size: 14 }),
                  disabled: busy,
                  onClick: () => answer('revise'),
                },
                t('revise'),
              ),
              h(Button, { variant: 'primary', disabled: busy, onClick: () => answer('agree') }, t('approve')),
            ),
          ),
        ),
      );
    }

    /**
     * Open one artefact from its logged argument view.
     *
     * @param args - the call's argument reader.
     * @param callId - call identity for the inline preview address.
     * @param sessionId - owning Session.
     * @param openTab - sidebar navigation.
     * @param title - artefact title.
     * @returns whether anything opened.
     */
    function openArtefact(args, callId, sessionId, openTab, title) {
      const body = args === undefined ? undefined : args.text('body');
      if (typeof body === 'string' && body !== '') {
        openTab(reviewAddress(sessionId, callId), { params: { planReview: { markdown: body, title: title ?? '' } } });
        return true;
      }
      const path = args === undefined ? undefined : args.text('path');
      if (typeof path === 'string' && path !== '') {
        openTab(fileAddress(sessionId, path));
        return true;
      }
      return false;
    }

    /** Last path segment of a `path` argument, for the icon and the type label. */
    function basenameOf(path) {
      const normalized = typeof path === 'string' ? path.replace(/\\/g, '/') : '';
      return normalized.slice(normalized.lastIndexOf('/') + 1);
    }

    /** Upper-cased extension, or the localized word for a file without one. */
    function typeLabelOf(name, t) {
      const dot = name.lastIndexOf('.');
      return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : t('file');
    }

    /**
     * The settled artefact as the shipped plan card shows a submitted plan: a
     * file-type icon, the title over a short type line, and one open control.
     *
     * @param props - the settled call block, its Session, and navigation.
     * @returns the card list, or nothing when the call carries no artefact.
     */
    function ArtefactCard({ block, sessionId, t, openTab }) {
      const args = block === undefined ? undefined : block.args;
      const body = args === undefined ? undefined : args.text('body');
      const path = args === undefined ? undefined : args.text('path');
      const hasBody = typeof body === 'string' && body !== '';
      const hasPath = typeof path === 'string' && path !== '';
      if (!hasBody && !hasPath) return null;
      const title = (args.text('title') === undefined || args.text('title') === '' ? undefined : args.text('title')) ?? t('artefact');
      const name = hasBody ? '' : basenameOf(path);
      const kind = hasBody ? 'markdown' : classifyFileType(name);
      const label = hasBody ? 'Markdown' : typeLabelOf(name, t);
      return h(
        'div',
        { className: 'pa_records', 'data-artefact-cards': true },
        h(
          'button',
          {
            type: 'button',
            className: 'pa_record',
            'data-artefact-card': block.callId,
            'aria-label': `${t('banner')}: ${title}`,
            onClick: () => openArtefact(args, block.callId, sessionId, openTab, title),
          },
          h('span', { className: 'pa_recordIcon' }, h(FileTypeIcon, { kind, size: 20 })),
          h(
            'span',
            { className: 'pa_recordDetails' },
            h('span', { className: 'pa_recordTitle' }, title),
            h('span', { className: 'pa_recordDescription' }, `${t('artefact')} · ${label}`),
          ),
          h('span', { className: 'pa_recordOpen' }, t('open')),
        ),
      );
    }

    /**
     * The transcript row: the pending state while the review is open, then the
     * recorded outcome over the settled artefact card.
     *
     * @param props - tool view owner props.
     * @returns the row and card, or nothing before the call is dispatched.
     */
    function ArtefactRow({ phase, block, sessionId, t, openTab }) {
      if (phase === 'preparing') return h('div', { className: 'pa_row' }, t('pending'));
      if (phase === 'start') return h('div', { className: 'pa_row' }, t('waiting'));
      const decision = decisionOf(resultText(block));
      const failed = block.isError === true;
      const outcome = decision === 'agree' ? t('approved') : decision === 'revise' ? t('revised') : failed ? t('failed') : resultText(block);
      return h(
        'div',
        null,
        h('div', { className: 'pa_row' }, h('span', failed ? { className: 'pa_rowError' } : null, outcome)),
        h(ArtefactCard, { block, sessionId, t, openTab }),
      );
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
          ctx.slots.register({ name: 'tool.call.toolview', key: TOOL_NAME, locale: NS }, (props) => h(ArtefactRow, { ...props, openTab })),
        );
      },
    };
  },
});
