/**
 * Starting points for "Create": small, original, license-clean static projects (written for
 * REMAXX, MIT). People build on them by hand or by describing what they want to the AI.
 * Pure data, safe to import in the browser (the picker shows names and blurbs).
 */
import type { CategoryId } from "@/config/taxonomy";

export type StarterId = "blank" | "landing" | "portfolio" | "links" | "app";

export type Starter = {
  id: StarterId;
  name: string;
  blurb: string;
  category: CategoryId;
  /** A first prompt idea shown as a placeholder. */
  idea: string;
  files: Record<string, string>;
};

const BASE_CSS = `*,
*::before,
*::after {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

img {
  max-width: 100%;
  display: block;
}

a {
  color: inherit;
}
`;

const page = (title: string, body: string, extraHead = "") => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="style.css" />${extraHead}
  </head>
  <body>
${body}
  </body>
</html>
`;

export const STARTERS: Record<StarterId, Starter> = {
  blank: {
    id: "blank",
    name: "Blank page",
    blurb: "One empty page. Describe anything and build it from scratch.",
    category: "website",
    idea: "A one-page site for my dog-walking business with prices and a contact button",
    files: {
      "index.html": page(
        "My project",
        `    <main class="start">
      <h1>Start here</h1>
      <p>This page is yours. Describe what you want in the chat, or edit the code.</p>
    </main>`,
      ),
      "style.css": `${BASE_CSS}
body {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f6f5f2;
  color: #1c1b1a;
}

.start {
  max-width: 36rem;
  padding: 2rem;
  text-align: center;
}

h1 {
  font-size: clamp(2rem, 6vw, 3.5rem);
  margin: 0 0 0.5rem;
}

p {
  color: #5c5a57;
}
`,
    },
  },

  landing: {
    id: "landing",
    name: "Landing page",
    blurb: "Headline, features and a call to action. Good for a product or service.",
    category: "landing-page",
    idea: "Turn this into a landing page for a mobile car-detailing service, dark and bold",
    files: {
      "index.html": page(
        "Product name",
        `    <header class="nav">
      <strong class="logo">Product</strong>
      <a class="button small" href="#signup">Get started</a>
    </header>

    <section class="hero">
      <h1>Say what you make in one clear line</h1>
      <p>A sentence or two on who it's for and why it helps. Keep it short.</p>
      <a class="button" href="#signup">Get started</a>
    </section>

    <section class="features">
      <article>
        <h2>First benefit</h2>
        <p>What someone gets, in plain words.</p>
      </article>
      <article>
        <h2>Second benefit</h2>
        <p>Another reason to pick this.</p>
      </article>
      <article>
        <h2>Third benefit</h2>
        <p>One more, then stop.</p>
      </article>
    </section>

    <section class="cta" id="signup">
      <h2>Ready to try it?</h2>
      <a class="button" href="mailto:hello@example.com">Email us</a>
    </section>

    <footer class="footer">© Your name</footer>`,
      ),
      "style.css": `${BASE_CSS}
:root {
  --bg: #ffffff;
  --text: #16161a;
  --muted: #5f6068;
  --accent: #3b5bfd;
  --panel: #f3f4f8;
}

body {
  background: var(--bg);
  color: var(--text);
}

.nav,
.hero,
.features,
.cta,
.footer {
  max-width: 64rem;
  margin: 0 auto;
  padding: 1.25rem 1.5rem;
}

.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  font-size: 1.25rem;
}

.hero {
  padding-top: 5rem;
  padding-bottom: 4rem;
  text-align: center;
}

.hero h1 {
  font-size: clamp(2.25rem, 6vw, 4rem);
  line-height: 1.05;
  margin: 0 auto 1rem;
  max-width: 18ch;
}

.hero p {
  color: var(--muted);
  font-size: 1.15rem;
  max-width: 42ch;
  margin: 0 auto 2rem;
}

.button {
  display: inline-block;
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  padding: 0.85rem 1.4rem;
  border-radius: 999px;
}

.button.small {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}

.features {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
}

.features article {
  background: var(--panel);
  border-radius: 1rem;
  padding: 1.5rem;
}

.features h2 {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}

.features p {
  color: var(--muted);
  margin: 0;
}

.cta {
  text-align: center;
  padding-top: 4rem;
  padding-bottom: 4rem;
}

.footer {
  color: var(--muted);
  font-size: 0.9rem;
  text-align: center;
}
`,
    },
  },

  portfolio: {
    id: "portfolio",
    name: "Portfolio",
    blurb: "Your name, a grid of work and a way to reach you.",
    category: "portfolio",
    idea: "Make this a portfolio for a wedding photographer with soft, elegant colors",
    files: {
      "index.html": page(
        "Your Name",
        `    <main class="wrap">
      <header class="intro">
        <h1>Your Name</h1>
        <p>What you do, in one line. Where you're based.</p>
      </header>

      <section class="grid" aria-label="Work">
        <a class="card" href="#"><span class="thumb t1"></span><span>Project one</span></a>
        <a class="card" href="#"><span class="thumb t2"></span><span>Project two</span></a>
        <a class="card" href="#"><span class="thumb t3"></span><span>Project three</span></a>
        <a class="card" href="#"><span class="thumb t4"></span><span>Project four</span></a>
      </section>

      <footer class="contact">
        <h2>Say hello</h2>
        <a href="mailto:you@example.com">you@example.com</a>
      </footer>
    </main>`,
      ),
      "style.css": `${BASE_CSS}
body {
  background: #fbfaf8;
  color: #1d1c1a;
}

.wrap {
  max-width: 60rem;
  margin: 0 auto;
  padding: 4rem 1.5rem;
}

.intro h1 {
  font-size: clamp(2.5rem, 7vw, 4.5rem);
  margin: 0;
  letter-spacing: -0.02em;
}

.intro p {
  color: #6b6964;
  font-size: 1.15rem;
  margin: 0.5rem 0 3rem;
}

.grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  text-decoration: none;
  font-weight: 600;
}

.thumb {
  aspect-ratio: 4 / 3;
  border-radius: 0.75rem;
}

.t1 { background: linear-gradient(135deg, #e9d8c8, #c9a98c); }
.t2 { background: linear-gradient(135deg, #d6e2dc, #8fb0a2); }
.t3 { background: linear-gradient(135deg, #e3dcef, #a596c4); }
.t4 { background: linear-gradient(135deg, #f1e3d3, #d8a47f); }

.contact {
  margin-top: 4rem;
}

.contact h2 {
  margin: 0 0 0.25rem;
}
`,
    },
  },

  links: {
    id: "links",
    name: "Link page",
    blurb: "A link-in-bio page for socials, shops and booking links.",
    category: "website",
    idea: "A link page for my nail studio with booking, Instagram and price list, pastel pink",
    files: {
      "index.html": page(
        "Your Name · Links",
        `    <main class="links">
      <div class="avatar" aria-hidden="true">Y</div>
      <h1>Your Name</h1>
      <p>A short line about you.</p>
      <nav>
        <a href="#">My shop</a>
        <a href="#">Book a session</a>
        <a href="#">Instagram</a>
        <a href="#">Email me</a>
      </nav>
    </main>`,
      ),
      "style.css": `${BASE_CSS}
body {
  min-height: 100vh;
  background: #111114;
  color: #f4f4f6;
  display: grid;
  place-items: center;
}

.links {
  width: min(26rem, 100%);
  padding: 3rem 1.25rem;
  text-align: center;
}

.avatar {
  width: 5.5rem;
  height: 5.5rem;
  margin: 0 auto 1rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 2rem;
  font-weight: 700;
  background: linear-gradient(135deg, #7c5cff, #2ec5ff);
}

h1 {
  margin: 0;
  font-size: 1.5rem;
}

p {
  color: #a3a3ad;
  margin: 0.25rem 0 2rem;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

nav a {
  display: block;
  padding: 0.95rem 1rem;
  border-radius: 0.85rem;
  background: #1e1e24;
  border: 1px solid #2c2c35;
  text-decoration: none;
  font-weight: 600;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

nav a:hover {
  transform: translateY(-2px);
  border-color: #7c5cff;
}
`,
    },
  },

  app: {
    id: "app",
    name: "Small app",
    blurb: "A working to-do list with JavaScript. Turn it into any small tool.",
    category: "tool",
    idea: "Turn this into a habit tracker with a 7-day streak grid",
    files: {
      "index.html": page(
        "My app",
        `    <main class="app">
      <h1>My list</h1>
      <form id="add">
        <label class="sr-only" for="item">New item</label>
        <input id="item" placeholder="Add something…" autocomplete="off" required />
        <button type="submit">Add</button>
      </form>
      <ul id="list"></ul>
      <p id="empty">Nothing here yet.</p>
    </main>`,
        `\n    <script src="app.js" defer></script>`,
      ),
      "style.css": `${BASE_CSS}
body {
  background: #eef1f5;
  color: #17191c;
}

.app {
  max-width: 28rem;
  margin: 4rem auto;
  padding: 1.5rem;
  background: #fff;
  border-radius: 1rem;
  box-shadow: 0 10px 30px rgba(20, 30, 50, 0.08);
}

h1 {
  margin: 0 0 1rem;
}

form {
  display: flex;
  gap: 0.5rem;
}

input {
  flex: 1;
  font: inherit;
  padding: 0.65rem 0.8rem;
  border: 1px solid #ccd2da;
  border-radius: 0.6rem;
}

button {
  font: inherit;
  font-weight: 600;
  border: 0;
  border-radius: 0.6rem;
  padding: 0.65rem 1rem;
  background: #1f6feb;
  color: #fff;
  cursor: pointer;
}

ul {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
}

li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid #eef0f3;
}

li.done span {
  text-decoration: line-through;
  color: #8a9099;
}

li .remove {
  margin-left: auto;
  background: none;
  color: #8a9099;
  padding: 0.25rem 0.5rem;
}

#empty {
  color: #8a9099;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
`,
      "app.js": `// A tiny to-do list. Items are kept in this browser when it allows it.
const KEY = "my-list";
const form = document.getElementById("add");
const input = document.getElementById("item");
const list = document.getElementById("list");
const empty = document.getElementById("empty");

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function save(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage can be blocked (private windows, previews). The list still works for this visit.
  }
}

let items = load();

function render() {
  list.innerHTML = "";
  items.forEach((item, i) => {
    const li = document.createElement("li");
    if (item.done) li.className = "done";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = item.done;
    box.addEventListener("change", () => {
      items[i].done = box.checked;
      save(items);
      render();
    });
    const text = document.createElement("span");
    text.textContent = item.text;
    const remove = document.createElement("button");
    remove.className = "remove";
    remove.setAttribute("aria-label", "Remove " + item.text);
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      items.splice(i, 1);
      save(items);
      render();
    });
    li.append(box, text, remove);
    list.append(li);
  });
  empty.hidden = items.length > 0;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  items.push({ text, done: false });
  input.value = "";
  save(items);
  render();
});

render();
`,
    },
  },
};

export const STARTER_ORDER: StarterId[] = ["blank", "landing", "portfolio", "links", "app"];

export function isStarterId(v: unknown): v is StarterId {
  return typeof v === "string" && v in STARTERS;
}

/** A title from the person's description, e.g. "A booking page for my salon" → "Booking page for my salon". */
export function titleFromIdea(idea: string, fallback: string): string {
  const words = idea
    .replace(/[^\p{L}\p{N}\s'&-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && /^(a|an|the|make|build|create|me|please)$/i.test(words[0]!)) words.shift();
  // Whole words, up to 60 characters.
  let title = "";
  for (const w of words) {
    const next = title ? `${title} ${w}` : w;
    if (next.length > 60) break;
    title = next;
  }
  if (title.length < 3) return fallback;
  return title[0]!.toUpperCase() + title.slice(1);
}
