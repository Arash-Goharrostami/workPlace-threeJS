/**
 * Every word the room says, as data. `panels.js` is the only thing that reads it —
 * nothing here knows about the DOM, so the copy can be edited without touching markup.
 *
 * The keys are the section ids: they are what `anchors.js` maps onto props, what the
 * dock buttons open, and what `panels.js` builds a sidebar from. Adding a section
 * means adding it in both files.
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

export const SECTIONS = {
  about: {
    number: '01',
    eyebrow: 'About',
    title: 'Summary',
    blocks: [
      {
        kind: 'text',
        paragraphs: [
          'Software Engineer with 5+ years building scalable web and mobile applications, specialising in backend engineering, distributed systems and real-time applications.',
          'I design production-grade services with Node.js, TypeScript, NestJS and Express.js, and build the clients on top of them with React, Next.js, React Native, Swift and SwiftUI.',
          'Strongest in microservices, event-driven architecture, real-time communication, API design, database optimisation, authentication and production infrastructure — with a bias toward systems that stay maintainable as they scale.',
        ],
      },
      {
        kind: 'stats',
        cells: [
          { label: 'Experience', value: '5+ years' },
          { label: 'Based in', value: 'Tehran, IR' },
          { label: 'Focus', value: 'Backend' },
          { label: 'Status', value: 'Open', accent: true },
        ],
      },
    ],
  },

  experience: {
    number: '02',
    eyebrow: 'Experience',
    title: 'Professional experience',
    blocks: [
      {
        kind: 'timeline',
        items: [
          {
            date: 'Jan 2025 — Sep 2026',
            role: 'Backend Engineer',
            org: 'Jamooj — villa rental platform',
            tags: ['NestJS', 'TypeScript', 'MongoDB', 'Redis', 'Docker'],
            points: [
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
    ],
  },

  skills: {
    number: '03',
    eyebrow: 'Stack',
    title: 'Technical skills',
    blocks: [
      {
        kind: 'skills',
        groups: [
          {
            title: 'Languages',
            tags: ['TypeScript', 'JavaScript ES6+', 'Java', 'Swift', 'PHP', 'HTML', 'CSS'],
          },
          {
            title: 'Backend',
            tags: ['Node.js', 'NestJS', 'Express.js', 'REST', 'GraphQL', 'WebSockets', 'Socket.io'],
          },
          {
            title: 'Architecture',
            tags: ['Microservices', 'Distributed systems', 'Event-driven', 'System design', 'Clean architecture'],
          },
          { title: 'Databases', tags: ['MongoDB', 'Mongoose', 'PostgreSQL', 'MySQL', 'Redis'] },
          { title: 'Messaging & real-time', tags: ['RabbitMQ', 'Apache Kafka', 'NATS', 'WebSockets'] },
          {
            title: 'Frontend & mobile',
            tags: ['React', 'Next.js', 'Angular', 'React Native', 'Swift', 'SwiftUI', 'Android', 'iOS'],
          },
          { title: 'Security', tags: ['JWT', 'RBAC', 'Auth', 'Hashing', 'Rate limiting', 'CORS'] },
          {
            title: 'Infrastructure & DevOps',
            tags: ['Docker', 'Linux', 'Ubuntu', 'Nginx', 'CI/CD', 'VPS', 'Cloudflare', 'Git'],
          },
        ],
      },
    ],
  },

  projects: {
    number: '04',
    eyebrow: 'Projects',
    title: 'Personal projects',
    blocks: [
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

  education: {
    number: '05',
    eyebrow: 'Education',
    title: 'Education',
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
    number: '06',
    eyebrow: 'Writing',
    title: 'Notes on systems',
    blocks: [
      {
        kind: 'intro',
        text: 'Placeholder entries — replace the titles and dates with real posts, or drop this section from `anchors.js` to take the object out of the room.',
      },
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

  testimonials: {
    number: '07',
    eyebrow: 'References',
    title: 'References',
    blocks: [
      { kind: 'intro', text: 'Placeholder quotes — swap in two or three real ones.' },
      {
        kind: 'quotes',
        items: [
          {
            text: "Add a colleague's sentence about how you work here — one or two lines is plenty.",
            attrib: 'Name — role, company',
          },
          {
            text: 'A second quote, ideally about a specific project rather than general praise.',
            attrib: 'Name — role, company',
          },
        ],
      },
      {
        kind: 'note',
        text: 'References available on request — ',
        link: { label: PROFILE.email, href: `mailto:${PROFILE.email}` },
      },
    ],
  },

  resume: {
    number: '08',
    eyebrow: 'Document',
    title: 'Curriculum vitae',
    blocks: [
      { kind: 'intro', text: 'Four pages, PDF. The same content as this room, in a form you can forward.' },
      {
        kind: 'meta',
        rows: [
          ['File', 'Arash-Goharrostami.pdf'],
          ['Pages', '4'],
          ['Updated', 'August 2026'],
        ],
      },
      { kind: 'download', label: 'Download PDF', href: CV_URL, filename: 'Arash-Goharrostami-CV.pdf' },
    ],
  },

  contact: {
    number: '09',
    eyebrow: 'Contact',
    title: 'Get in touch',
    blocks: [
      {
        kind: 'links',
        items: [
          { label: 'Email', value: PROFILE.email, href: `mailto:${PROFILE.email}` },
          { label: 'Phone', value: '+98 911 595 0737', href: 'tel:+989115950737' },
          { label: 'Site', value: 'arash.goharrostami.ir', href: 'https://arash.goharrostami.ir', external: true },
          {
            label: 'LinkedIn',
            value: 'arash-goharrostami',
            href: 'https://linkedin.com/in/arash-goharrostami',
            external: true,
          },
          {
            label: 'GitHub',
            value: 'arash-goharrostami',
            href: 'https://github.com/arash-goharrostami',
            external: true,
          },
        ],
      },
      { kind: 'contactForm' },
    ],
  },
};
