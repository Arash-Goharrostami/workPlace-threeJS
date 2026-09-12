/**
 * Every word the room says, as data. `panels.js` is the only thing that reads it —
 * nothing here knows about the DOM, so the copy can be edited without touching markup.
 *
 * The keys are the section ids: they are what `anchors.js` maps onto props, what the
 * dock buttons open, and what `panels.js` builds a sidebar from. Adding a section
 * means adding it in both files.
 *
 * A section marked `screen` is drawn on its own prop instead of in the sidebar.
 *
 * `blocks` is a small tagged union — each entry's `kind` picks the renderer in
 * `panels.js`. Anything it does not recognise is skipped rather than thrown, so a
 * half-written block cannot take the room down.
 */

export const PROFILE = {
  name: 'Arash Goharrostami',
  role: 'Software Engineer',
  blurb:
    'Software Engineer — full-stack and backend systems. Five years building scalable ' +
    'web, mobile and real-time services. Tehran, Iran.',
  email: 'arash.goharrostami@gmail.com',
};

/** Where `panels.js` looks for the CV. Drop the file in `public/cv/` to arm the button. */
export const CV_URL = 'cv/Arash-Goharrostami.pdf';

/** The name the browser saves it under. */
export const CV_FILENAME = 'Arash-Goharrostami-CV.pdf';

/** The pool the pad's notes are drawn from — one line each, as they would be jotted. */
const JOTS = [
  'check nginx keepalive on the edge box',
  'why does the socket count spike at 03:00?',
  'rotate the staging certs before Friday',
  'read the k8s HPA docs properly this time',
  'move the queue consumers to their own pod',
  'p95 is the number that matters, not the mean',
  'ask about the RabbitMQ prefetch setting',
  'write the post about the 65% latency cut',
  'coffee — then the migration',
  'types first, then the feature',
  'the cache is lying. verify TTLs',
  'fix the flaky e2e on the login flow',
  'try Bun for the build script',
  'backup the home server. actually do it',
  'guitar — 20 min, no excuses',
  'idea: draw the desk in three.js',
];

/** How many lines land on the pad, and how many of those are crossed off. */
const JOT_COUNT = 8;
const JOT_DONE = [2, 3];

/**
 * A different page of notes each visit: the pool shuffled, the first few taken, and two
 * or three of them struck through. Decided once, here, when the module loads — the
 * page is measured and painted in separate passes, and both have to see the same lines.
 */
function jots() {
  const pool = [...JOTS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const lines = pool.slice(0, JOT_COUNT).map((text) => ({ text, done: false }));
  const done = JOT_DONE[0] + Math.floor(Math.random() * (JOT_DONE[1] - JOT_DONE[0] + 1));
  const order = lines.map((_, i) => i).sort(() => Math.random() - 0.5);
  for (const i of order.slice(0, done)) lines[i].done = true;
  // A little hand in each line: how far it drifts in from the margin and how it leans.
  for (const line of lines) {
    line.indent = Math.random();
    line.slant = Math.random() * 2 - 1;
  }
  return lines;
}

export const SECTIONS = {
  about: {
    // Read off the portrait display's own screen rather than the sidebar — see
    // `screen.js`. The others follow one at a time.
    screen: true,
    // And drawn there as a window rather than as a page: `textEditApp.js` sets the copy
    // below as a document in TextEdit, title bar, format toolbar and ruler included.
    app: 'textEdit',
    // No bigger on a phone: this display is already tall and narrow, and is read from
    // close enough that the room's own sizes hold. See `NARROW_TYPE` in `screen.js`.
    narrowType: 1,
    eyebrow: 'About',
    title: 'Summary',
    blocks: [
      {
        kind: 'intro',
        text:
          'Developer with 9+ years in Linux and server infrastructure, who came to ' +
          'programming through C, C++ and Assembly and has spent the last 6 years ' +
          'building with TypeScript — from hardening servers to shipping production ' +
          'web apps.',
      },
      {
        kind: 'text',
        paragraphs: [
          'I started on the systems side, not the application side. For the better part of a decade I have been configuring Linux servers, securing them, and keeping them running — Nginx and Apache in production then and now, and Kubernetes for orchestration as the work moved into containers. Working through the Linux track from the fundamentals up to the professional level is also what taught me to read a system rather than guess at it.',
          'Programming came out of that. Administering machines led me to C and C++, then down to Assembly to understand what the machine was actually doing, then to Python for the tooling around it. PHP and Laravel were my first real introduction to building for the web.',
          'Then I found JavaScript, and it took over. Six years later I write nearly everything in TypeScript — the types are what make a codebase survivable in a team and what turn a class of runtime failures into compile-time ones. That is the part of the job I enjoy most: code other people can pick up, and errors that surface before a user ever sees them.',
        ],
      },
      {
        kind: 'stats',
        cells: [
          { label: 'Experience', value: '9+ years' },
          { label: 'Based in', value: 'Tehran, IR' },
          { label: 'Focus', value: 'TypeScript' },
          { label: 'Status', value: 'Open', accent: true },
        ],
      },
    ],
  },

  experience: {
    // Read off the main display's own screen rather than the sidebar — see `screen.js`.
    screen: true,
    // And drawn there as a window rather than as a page: `notesApp.js` puts a row per
    // role and per project down a sidebar, and shows the one that is clicked. The
    // blocks below are what it builds that list from — a `timeline` item is a note, a
    // `cards` item is a note, and the `heading` between them names the second group.
    app: 'notes',
    // The XDR is the biggest screen in the room and is read from a step back; a touch
    // under the portrait display's sizes keeps a four-role page from running long.
    screenScale: 0.5,
    eyebrow: 'Experience',
    title: 'Experience & projects',
    blocks: [
      {
        kind: 'timeline',
        items: [
          {
            date: 'Jan 2025 — Sep 2026',
            role: 'Backend Engineer',
            org: 'Jamooj — villa and short-stay rental marketplace',
            desc:
              'Iran-wide marketplace for villas, suites and apartments: guests search by ' +
              'destination, dates and party size, and hosts list, price and manage their ' +
              'own properties.',
            tags: ['NestJS', 'TypeScript', 'MongoDB', 'Redis', 'Docker'],
            points: [
              'Built the booking core — availability calendars, per-night and seasonal pricing, and reservation state from request through confirmation to cancellation.',
              'Search and filtering across listings by destination, dates, capacity and property type, on MongoDB indexes shaped for those queries.',
              'Host-side APIs for listing, pricing, calendar and reservations, on the same contracts the guest clients use.',
              'Cut API response time 65% through query optimisation, better data-access patterns and caching.',
              'Reduced database query latency 40% by reworking MongoDB queries and indexes.',
              'Designed service boundaries so core components ship independently.',
              'Supported scaling to 50,000+ registered users at stable API performance.',
              'Lowered infrastructure cost 30% through resource and deployment optimisation.',
            ],
          },
          {
            date: 'Jan 2024 — Dec 2024',
            role: 'Software Engineer — Full-stack & Mobile',
            org: 'Senjed — school transportation super app',
            tags: ['Microservices', 'Socket.io', 'RabbitMQ', 'React Native'],
            points: [
              'Real-time vehicle tracking over WebSockets holding 10,000+ concurrent connections.',
              'Event-driven backbone on RabbitMQ processing 1M+ events per day.',
              'APIs and clients across web, Android and iOS for a four-role platform.',
              'Optimised high-frequency location streaming and client update traffic.',
            ],
          },
          {
            date: 'Mar 2023 — Oct 2023',
            role: 'Software Engineer — Full-stack',
            org: 'UniFars — marketplace platform',
            points: [
              'MongoDB schemas, indexes and query patterns for fast listing search and filtering.',
              'REST APIs for users, listings, categories, search and marketplace workflows.',
              'Responsive frontend features and Docker-based CI/CD releases.',
            ],
          },
          {
            date: 'May 2022 — Jan 2023',
            role: 'Software Engineer — Backend, Web & Android',
            org: 'Kavaran — voting & polling platform',
            points: [
              'Hybrid SQL/NoSQL models for transactional voting and scalable result aggregation.',
              'Real-time vote tracking and live results without client polling.',
              'Concurrency-safe voting workflows built for data consistency.',
              'Web management interfaces plus the Android client on the same API contracts.',
            ],
          },
        ],
      },
      { kind: 'heading', text: 'Personal projects' },
      {
        kind: 'cards',
        items: [
          {
            title: 'Distributed Notification Service',
            tags: ['Node.js', 'TypeScript', 'RabbitMQ'],
            desc: 'Event-driven notification architecture that decouples delivery from application services and handles messages asynchronously.',
          },
          {
            title: 'Real-Time Chat Service',
            tags: ['WebSockets', 'Socket.io', 'Redis'],
            desc: 'Messaging backend for persistent connections, reliable delivery and horizontal scaling across clients.',
          },
          {
            title: 'Payment Service Architecture',
            tags: ['Microservices', 'TypeScript'],
            desc: 'Payment processing split into independently deployable services, focused on transaction workflows, isolation and reliability.',
          },
        ],
      },
      {
        kind: 'footnote',
        text: 'Also: web and admin platforms in React and Next.js, native iOS in Swift and SwiftUI, and cross-platform apps in React Native.',
      },
    ],
  },

  skills: {
    // Read off the MacBook's own screen rather than the sidebar — see `screen.js`.
    screen: true,
    // The lid is a small panel read from a stride back — the portrait display's type
    // sizes land on it far too big. See `flow()` in `screen.js`.
    screenScale: 0.46,
    eyebrow: 'Stack',
    title: 'Technical skills',
    blocks: [
      {
        kind: 'intro',
        // One line, not a paragraph: the laptop's panel is short, and the groups are
        // what the section is for.
        text: 'Linux and containers underneath, TypeScript across the stack above them.',
      },
      {
        kind: 'skills',
        groups: [
          {
            title: 'Systems & DevOps',
            tags: ['Linux', 'Kubernetes', 'Docker', 'Nginx', 'Apache', 'Bash', 'Git'],
          },
          { title: 'Backend', tags: ['Node.js', 'Express', 'NestJS', 'Bun'] },
          {
            title: 'Frontend',
            tags: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Angular', 'three.js', 'Vite'],
          },
          { title: 'Application', tags: ['Java', 'Kotlin', 'Swift', 'SwiftUI', 'Dart'] },
          {
            title: 'Databases',
            tags: ['SQL', 'MySQL', 'PostgreSQL', 'NoSQL', 'MongoDB', 'Mongoose'],
          },
          { title: 'Languages', tags: ['C', 'C++', 'Assembly', 'Python', 'PHP', 'Laravel'] },
          {
            title: 'Certifications',
            tags: ['LPIC-3 — Linux Professional Institute', 'B.Sc. — University Degree'],
          },
        ],
      },
    ],
  },

  education: {
    // Read on the prop, not beside it: the prints on the wall are the section, so no
    // sidebar is built for it (see `panels.js`) and the camera fills the viewport with
    // the composition instead of shifting it clear of a panel. Unlike `screen`, this
    // does not route the section through `screen.js` — there is no canvas to paint,
    // scroll or rewind, only pictures already hanging in the room.
    onProp: true,
    // Which module reads it: the prints are looked at one at a time (`wallFrameFocus.js`).
    propMode: 'frames',
    eyebrow: 'Education',
    // The references hang here too: the letter of recommendation is one of the prints
    // (`wallFrames.js`), read the way the certificate is.
    title: 'Education & references',
    blocks: [
      {
        kind: 'cards',
        items: [
          {
            meta: '2021',
            title: 'Bachelor of Computer Engineering',
            desc: 'Islamic Azad University — Tehran, Iran',
          },
        ],
      },
      {
        kind: 'skills',
        groups: [{ title: 'Languages', tags: ['Persian — native', 'English — professional'] }],
      },
    ],
  },

  blog: {
    // Read off the iPad's own glass rather than the sidebar — see `screen.js`, whose
    // `slabFace` is what finds it: the model has no lit panel, so the tablet is read as
    // the flat slab it is.
    screen: true,
    // Handwritten — Caveat, from `public/fonts/`; `screen.js` loads it on first paint.
    // A script face sets small for its size, so the type is a little larger than the
    // tablet would otherwise get, and the page is meant to fill the glass.
    font: 'Caveat',
    screenScale: 1.2,
    // Lines closer together than the monitors' pages: a pad is written, not typeset.
    leading: 0.72,
    screenInset: 0.012,
    // The glass has rounded corners; the page is clipped to them (fraction of its width).
    screenRadius: 0.05,
    // A drawing app's tool bar along the bottom of the glass — see `drawToolbar()`.
    toolbar: 'draw',
    eyebrow: 'Writing',
    title: 'Notes on systems',
    blocks: [
      // What is jotted on the pad while sitting at the machine: a different handful
      // each visit, a few of them crossed off. See `jots()` below.
      { kind: 'jots', items: jots() },
      { kind: 'heading', text: 'Drafts' },
      {
        kind: 'rows',
        items: [
          { meta: 'Draft', title: 'Cutting API latency by 65% without a rewrite', href: '#' },
          { meta: 'Draft', title: 'Holding 10,000 sockets: lessons from live tracking', href: '#' },
          { meta: 'Draft', title: "When RabbitMQ is the right answer — and when it isn't", href: '#' },
        ],
      },
    ],
  },

  resume: {
    // Read on the prop, like `contact`: the sheet on the paper tablet *is* the CV — one
    // A4 page drawn from this same file by `portfolioPage.js` — so there is nothing to
    // put beside it. A click on the page asks whether to download it as a PDF; see
    // `sheetPrompt.js`.
    onProp: true,
    propMode: 'sheet',
    eyebrow: 'Document',
    title: 'Curriculum vitae',
    blocks: [],
  },

  contact: {
    // Read on the prop, like `education` below: the iPhone *is* this section. The camera
    // goes down onto its screen and the app icons already modelled there are the links —
    // see `phoneApps.js` for which tile opens what. There was a sidebar here once, with
    // the same addresses as link rows and a form that composed a mail; the phone carries
    // both now, and a panel beside it would only take back the half of the viewport the
    // screen is being read in.
    onProp: true,
    propMode: 'apps',
    eyebrow: 'Contact',
    title: 'Get in touch',
    blocks: [],
  },
};
