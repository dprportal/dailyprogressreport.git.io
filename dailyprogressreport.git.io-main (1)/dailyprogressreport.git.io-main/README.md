# Shimla 24x7 Water Supply — DPR Management

An installable web app (PWA) for capturing Daily Progress Reports for the
Shimla 24×7 Water Supply Project. Built with vanilla JS modules + Firebase
(Firestore + Auth). No build step — just static files.

```
index.html
manifest.json        ← PWA manifest
sw.js                ← service worker (offline + fast loads)
firestore.rules      ← paste into Firebase console
css/   js/   icons/
```

## 1. Host it (GitHub Pages)

1. Create a new GitHub repository and upload **all** of these files, keeping the
   folder structure (`css/`, `js/`, `icons/` and the files in the root).
2. Repo → **Settings → Pages** → *Source: Deploy from a branch* → branch `main`,
   folder `/ (root)` → **Save**.
3. Open the URL GitHub gives you (e.g. `https://<user>.github.io/<repo>/`).

All paths are relative, so it works from a sub-folder URL with no edits.

## 2. Firebase one-time setup

The Firebase project is already wired in `js/firebase.js`. In the
[Firebase console](https://console.firebase.google.com/) for project
**dpr-management** (or your own — just replace the config), do this once:

1. **Build → Authentication → Get started → Sign-in method →** enable
   **Email/Password**.
2. **Build → Firestore Database → Create database** (Production mode, nearest region).
3. **Firestore → Rules** tab → paste the contents of **`firestore.rules`** →
   **Publish**.
4. **Authentication → Settings → Authorized domains →** add your GitHub Pages
   domain (e.g. `your-user.github.io`).

That's all the console work required — the code itself needs no editing.

## 3. First login (admin)

- On the login screen enter **User ID:** `admin` **Password:** `admin@54321`.
- The first successful login automatically creates the admin account and its
  role document. Use the same credentials from then on.
- To change the admin password later, use **Authentication → Users** in the
  Firebase console (the bootstrap value lives in `js/auth.js`).

## 4. Roles

- **Admin** — full control: add/edit engineers, **edit any form field**
  (rename, mark required, hide, reorder — including built-in fields), add
  custom fields, change settings, edit/delete any DPR, export CSV/Excel.
- **Engineer** — signs in by picking their profile + numeric PIN, then
  creates and updates their own DPRs and views the dashboard/reports.

Add engineers from the **Engineers** tab; each gets a 4–10 digit PIN.

## 5. Install as an app

- **Android / Chrome / Edge:** tap **Install** in the top bar (or the browser's
  install prompt). 
- **iPhone / iPad (Safari):** tap **Install**, then follow the on-screen steps
  (Share → Add to Home Screen).

The app then opens full-screen from the home screen with its own icon.

## Security note

Engineers are not Firebase-authenticated (they use a profile + PIN checked on
the client), so `firestore.rules` allows unauthenticated reads of engineer
profiles and reads/writes of DPR entries. This is fine for an internal tool.
To harden it, migrate engineers onto real Firebase Auth accounts and tighten
the `dprEntries` / `engineers` rules to check `request.auth`.

## Form behavior (work types)

- **Work Type** drives which fields appear:
  - **Pipe Laying** → Location, Pipe Dia, Laying Length, Fittings, Manpower, Contractor, Remarks
  - **Hydro Test** → same as above but no Fittings
  - **Road Restoration** → Location, **Restored Length & Width** (no pipe details), Manpower, Contractor, Remarks
- **Laying Work** = Distribution Main / Transmission Main / House Service Connection / Restoration.
  The **Transmission Stretch Name** field appears only for *Transmission Main*.

## Admin: no more code edits

In **Admin → Field Editor** you can edit any field (including built-ins),
add new fields, hide/show, drag to reorder, and set **Show For Work Type** /
**Show For Laying Work** so a field only appears for the right activity.
Any field you add automatically shows up in the **CSV/Excel export**.

When you upgrade an existing database, the new **Restored Length/Width** fields
are added automatically the next time an **admin** signs in — your existing DPR
data is preserved.
