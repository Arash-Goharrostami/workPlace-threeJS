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
  role: 'Full-Stack Developer',
  blurb:
    'Full-Stack Developer — web, backend and real-time services. Five years building ' +
    'scalable products in TypeScript and Node.js. Tehran, Iran.',
  email: 'arash.goharrostami@gmail.com',
};

/** Where `panels.js` looks for the CV. Drop the file in `public/cv/` to arm the button. */
export const CV_URL = 'cv/Arash-Goharrostami.pdf';

/** The name the browser saves it under. */
export const CV_FILENAME = 'Arash-Goharrostami-CV.pdf';

/** The pool the pad's notes are drawn from — one line each, as they would be jotted. */
const JOTS = [
  'why does the socket count spike at 03:00?',
  'p95 is the number that matters, not the mean',
  'the cache is lying. verify TTLs',
  'types first, then the feature',
  'backup the home server. actually do it',
  'guitar — 20 min, no excuses',
  'idea: draw the desk in three.js',
];

/** How many lines land on the pad, and how many of those are crossed off. */
const JOT_COUNT = 3;
const JOT_DONE = [1, 2];

/**
 * What has been ticked off at this desk and what is next on it — drawn as boxes on the
 * pad (`checklist` in `screen.js`), the done ones ticked by hand.
 */
const CHECKLIST = [
  { group: 'done', items: [
    'API p95 under 200 ms at 1,000 req/s',
    '10,000 WebSockets open on one node',
    '1M+ RabbitMQ events a day, none lost',
    'LPIC-3 — the whole Linux track',
  ] },
  { group: 'next', items: [
    'this room at 60 fps on a mid-range phone',
    'write up the 65% latency cut',
    'a fix upstream to NestJS',
  ] },
];

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
          'Full-stack developer — TypeScript and Node.js, backend and real-time ' +
          'systems — with a decade of Linux and server work underneath.',
      },
      {
        kind: 'text',
        paragraphs: [
          'I came to programming from the systems side: years of building and running Linux servers led to C, C++ and Assembly to understand what the machine was doing, and from there to the web. It left me with a habit of reading a system rather than guessing at it.',
          'For the last six years that has meant TypeScript — APIs, real-time services and the clients on top of them, from schema to deployment. What I care about most is code a team can pick up, and errors that surface before a user ever sees them.',
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
              'own properties. The backend is a set of services — the original Laravel ' +
              'application and a NestJS service on PostgreSQL, plus a small Express ' +
              'service for chat and support on MongoDB — calling each other over ' +
              'RabbitMQ, with Redis as the cache layer and Nginx balancing traffic across ' +
              'two servers. I owned booking and search, and the performance work that ' +
              'let it grow past 50,000 registered users.',
            tags: [
              { name: 'NestJS', icon: 'nestjs' },
              { name: 'TypeScript', icon: 'typescript' },
              { name: 'Laravel', icon: 'laravel' },
              { name: 'PHP', icon: 'php' },
              { name: 'Express', icon: 'express' },
              { name: 'JavaScript', icon: 'javascript' },
              { name: 'PostgreSQL', icon: 'postgresql' },
              { name: 'MongoDB', icon: 'mongodb' },
              { name: 'RabbitMQ', icon: 'rabbitmq' },
              { name: 'Redis', icon: 'redis' },
              { name: 'Nginx', icon: 'nginx' },
              { name: 'Docker', icon: 'docker' },
            ],
            points: [
              'Booking core: availability calendars, seasonal pricing and the reservation state machine.',
              'Listing search by destination, dates, capacity and type on purpose-built PostgreSQL indexes.',
              'Services split by domain and wired over RabbitMQ; chat and support on their own Express service.',
              'Redis caching and query work: API response time down 65%, query latency down 40%.',
              'Nginx in front of two servers for load balancing and failover; infrastructure cost down 30%.',
            ],
          },
          {
            date: 'Jan 2024 — Dec 2024',
            role: 'Software Engineer — Full-stack & Mobile',
            org: 'Senjed — school transportation super app',
            desc:
              'A platform for school transport with three sides to it — drivers, parents ' +
              'and the transport companies — built around live vehicle tracking. A core ' +
              'Express backend in JavaScript with the real-time and event services ' +
              'around it on RabbitMQ, deployed on Kubernetes; a React and TypeScript web ' +
              'front with the operations dashboard; and an Android app for each role. I ' +
              'built the real-time backbone and worked across the backend, the dashboard ' +
              'and the apps.',
            tags: [
              { name: 'Express', icon: 'express' },
              { name: 'JavaScript', icon: 'javascript' },
              { name: 'React', icon: 'react' },
              { name: 'TypeScript', icon: 'typescript' },
              { name: 'RabbitMQ', icon: 'rabbitmq' },
              { name: 'Microservices', icon: 'microservices' },
              { name: 'Socket.io', icon: 'socket-io' },
              { name: 'React Native', icon: 'react-native' },
              { name: 'Kubernetes', icon: 'kubernetes' },
              { name: 'Docker', icon: 'docker' },
            ],
            points: [
              'Live vehicle tracking over WebSockets holding 10,000+ concurrent connections.',
              'Event-driven services on RabbitMQ processing 1M+ events a day.',
              'React + TypeScript dashboard for companies: routes, drivers, students and live buses.',
              'Android apps for drivers, parents and companies on one shared API.',
              'Containerised services deployed and scaled on Kubernetes.',
            ],
          },
          {
            date: 'Mar 2023 — Oct 2023',
            role: 'Software Engineer — Full-stack',
            org: 'UniFars — marketplace platform',
            desc:
              'A general classifieds marketplace with categories, listings and search. I ' +
              'shaped the data model and the REST API around fast listing search, built ' +
              'the responsive frontend features and set up the Docker-based release pipeline.',
            tags: [
              { name: 'Node.js', icon: 'nodejs' },
              { name: 'MongoDB', icon: 'mongodb' },
              { name: 'React', icon: 'react' },
              { name: 'Docker', icon: 'docker' },
            ],
            points: [
              'MongoDB schemas, indexes and query patterns for fast search and filtering.',
              'REST APIs for users, listings, categories, search and marketplace workflows.',
              'Responsive frontend features and Docker-based CI/CD releases.',
            ],
          },
          {
            date: 'May 2022 — Jan 2023',
            role: 'Software Engineer — Backend, Web & Android',
            org: 'Kavaran — voting & polling platform',
            desc:
              'Votes, polls and live results for organisations. I designed the hybrid ' +
              'SQL/NoSQL storage — transactional on the vote, scalable on the aggregation — ' +
              'and the real-time results channel, and shipped the web management console ' +
              'and the Android client on the same contracts.',
            tags: [
              { name: 'Node.js', icon: 'nodejs' },
              { name: 'PostgreSQL', icon: 'postgresql' },
              { name: 'MongoDB', icon: 'mongodb' },
              { name: 'WebSockets', icon: 'websocket' },
              { name: 'Kotlin', icon: 'kotlin' },
            ],
            points: [
              'Hybrid SQL/NoSQL models: transactional voting, scalable result aggregation.',
              'Concurrency-safe voting workflows with live results and no client polling.',
              'Web management interfaces plus the Android client on one API.',
            ],
          },
        ],
      },
      { kind: 'heading', text: 'Personal projects' },
      {
        kind: 'cards',
        items: [
          {
            meta: 'Side project · this room',
            title: 'The room you are standing in',
            tags: [
              { name: 'three.js', icon: 'three-js' },
              { name: 'WebGL', icon: 'webgl' },
              { name: 'Vite', icon: 'vite' },
              { name: 'Blender', icon: 'blender' },
            ],
            desc:
              'A CV nobody has to scroll: my actual desk, modelled and rendered in the ' +
              'browser, where the props are the sections and the screens draw their own ' +
              'pages. Built to find out how far a résumé can go before it stops being one.',
            points: [
              'Click any prop and the camera flies to it; its screen or sheet opens the section.',
              'The monitors render live canvas pages — the CV, a notes app, a terminal.',
              '40 models re-cut and Draco-compressed to a 6 MB room; loads in parallel.',
              'Cached shadows, an idle frame cap and a phone layout keep it smooth on mobile.',
              'A mirror-cube loading screen you can scramble and solve by hand.',
            ],
          },
          {
            meta: 'Side project · low level',
            title: 'Chess engine',
            tags: [
              { name: 'C++', icon: 'c-plus-plus' },
              { name: 'Assembly', icon: 'assembly' },
            ],
            desc:
              'Written to see what the compiler was doing for me: a full engine in C++, ' +
              'then the hot loops torn out and rewritten by hand in x86 Assembly, timed ' +
              'against the code they replaced.',
            points: [
              'Bitboard board state with legal move generation, castling, en passant, promotion.',
              'Alpha-beta search with move ordering, iterative deepening and a transposition table.',
              'Popcount, bit scans and the evaluation loop in Assembly, benchmarked side by side.',
              'Plays from the terminal, against itself or a person, with a perft suite to prove the rules.',
            ],
          },
          {
            meta: 'Side project · networking',
            title: 'Home DNS resolver',
            tags: [
              { name: 'Python', icon: 'python' },
              { name: 'Linux', icon: 'linux' },
            ],
            desc:
              'My own DNS server, from the wire format up, sitting in front of every ' +
              'device in the house. The reason none of them has seen a Spotify or ' +
              'YouTube ad in years.',
            points: [
              'Parses and answers raw DNS packets; caches by TTL; forwards what it does not know.',
              'Network-wide blocklists — ads, trackers, telemetry — kept per device or per network.',
              'Ad-free Spotify and YouTube on phones, TVs and laptops with nothing installed on them.',
              'Local names for the machines on the LAN, and a query log to see who talks to whom.',
            ],
          },
          {
            meta: 'Side project · hardware',
            title: 'Hand-built keyboard',
            tags: [
              { name: 'C', icon: 'c' },
              { name: 'Git', icon: 'git' },
            ],
            desc:
              'When my keyboard died I built the replacement instead of buying one: a ' +
              'hand-wired board on a microcontroller, with the open-source firmware forked ' +
              'and edited into the layout I actually type on. This page was written on it.',
            points: [
              'Firmware edited to its own matrix, pinout and key layout.',
              'Layers for symbols, navigation and media under the home row; a dedicated Farsi layer.',
              'Macros and tap-hold keys for the shortcuts I hit a hundred times a day.',
              'Flashed and re-flashed from a single make target as the layout evolved.',
            ],
          },
          {
            meta: 'Side project · self-hosting',
            title: 'Home storage server',
            tags: [
              { name: 'Linux', icon: 'linux' },
              { name: 'Docker', icon: 'docker' },
              { name: 'Bash', icon: 'bash' },
            ],
            desc:
              'A personal NAS on the local network — a Linux box that every device in the ' +
              'house sees as its own drive, and where the rest of these projects live.',
            points: [
              'Shared storage over SMB and NFS for Macs, phones, the TV and the printer.',
              'Media, backups and the DNS resolver each in their own container.',
              'Scheduled snapshot backups with retention, restorable file by file.',
              'Reachable only on the LAN; nothing forwarded to the internet.',
            ],
          },
        ],
      },
      {
        kind: 'footnote',
        text:
          'Also: web and admin platforms in React and Next.js, native iOS in Swift and ' +
          'SwiftUI, cross-platform apps in React Native — and a habit of fixing what is ' +
          'in front of me, from ad-free streaming to the network the house runs on.',
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
            footer: 'Native iOS in Swift and SwiftUI, Android in Kotlin, cross-platform in Dart and React Native — side interests next to the web work.',
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
            footer: 'B.Sc. Computer Engineering — C, C++ and Assembly from the degree; the rest learnt for the fun of it. Full-stack web is the day job.',
            icon: 'languages',
            note: 'Down to the metal',
            tags: [
              {
                name: 'TypeScript',
                icon: 'typescript',
                desc: 'The day job — typed JavaScript for backends and clients that have to stay correct as they grow.',
              },
              {
                name: 'JavaScript',
                icon: 'javascript',
                desc: 'The language of the browser and of Node — what everything on the web ends up running as.',
              },
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

  story: {
    // The story of the site, written on the back wall's outer face (`wallStory.js`).
    // Read on the wall itself: no panel, nothing to scroll — the camera flies up to the
    // mural and the chalk is the copy. Not in the menu; it is found by walking round.
    onProp: true,
    propMode: 'mural',
    // Read from outside the room, so closing it returns to the wide shot it was found
    // from rather than to the desk (see `open()` in `index.js`).
    outside: true,
    eyebrow: 'About',
    title: 'About this place',
    blocks: [],
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
      // Ticked and not yet: the numbers that were hit, and what the pad says is next.
      { kind: 'checklist', groups: CHECKLIST },
      { kind: 'heading', text: 'Drafts' },
      {
        kind: 'rows',
        items: [
          { title: 'Cutting API latency by 65% without a rewrite', href: '#' },
          { title: 'Holding 10,000 sockets: lessons from live tracking', href: '#' },
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
