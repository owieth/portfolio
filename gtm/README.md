# GTM container — setup runbook

The GA4 tags, triggers and variables that turn this site's `dataLayer` pushes
into GA4 events live in Google's UI, not the repo — unversioned, unreviewable,
and a lot of clicking to reproduce. [`container.json`](./container.json) ships
them as an importable Tag Manager export (`exportFormatVersion: 2`) so the whole
GA4 configuration is version-controlled and rebuildable.

GA4 is configured **inside** this container. The app loads only GTM
(`<GoogleTagManager>` in `src/components/analytics/AnalyticsScripts.tsx`); there
is no separate `<GoogleAnalytics>` script, so there is no double-tagging.

## What the container contains

- **1 Constant** — `GA4 Measurement ID`, the single place every tag reads the
  `G-…` id from.
- **20 Data Layer Variables** — one per event parameter across the stack, plus
  one per user property (dot-notation, e.g. `user_properties.throw_count`).
- **1 Google tag (GA4 config)** on *Initialization – All Pages*, with
  `send_page_view: false`, a `traffic_type` field, and the six user properties.
  It also fires on the `set_user_properties` event so the user properties
  refresh once game state is known.
- **9 GA4 Event tags** — one per client event, each on a Custom Event trigger
  matching the `dataLayer` `event` name.
- **Consent settings** requiring `analytics_storage` on every tag.
- **Folders** per domain: `Site`, `wo-haere`, `Vitals`.

Server-side events (`*_server`) are **not** in this container — they reach GA4
directly through the Measurement Protocol
(`src/lib/analytics/server/measurement-protocol.ts`) and bypass GTM entirely.
They still need custom dimensions registered (see below).

## Prerequisites

- A **GA4 property** with a **Web data stream**. Its Measurement ID
  (`G-XXXXXXXXXX`) is the value of `NEXT_PUBLIC_GA_ID`.
- A GTM **web** container. Its public id (`GTM-XXXXXXX`) is the value of
  `NEXT_PUBLIC_GTM_ID`.
- Env vars set on the deployment (see [`.env.example`](../.env.example)):
  `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GA_ID`, and — for the server layer —
  `GA4_API_SECRET`. Unset ⇒ the whole analytics layer no-ops.

## Import

1. Tag Manager → **Admin → Import Container**.
2. Choose [`container.json`](./container.json).
3. Workspace: **Existing → Default Workspace** (or a new one).
4. Import option: **Merge → Overwrite conflicting tags**.
5. Confirm, then open the **`GA4 Measurement ID`** Constant and set its value to
   your `NEXT_PUBLIC_GA_ID` (`G-7W2C85629N`). GTM can't read the Next.js env
   var, so this Constant is the one value you set by hand.
6. **Preview** the container against a deployment that has the real ids set, then
   **Submit → Publish**.

> **Heads-up.** GTM validates uploads against its own schema and can reject a
> hand-authored export, and its field names drift between versions. Budget one
> import/fix round trip; if the file won't take, build it by hand from the
> [manual fallback](#manual-fallback) below — that path is the guarantee.

## Three steps that are easy to lose a day to

### 1. Register the event params as custom dimensions

Event-scoped params are collected but **completely invisible in reports until
registered** — the data looks lost when it isn't. GA4 Admin → **Custom
definitions → Custom dimensions**, scope **Event**, one per param:

`page_path`, `page_title`, `link_url`, `link_text`, `link_domain`,
`nav_location`, `project_slug`, `cta_label`, `referrer`, `metric_name`,
`metric_rating`, `metric_id`, `traffic_type` — plus the server params
`art`, `upstream_ms`, `kanton`, `wasser`, `hoechi`, `distanz_km`, `richtig`,
`grund`, `has_wurf`, `resolved`, `status`, `client_source`, `session_id`.

- `metric_value` is numeric — register it as a **Custom metric** instead.
- The six user properties — `throw_count`, `cantons_collected`,
  `dart_skins_unlocked`, `color_scheme`, `reduced_motion`, `pointer_type` —
  register as **User**-scoped custom dimensions.

### 2. Switch off Enhanced Measurement page-change tracking

`page_view` is sent from code (`PageViewTracker`). In the Web data stream →
**Enhanced Measurement** → gear → turn **off** *"Page changes based on browser
history events"*. Leaving it on double-counts every client-side navigation.

### 3. Internal traffic + bots

- Owner visits carry `traffic_type: internal` (set via `?ow_internal=1`; see
  `src/lib/analytics/internal-traffic.ts`). Define the internal-traffic rule —
  Web data stream → **Configure tag settings → Show all → Define internal
  traffic** — matching `traffic_type` **equals** `internal`, then add the
  matching **Data Filter** (Admin → **Data Settings → Data Filters**) and set it
  to *Active*.
- Confirm list-based **bot filtering** is enabled (Admin → Data Settings → Data
  Collection); it excludes known bots and spiders.

## Verify

- **Preview / Tag Assistant** — navigate the site and confirm each `dataLayer`
  event (`page_view`, `outbound_click`, …, `web_vitals`) fires its tag exactly
  once, that the Google tag sends no automatic `page_view`, and that
  `traffic_type` and the user properties populate.
- **GA4 DebugView** — client events appear, and the server `*_server` events
  land too (they need `GA4_API_SECRET`; verify separately since they skip GTM).

## Manual fallback

If the import is rejected, recreate it by hand in a fresh workspace. Order
matters: variables → triggers → tags.

1. **Constant** `GA4 Measurement ID` = your `NEXT_PUBLIC_GA_ID`.
2. **Data Layer Variables** (Version 2), one per param name listed under
   [custom dimensions](#1-register-the-event-params-as-custom-dimensions), plus
   `user_properties.throw_count` and the other five user properties.
3. **Custom Event triggers**, one per client event name: `page_view`,
   `outbound_click`, `internal_link_click`, `nav_click`, `project_cta_click`,
   `download_click`, `citation_click`, `page_not_found`, `web_vitals`, and
   `set_user_properties`.
4. **Google tag (GA4 config)** → tag id `{{GA4 Measurement ID}}`; set
   `send_page_view` to `false`; add field `traffic_type` = `{{traffic_type}}`;
   add the six user properties from their `{{user_properties.*}}` variables.
   Triggers: *Initialization – All Pages* **and** the `set_user_properties`
   Custom Event.
5. **GA4 Event tag** per client event → *Measurement ID* = the Google tag above;
   *Event Name* = the event; add its params as event parameters; trigger = the
   matching Custom Event.
6. On **every** tag, Consent Settings → *Require additional consent* →
   `analytics_storage`.
7. Optionally sort into `Site` / `wo-haere` / `Vitals` folders.
