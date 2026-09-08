import { SECTIONS, PROFILE } from './content.js';

/**
 * Builds the reading sidebar from `content.js` and wires everything that opens or
 * closes it — a dock button, the back button, Escape.
 *
 * The panels are built once at startup rather than per open: there are nine of them,
 * they are small, and having them all in the DOM is what lets the CSS transition one
 * in while another goes out. Only one carries `is-open` at a time.
 *
 * Every node is created through `el()` rather than `innerHTML`. The copy is ours, but
 * a résumé is exactly the sort of file that later gets fed from a CMS or a JSON blob,
 * and a renderer that cannot inject markup stays safe when that happens.
 */

export function setupPanels({ order, container, onOpen, onClose }) {
  const panels = {};

  for (const key of order) {
    const section = SECTIONS[key];
    if (!section) {
      console.warn(`[resume] no content for section "${key}"`);
      continue;
    }
    const panel = renderSection(section);
    panel.dataset.panel = key;
    container.appendChild(panel);
    panels[key] = panel;
  }

  let openKey = null;

  const show = (key) => {
    for (const panel of Object.values(panels)) panel.classList.remove('is-open');
    openKey = key && panels[key] ? key : null;
    return openKey;
  };

  /** Reveals a panel partway through the flight, so panel and camera read as one move. */
  const reveal = (key) => {
    if (panels[key]) panels[key].classList.add('is-open');
  };

  /** The open panel's width, which the camera's lens shift is sized from. */
  const widthOf = (key) => (panels[key] ? panels[key].getBoundingClientRect().width : 0);

  document.addEventListener('click', (event) => {
    const opener = event.target.closest?.('[data-open]');
    if (opener) {
      event.preventDefault();
      onOpen(opener.getAttribute('data-open'));
      return;
    }
    if (event.target.closest?.('[data-close]')) {
      event.preventDefault();
      onClose();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openKey) onClose();
  });

  return { show, reveal, widthOf, panels, get openKey() { return openKey; } };
}

/* ------------------------------------------------------------------ rendering */

function renderSection(section) {
  const panel = el('article', 'panel');
  panel.append(
    el('div', 'panel-eyebrow', `${section.number} — ${section.eyebrow}`),
    el('h2', 'panel-title', section.title)
  );
  for (const block of section.blocks) {
    const node = BLOCKS[block.kind]?.(block);
    if (node) panel.append(node);
    else console.warn(`[resume] unknown block kind "${block.kind}"`);
  }
  return panel;
}

const BLOCKS = {
  text: (block) => {
    const frag = document.createDocumentFragment();
    for (const paragraph of block.paragraphs) frag.append(el('p', 'panel-text', paragraph));
    return frag;
  },

  intro: (block) => el('p', 'panel-intro', block.text),

  footnote: (block) => el('p', 'panel-footnote', block.text),

  note: (block) => {
    const p = el('p', 'panel-note', block.text);
    if (block.link) p.append(link(block.link.href, block.link.label));
    return p;
  },

  stats: (block) => {
    const grid = el('div', 'stat-grid');
    for (const cell of block.cells) {
      const box = el('div', 'stat-cell');
      box.append(
        el('div', 'stat-label', cell.label),
        el('div', `stat-value${cell.accent ? ' is-accent' : ''}`, cell.value)
      );
      grid.append(box);
    }
    return grid;
  },

  timeline: (block) => {
    const list = el('div', 'timeline');
    for (const item of block.items) {
      const entry = el('div', 'timeline-item');
      entry.append(
        el('div', 'timeline-date', item.date),
        el('h3', 'timeline-role', item.role),
        el('div', 'timeline-org', item.org)
      );
      if (item.tags) entry.append(tagRow(item.tags));
      const points = el('ul', 'timeline-list');
      for (const point of item.points) points.append(el('li', '', point));
      entry.append(points);
      list.append(entry);
    }
    return list;
  },

  skills: (block) => {
    const list = el('div', 'skill-list');
    for (const group of block.groups) {
      const box = el('div', 'skill-group');
      box.append(el('div', 'skill-group-title', group.title), tagRow(group.tags));
      list.append(box);
    }
    return list;
  },

  cards: (block) => {
    const list = el('div', 'card-list');
    for (const item of block.items) {
      const card = el('div', 'card');
      if (item.meta) card.append(el('div', 'card-meta', item.meta));
      card.append(el('h3', 'card-title', item.title));
      if (item.tags) card.append(tagRow(item.tags));
      if (item.desc) card.append(el('p', 'card-desc', item.desc));
      list.append(card);
    }
    return list;
  },

  rows: (block) => {
    const list = el('div', 'row-list');
    for (const item of block.items) {
      const row = el('a', 'row');
      row.href = item.href;
      row.append(el('div', 'row-meta', item.meta), el('div', 'row-title', item.title));
      list.append(row);
    }
    return list;
  },

  quotes: (block) => {
    const list = el('div', 'quote-list');
    for (const item of block.items) {
      const quote = el('blockquote', 'quote-card');
      quote.append(el('p', 'quote-text', `“${item.text}”`), el('footer', 'quote-attrib', item.attrib));
      list.append(quote);
    }
    return list;
  },

  meta: (block) => {
    const list = el('div', 'row-list');
    for (const [label, value] of block.rows) {
      const row = el('div', 'meta-row');
      row.append(el('span', 'meta-label', label), el('span', '', value));
      list.append(row);
    }
    return list;
  },

  links: (block) => {
    const list = el('div', 'row-list');
    for (const item of block.items) {
      const row = el('a', 'meta-row is-link');
      row.href = item.href;
      if (item.external) {
        row.target = '_blank';
        // Without `noopener` the opened tab can reach back through `window.opener`.
        row.rel = 'noopener noreferrer';
      }
      row.append(el('span', 'meta-label', item.label), el('span', '', item.value));
      list.append(row);
    }
    return list;
  },

  download: (block) => {
    const a = el('a', 'btn', block.label);
    a.href = block.href;
    a.setAttribute('download', block.filename);
    return a;
  },

  contactForm: () => {
    const form = el('form', 'contact-form');
    const name = field(form, 'c-name', 'Your name', 'input', { type: 'text', placeholder: 'Name' });
    const from = field(form, 'c-from', 'Your email', 'input', {
      type: 'email',
      placeholder: 'you@company.com',
    });
    const message = field(form, 'c-msg', 'Message', 'textarea', {
      rows: 4,
      placeholder: 'What are you building?',
    });

    const send = el('button', 'btn', 'Send message');
    send.type = 'submit';
    form.append(send, el('p', 'form-note', 'Opens your mail client with the message prefilled.'));

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const signature = `\n\n— ${name.value}${from.value ? ` (${from.value})` : ''}`;
      const subject = encodeURIComponent(`Hello from your site — ${name.value}`);
      const body = encodeURIComponent(message.value + signature);
      window.location.href = `mailto:${PROFILE.email}?subject=${subject}&body=${body}`;
    });

    return form;
  },
};

/* -------------------------------------------------------------------- helpers */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function link(href, label) {
  const a = el('a', '', label);
  a.href = href;
  return a;
}

function tagRow(tags) {
  const row = el('div', 'tag-row');
  for (const tag of tags) row.append(el('span', 'tag', tag));
  return row;
}

function field(form, id, label, tag, attrs) {
  const wrap = el('div', 'field');
  const labelEl = el('label', '', label);
  labelEl.htmlFor = id;
  const input = el(tag, 'input');
  input.id = id;
  for (const [key, value] of Object.entries(attrs)) input[key] = value;
  wrap.append(labelEl, input);
  form.append(wrap);
  return input;
}
