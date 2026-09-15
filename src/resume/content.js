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
    // Read off the MacBook's own screen rather than the sidebar — see `screen.js` —
    // and drawn there as a Shortcuts window: groups down the sidebar, the selected
    // group's skills as tiles (`stackApp.js`). The `intro` below is for the printed
    // CV and the sidebar; the window shows the groups and the footnote.
    screen: true,
    app: 'shortcuts',
    // Right to the lit panel's edge — the lid's glass ends there — with the corners
    // rounded like the Mac's own.
    screenInset: 0,
    screenRadius: 0.028,
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
        text: 'Linux and containers underneath, TypeScript across the stack, and three.js and Blender for the room you are in.',
      },
      {
        // Each group is a card on the lid (`skills()` in `screen.js`): `icon` is the mark
        // ahead of its title (from `public/skillsIcon/`, like a tag's), `note` the one
        // line under it.
        kind: 'skills',
        groups: [
          {
            title: 'Systems & DevOps',
            // Under the group's tiles in the Shortcuts window (`stackApp.js`).
            footer: 'Certified LPIC-3 (Linux Professional Institute) · production clusters on Kubernetes since 2021.',
            icon: 'system-and-devops',
            note: 'Servers, clusters, the shell',
            // A tag with an `icon` carries the glyph of that name from `public/skillsIcon/`
            // on its chip; a plain string is the word alone.
            tags: [
              {
                name: 'Linux',
                icon: 'linux',
                desc: 'The operating system under nearly every server — the shell, the filesystem, the services.',
              },
              {
                name: 'Kubernetes',
                icon: 'kubernetes',
                desc: 'Container orchestration — schedules, scales and heals services across a cluster.',
              },
              {
                name: 'Docker',
                icon: 'docker',
                desc: 'Packages an app and its dependencies into one image that runs the same everywhere.',
              },
              {
                name: 'Nginx',
                icon: 'nginx',
                desc: 'Web server and reverse proxy — TLS, static files and routing in front of app servers.',
              },
              {
                name: 'Apache',
                icon: 'apache',
                desc: 'The long-standing HTTP server; virtual hosts, modules and .htaccess rules.',
              },
              {
                name: 'Bash',
                icon: 'bash',
                desc: 'The Unix shell — scripting, pipes and the glue between tools on a server.',
              },
              {
                name: 'Git',
                icon: 'git',
                desc: 'Version control — branches, history and the workflow every team builds on.',
              },
            ],
          },
          {
            title: '3D & Graphics',
            // Under the group's tiles in the Shortcuts window (`stackApp.js`).
            footer: 'This whole room is the sample: modelled in Blender, shipped as Draco-compressed glTF, rendered in three.js.',
            icon: 'graphics',
            note: 'This room, and how it was built',
            tags: [
              {
                name: 'three.js',
                icon: 'three-js',
                desc: 'A JavaScript library over WebGL for 3D scenes in the browser — this room is one.',
              },
              {
                name: 'WebGL',
                icon: 'webgl',
                desc: 'The browser’s GPU API — what three.js draws with, and what runs on every device.',
              },
              {
                name: 'GLSL',
                icon: 'glsl',
                desc: 'The shading language — small programs on the GPU that decide how a surface looks.',
              },
              {
                name: 'Blender',
                icon: 'blender',
                desc: 'Open-source 3D suite — modelling, materials and baking the props this room is built from.',
              },
              {
                name: 'glTF / Draco',
                icon: 'glft',
                desc: 'The web’s 3D file format, with Draco compressing its geometry for faster loads.',
              },
              {
                name: 'Vite',
                icon: 'vite',
                desc: 'Build tool and dev server — instant reloads in development, bundled output for production.',
              },
            ],
          },
          {
            title: 'Backend',
            // Under the group's tiles in the Shortcuts window (`stackApp.js`).
            footer: 'Services in NestJS and Express behind Nginx, on Node.js, Bun and Deno — REST, WebSockets and queues.',
            icon: 'backend',
            note: 'Services, APIs, real-time',
            tags: [
              {
                name: 'Node.js',
                icon: 'nodejs',
                desc: 'JavaScript on the server — the runtime under most of the backends here.',
              },
              {
                name: 'Deno',
                icon: 'deno',
                desc: 'A newer JavaScript runtime — TypeScript built in, secure by default.',
              },
              {
                name: 'Bun',
                icon: 'bun',
                desc: 'A fast all-in-one JavaScript runtime, bundler and package manager.',
              },
              {
                name: 'Express',
                icon: 'express',
                desc: 'The minimal Node.js web framework — routes, middleware, nothing in the way.',
              },
              {
                name: 'NestJS',
                icon: 'nestjs',
                desc: 'A structured Node.js framework — modules, dependency injection, TypeScript first.',
              },
              {
                name: 'npm',
                icon: 'npm',
                desc: 'The default package manager for Node.js and the registry behind it.',
              },
              {
                name: 'yarn',
                icon: 'yarn',
                desc: 'An alternative package manager — workspaces, deterministic installs.',
              },
            ],
          },
          {
            title: 'Frontend',
            // Under the group's tiles in the Shortcuts window (`stackApp.js`).
            footer: 'Web and admin platforms in React and Next.js, with Angular where the team already had it.',
            icon: 'frontend',
            note: 'Web and admin platforms',
            tags: [
              {
                name: 'TypeScript',
                icon: 'typescript',
                desc: 'JavaScript with types — catches mistakes before they run, across the whole stack.',
              },
              {
                name: 'JavaScript',
                icon: 'javascript',
                desc: 'The language of the browser, and with Node.js of the server too.',
              },
              {
                name: 'React',
                icon: 'react',
                desc: 'The UI library — components, state and the ecosystem most web apps are built on.',
              },
              {
                name: 'Next.js',
                icon: 'nextjs',
                desc: 'The React framework — server rendering, routing and APIs in one project.',
              },
              {
                name: 'Angular',
                icon: 'angular',
                desc: 'Google’s full application framework — TypeScript, DI and RxJS built in.',
              },
              {
                name: 'HTML',
                icon: 'html',
                desc: 'The structure of every page — semantics, accessibility and forms.',
              },
              {
                name: 'CSS',
                icon: 'css',
                desc: 'How a page looks — layout, motion and responsive design.',
              },
            ],
          },
          {
            title: 'Application',
            // Under the group's tiles in the Shortcuts window (`stackApp.js`).
            footer: 'Native iOS in Swift and SwiftUI, Android in Kotlin, and cross-platform in Dart and React Native.',
            icon: 'application',
            note: 'Native and cross-platform',
            tags: [
              {
                name: 'Swift',
                icon: 'swift',
                desc: 'Apple’s language for iOS and macOS — safe, fast and expressive.',
              },
              {
                name: 'SwiftUI',
                icon: 'swift-ui',
                desc: 'Apple’s declarative UI framework — views as a function of state.',
              },
              {
                name: 'Kotlin',
                icon: 'kotlin',
                desc: 'The modern language for Android — concise, null-safe, JVM-compatible.',
              },
              {
                name: 'Java',
                icon: 'java',
                desc: 'The JVM workhorse — Android before Kotlin, and plenty of backends still.',
              },
              {
                name: 'Dart',
                icon: 'dart',
                desc: 'The language behind Flutter — one codebase for iOS, Android and web.',
              },
            ],
          },
          {
            title: 'Databases',
            // Under the group's tiles in the Shortcuts window (`stackApp.js`).
            footer: 'PostgreSQL and MySQL for the relational work, MongoDB with Mongoose where the data is documents.',
            icon: 'databases',
            note: 'Relational and document stores',
            tags: [
              {
                name: 'PostgreSQL',
                icon: 'postgresql',
                desc: 'The relational database of choice — strict, extensible and reliable.',
              },
              {
                name: 'MySQL',
                icon: 'mysql',
                desc: 'The widely deployed relational database — fast reads, familiar SQL.',
              },
              {
                name: 'SQL',
                icon: 'sql',
                desc: 'The query language — joins, indexes and schemas across every relational store.',
              },
              {
                name: 'MongoDB',
                icon: 'mongodb',
                desc: 'Document database — flexible JSON-like records, horizontal scaling.',
              },
              {
                name: 'Mongoose',
                icon: 'mongoose',
                desc: 'Schemas and models for MongoDB in Node.js — validation and queries with structure.',
              },
              {
                name: 'NoSQL',
                icon: 'nosql',
                desc: 'Non-relational stores — documents, key-value and graphs, chosen by the data’s shape.',
              },
            ],
          },
          {
            title: 'Languages',
            // Under the group's tiles in the Shortcuts window (`stackApp.js`).
            footer: 'B.Sc. Computer Engineering — C, C++ and Assembly from the degree, Python and PHP from the jobs since.',
            icon: 'languages',
            note: 'Down to the metal',
            tags: [
              {
                name: 'C',
                icon: 'c',
                desc: 'The systems language — memory, pointers and what every OS is written in.',
              },
              {
                name: 'C++',
                icon: 'c-plus-plus',
                desc: 'C with classes and templates — performance-critical code and engines.',
              },
              {
                name: 'Assembly',
                icon: 'assembly',
                desc: 'Instructions the CPU runs directly — how a program actually executes.',
              },
              {
                name: 'Python',
                icon: 'python',
                desc: 'Scripting, tooling and data — the quick, readable language for getting things done.',
              },
              {
                name: 'PHP',
                icon: 'php',
                desc: 'The web’s server-side language — still running most of it.',
              },
              {
                name: 'Laravel',
                icon: 'laravel',
                desc: 'The PHP framework — elegant routing, ORM and everything a web app needs.',
              },
            ],
          },
        ],
      },
      {
        kind: 'footnote',
        text: 'Certified LPIC-3 (Linux Professional Institute) · B.Sc. Computer Engineering.',
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
    // The same size on a phone: the pad is written at a size chosen to fill the glass,
    // and re-setting it larger there breaks the page. See `NARROW_TYPE` in `screen.js`.
    narrowType: 1,
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
