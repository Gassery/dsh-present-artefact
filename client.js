/**
 * Client half of `dsh-present-artefact`.
 *
 * Two seats, no forks of shipped UI:
 *   - `tool.call.toolview` keyed by the tool name renders the review card where
 *     the call appears. It reads the call's own arguments, so the artefact body
 *     survives a reload without touching the filesystem.
 *   - `sidebar.right.pane.tab` keyed by this package renders inline artefacts
 *     full width. File artefacts are not rendered here: their address goes to
 *     the shipped document preview, which already handles pdf, Office, Excel,
 *     images, code and plain text.
 *
 * Factories stay side-effect free; every registration happens inside `apply`
 * and is owned by `ctx.effect`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-present-artefact',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'presentArtefact';
    const TAB_ID = 'dsh-present-artefact';
    const TAB_KIND = 'artefact';
    const SCHEME = 'dsh-resource://artefact/session/';

    const DICT = {
      en: {
        banner: 'Artefact review',
        approve: 'Approve',
        revise: 'Request changes',
        full: 'View full text',
        approved: 'Approved.',
        revised: 'Changes requested.',
        failed: 'Could not send the answer.',
        closed: 'This review is no longer open.',
        artefact: 'Artefact',
        pending: 'Preparing the artefact…',
      },
      zh: {
        banner: '产物待审',
        approve: '同意',
        revise: '要求修改',
        full: '查看全文',
        approved: '已同意。',
        revised: '已要求修改。',
        failed: '提交失败。',
        closed: '这条评审已经结束。',
        artefact: '产物',
        pending: '产物准备中…',
      },
    };

    /** Encode one path segment, keeping `:` literal for drive letters. */
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':');
    }

    /** Build the shipped file-preview address for one session path. */
    function fileAddress(sessionId, path) {
      const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
      return `dsh-resource://file/session/${encodeSegment(sessionId)}/${normalized
        .split('/')
        .map(encodeSegment)
        .join('/')}`;
    }

    /** Build this package's inline-artefact address for one call. */
    function artefactAddress(sessionId, callId) {
      return `${SCHEME}${encodeSegment(sessionId)}/${encodeSegment(callId)}`;
    }

    /** First non-heading paragraph of a markdown body, for the card summary. */
    function firstParagraph(body) {
      if (typeof body !== 'string') return '';
      const paragraphs = body.split(/\n\s*\n/);
      for (const paragraph of paragraphs) {
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

    /** Inline styles shared by the card and its controls. */
    const styles = {
      card: {
        border: '1px solid var(--dsw-alias-border-l2, #3a3a3a)',
        borderRadius: '12px',
        background: 'var(--dsw-specific-input-major, #1f1f1f)',
        color: 'var(--dsw-alias-label-primary, #eee)',
        padding: '12px 14px',
        margin: '6px 0',
        maxWidth: '720px',
      },
      banner: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        color: 'var(--dsw-alias-label-secondary, #aaa)',
        marginBottom: '6px',
      },
      dot: {
        width: '8px',
        height: '8px',
        borderRadius: '999px',
        background: 'var(--dsw-alias-state-warn-primary, #d8a03d)',
        flex: '0 0 auto',
      },
      title: { margin: '0 0 4px', fontSize: '15px', fontWeight: 600 },
      summary: {
        margin: 0,
        fontSize: '13px',
        lineHeight: '20px',
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
        padding: '6px 12px',
        cursor: 'pointer',
        fontSize: '13px',
      },
      primary: {
        border: '1px solid transparent',
        background: 'var(--dsw-alias-state-business-primary, #4169e1)',
        color: '#fff',
        borderRadius: '8px',
        padding: '6px 12px',
        cursor: 'pointer',
        fontSize: '13px',
      },
      link: {
        marginLeft: 'auto',
        border: 'none',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary, #aaa)',
        cursor: 'pointer',
        fontSize: '12px',
        padding: 0,
      },
      error: { color: 'var(--dsw-alias-state-error-primary, #e06c75)', fontSize: '12px', marginTop: '6px' },
      preview: {
        height: '100%',
        overflow: 'auto',
        padding: '18px 22px',
        fontSize: '14px',
        lineHeight: '24px',
        color: 'var(--dsw-alias-label-primary, #eee)',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      },
    };

    /**
     * The review card at the tool call position.
     *
     * @param props - Tool view owner props plus the routed phase block.
     * @returns the card for the current phase.
     */
    function ArtefactCard(props) {
      const { phase, block, callId, sessionId, openTab, t } = props;
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);

      const args = block === undefined || block === null ? undefined : block.args;
      const title = args === undefined ? undefined : args.text('title');
      const body = args === undefined ? undefined : args.text('body');
      const path = args === undefined ? undefined : args.text('path');
      const summaryArg = args === undefined ? undefined : args.text('summary');
      const summary = summaryArg !== undefined && summaryArg.trim() !== '' ? summaryArg : firstParagraph(body);

      const settled = phase === 'result';
      const result = settled ? resultText(block) : '';

      const openFull = () => {
        if (path !== undefined && path !== '') {
          props.openFile === undefined ? openTab(fileAddress(sessionId, path)) : props.openFile(path);
          return;
        }
        if (body !== undefined) {
          openTab(artefactAddress(sessionId, callId), { params: { artefact: { markdown: body, title: title ?? '' } } });
        }
      };

      const answer = (decision) => {
        setBusy(true);
        setError(null);
        fetch('api/present-artefact/answer', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ callId, decision }),
        })
          .then(async (response) => {
            const value = await response.json().catch(() => ({}));
            if (!response.ok || value.ok !== true) throw new Error(value.error ?? String(response.status));
          })
          .catch((cause) => {
            setBusy(false);
            setError(cause instanceof Error ? cause.message : String(cause));
          });
      };

      if (phase === 'preparing') {
        return h('div', { style: styles.card }, h('div', { style: styles.banner }, h('span', { style: styles.dot }), t('banner')), h('p', { style: styles.summary }, t('pending')));
      }

      return h(
        'div',
        { style: styles.card, 'data-present-artefact': callId },
        h(
          'div',
          { style: styles.banner },
          h('span', { style: styles.dot }),
          h('span', null, t('banner')),
          (body !== undefined || (path !== undefined && path !== '')) &&
            h('button', { type: 'button', style: styles.link, onClick: openFull }, `${t('full')} ›`),
        ),
        h('h3', { style: styles.title }, title ?? t('artefact')),
        summary !== '' && h('p', { style: styles.summary }, summary),
        settled
          ? h('p', { style: styles.summary }, result)
          : h(
              'div',
              { style: styles.footer },
              h('button', { type: 'button', style: styles.ghost, disabled: busy, onClick: () => answer('revise') }, t('revise')),
              h('button', { type: 'button', style: styles.primary, disabled: busy, onClick: () => answer('agree') }, t('approve')),
            ),
        error !== null && h('div', { style: styles.error }, `${t('failed')} ${error}`),
      );
    }

    /**
     * Full-width inline artefact body in the right sidebar.
     *
     * @param props - tab identity hooks.
     * @returns the markdown text, or a closed notice when the tab lost its parameters.
     */
    function ArtefactPreview({ useTabInfo, t }) {
      const info = useTabInfo();
      const params = info?.tab?.navigation?.params;
      const doc = params !== undefined && params !== null && params.artefact !== undefined ? params.artefact : undefined;
      if (doc === undefined || typeof doc.markdown !== 'string') {
        return h('div', { style: styles.preview }, t('closed'));
      }
      return h(
        'div',
        { style: styles.preview, 'data-present-artefact-preview': true },
        h('h2', { style: { margin: '0 0 12px', fontSize: '18px' } }, doc.title ?? t('artefact')),
        doc.markdown,
      );
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT), 'present-artefact: dictionaries');
        const t = ctx.locale.bind(NS);

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          patterns: [`${SCHEME}**`],
          title: () => t('artefact'),
        }), 'present-artefact: sidebar tab type');

        const openTab = (address, options) => ctx.sidebarRight.openResource(address, options);

        ctx.slots.inject('tool.call.toolview', () =>
          ctx.slots.register(
            { name: 'tool.call.toolview', key: 'present_artefact', locale: NS },
            (props) => h(ArtefactCard, { ...props, openTab, t }),
          ),
        );

        ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, (props) => h(ArtefactPreview, { ...props, t })),
        );
      },
    };
  },
});
