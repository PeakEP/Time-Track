# JMRC suite: sign-in, access and Suite Admin

One name + PIN signs a person in to every app in the suite. Sign-in happens on the home
page (`/`), and Admins manage people and access on **Suite Admin** (`/admin/`).

## How it fits together

| Piece | Where | What it does |
| --- | --- | --- |
| Home page | `index.html` | First-time setup, sign-in, then shows only the apps you can open. Clients go straight to their project. |
| Suite Admin | `admin/index.html` | Team table (Admin, per-app access, Active, Reset PIN, add person) and Clients table (reissue PIN, access on/off). |
| Suite API | `netlify/functions/suite-api/` → `/api/suite/*` | `config`, `setup`, `login`, `logout`, `me`, `check?app=`, and the Admin-only `team` / `clients` endpoints. |
| Page gate | `netlify/edge-functions/suite-gate.js` | Runs in front of every app path and asks `/api/suite/check`: signed in with access → page loads; not signed in → home page, then back; no access → "No access" page. If the check fails, the app stays closed. |
| Shared account code | `netlify/shared/` | `accounts.mjs` (access rules, team changes, cookie), `signin.mjs` (one sign-in for staff and clients), `pins.mjs`, `storage.mjs`. |

Signing in sets an HttpOnly cookie (`jmrc_session`, 30 days). Every app's API and the gate
accept it, so nobody signs in twice.

## Access per person

- **Admin**: can open Suite Admin. The last active Admin can't be removed or turned off.
- **Vendor Orders**: No access, Sales rep, or Purchaser. The last active Purchaser can't
  be removed.
- **Finish Selections**: No access or Designer.
- **Cabinet Designer**, **Aline Designer**: on or off.

People set up before per-app access existed keep working: Purchasers become Admins, and
everyone keeps their Vendor Orders role and gets the other apps. Change it on Suite Admin.

Clients (made from Finish Selections → Projects → New client project) can only open their
own Finish Selections project, in client view.

Access changes take effect within a minute (the gate remembers each answer for 60 s).
Turning someone off, or resetting their PIN, also signs them out everywhere at once.

## Data

Staff live in the `vendor-orders` Blobs store (so existing PINs kept working), and client
sign-ins live in the `selections` store. Deploy previews use their own stores, so a
preview needs its own first-time setup on its home page.

Tests: `npm run test:vendor-orders` (includes `suite/tests/`).
