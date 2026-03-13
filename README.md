# Redis Create Database — Production-Ready Prototype

A **vanilla HTML, CSS, and JavaScript** prototype for the Redis database creation flow. No build step; open `index.html` in a browser to run.

## How to run

1. Open `index.html` in a modern browser (Chrome, Firefox, Safari, Edge), or
2. Serve the folder locally, e.g.:
   ```bash
   cd redis-create-db-prototype
   python3 -m http.server 8080
   ```
   Then visit `http://localhost:8080`.

## What’s implemented

### UX (per `docs/redis-create-database-ux-spec.md`)

- **Step 1 — Name and region:** Database name (3–64 chars, `[a-zA-Z0-9-_]`), primary region as cards (US East, EU Ireland, Asia Pacific). Back disabled; **Next** advances.
- **Step 2 — Select plan:** Plan cards (Free default, Pay as you go, Pro). **Back** and **Next**.
- **Step 3 — Review and create:** Summary with **Change** links for name, region, and plan. **Create database** submits.
- **Loading:** After **Create database**, button shows spinner and “Creating your database…” until success or error.
- **Success (Step 4):** “Your database is ready” with:
  - Connection string (masked by default; **Reveal** + **Copy**)
  - Environment variables (masked by default; **Reveal** + **Copy all**)
  - SDK snippet (Node.js) with **Copy** and “Open docs”
  - Run in CLI command with **Copy**
  - Next steps: Go to database, Create another database, Read the docs, Test connection
- **Validation:**
  - **Inline:** Name length and allowed characters; message under field on input/blur.
  - **On submit:** Duplicate name (“A database with this name already exists…”), region unavailable (“This region is temporarily unavailable…”), and simulated creation failure (“We couldn’t create your database. Please try again.”).

### Visual design (per `docs/redis-create-database-visual-design-spec.md`)

- **Colors:** Primary `#DC382D`, hover `#B82E24`, backgrounds `#FAFAFA` / `#FFFFFF`, text and borders as specified; success `#059669`, error `#DC2626`.
- **Typography:** Inter for UI, JetBrains Mono for code.
- **Stepper:** Horizontal 1 → 2 → 3 with completed/active/upcoming states.
- **Form:** Styled text input, region cards with selected state, plan cards with Free default and selected styling.
- **Success block:** Dark code blocks, copy buttons with “Copied” (green) feedback.
- **Layout:** Max width 640–720px, spacing and trust line below the form.
- **Responsive:** Stepper labels hidden on small screens; region and plan cards stack; CTAs full-width on mobile.

### Demo behaviors (mock data, no real API)

- **Duplicate name:** Use `existing-db`, `mydb`, or `cache` on Step 3 to see the duplicate-name error.
- **Region unavailable:** Select **Asia Pacific (Singapore)** and click **Next** on Step 1 to see the region-unavailable message.
- **Creation failure:** Use database name `fail` or `error` on Step 3 and click **Create database** to see the generic failure message and **Create database** again to retry (e.g. after changing the name).

### Accessibility and production readiness

- Semantic HTML (`main`, `section`, `label`, `nav`, headings).
- Labels, `aria-describedby`, `aria-invalid`, `aria-live` for errors, and focus styles.
- Copy buttons show “Copied” for 2 seconds.
- No console errors; works with keyboard and screen readers.

## Files

| File        | Purpose                          |
|------------|-----------------------------------|
| `index.html` | Markup for all steps and success |
| `styles.css` | Layout, components, responsive   |
| `app.js`     | State, validation, navigation, copy, mock data |
| `README.md`  | This file                        |

Specs: `docs/redis-create-database-ux-spec.md`, `docs/redis-create-database-visual-design-spec.md`.
