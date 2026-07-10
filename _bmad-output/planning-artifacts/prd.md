---
stepsCompleted:
  - step-01-init
  - step-02-discovery
  - step-02b-vision
  - step-02c-executive-summary
  - step-03-success
  - step-04-journeys
  - step-05-domain
  - step-06-innovation
  - step-07-project-type
  - step-08-scoping
  - step-09-functional
  - step-10-nonfunctional
  - step-11-polish
classification:
  projectType: mobile_app
  domain: general
  complexity: medium
  projectContext: greenfield
inputDocuments:
  - source: "Evergreen Lean React Build_Adrian.docx"
    type: brief
    path: "D:\\projects\\dublin-rn\\Evergreen Lean React Build_Adrian.docx"
  - source: "estimation-with-backend.md"
    type: estimation
    path: "D:\\projects\\dublin-rn\\estimation-with-backend.md"
workflowType: 'prd'
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 0
  projectDocs: 1
---

# Product Requirements Document - dublin-rn

**Author:** adrian
**Date:** 2026-06-28

## Executive Summary

Evergreen is a multi-tenant mobile-first platform connecting care home residents' families to their daily lives through photos, events, meals, and news — while giving staff a single admin portal to manage content across all homes.

**Target users:** Family members of residents (mobile app), care home staff and admins (admin portal), and super admins (platform-level).

**The problem:** 12 care homes each managing family communication independently — duplicated pages, paper forms, manual spreadsheets for events and meals. Families feel disconnected. Staff burn time on admin.

**The approach:** Custom-built React Native app + React admin portal + REST API with PostgreSQL. True multi-tenant via `home_id` scoping. Strict data isolation: family sees only their resident, staff see only their home, admins see all. V1 is lean by design — no AI, no chat, no payments.

### What Makes This Special

Purpose-built for care home groups, not generic white-label. A single platform that scales across homes while keeping data completely isolated per home. Replaces fragile manual workflows (duplicated pages, spreadsheets, forms) with a unified system where families get a consistent, personal window into their loved one's day.

### Project Classification

- **Project Type:** Mobile app (React Native, iOS + Android) with supporting Admin Portal (React Web) and Backend API (REST, PostgreSQL)
- **Domain:** General — senior care social/engagement platform. Non-clinical, standard privacy.
- **Complexity:** Medium — multi-tenant, multi-role (family/staff/admin/super admin), media storage, 12 homes
- **Context:** Greenfield — new product build



## Success Criteria



### User Success

1. **Staff efficiency** — Staff complete admin tasks (content updates, photo uploads, event management) in fewer steps than current spreadsheet/paper workflows. Measured by: task completion time reduction of 50%+ vs manual process.
2. **Family experience** — Family members can view resident photos, events, meals, and news within 3 taps of opening the app. Clean, intuitive navigation.
3. **Family engagement** — Families return weekly to check photos and upcoming events. Measured by: weekly active usage per linked family account.



### Business Success

- Platform operational across 12 care homes with per-home data isolation
- Manual spreadsheets and duplicated pages replaced by unified admin portal
- Admin overhead reduced: one content update propagates to the right home instantly



### Technical Success

1. **Data Safety** — Strict multi-tenant isolation: no cross-home data leakage at database, API, or application level. Verified by automated integration tests. Zero data loss on crash or upload failure.
2. **Launch Readiness** — All critical paths pass E2E: auth (login → onboarding → role-based nav), photo upload + gallery view, event sign-up flow. Each verified before release.
3. **Reliability** — 99.5% uptime during business hours. Graceful offline: app shows cached content, queues photo uploads for retry when connectivity returns.
4. **API Quality** — Consistent error format across all endpoints. Proper HTTP status codes, typed API contracts documented, uniform input validation error shape, and consistent pagination pattern applied to every list endpoint.
5. **Performance** — Mobile screens load in under 2s on good network. API responses under 200ms (p95).



## Product Scope



### MVP Strategy & Philosophy

**Problem-solving MVP** — Replace manual workflows causing pain (spreadsheets, paper forms, duplicated pages) with a unified multi-tenant platform. The "wow" moment: a family member sees a photo of their resident the same day it was taken.

**Team:** 1 Senior + 1 Junior developer. Estimated ~300 person-hours with full backend.

### MVP Feature Set (Phase 1)

**Core Modules:**

- Auth + RBAC + Multi-Home (family, staff, admin, super admin)
- Home-Specific Content Management (news, documents, menus, schedules, notices, announcements)
- Residents & Family Mapping
- Photo Sharing (upload, gallery, resident-scoped)
- Events & Outings (list, calendar, sign-up, CSV export)
- Meal Ordering (weekly menu, selection, orders, CSV export)
- Basic Analytics (active users, event sign-ups, photo uploads, per-home dashboard)

**Cross-Cutting:** Admin Portal (React Web) for content management. Backend API (REST + PostgreSQL) with strict multi-tenant isolation.

### Phase 2 (Post-MVP)

- Google Sheets sync (events + meals, per-home opt-in)
- Advanced push notification triggers (meal reminders, news alerts)
- Enhanced engagement features



### Phase 3 & V1 Exclusions

No AI, no chat, no payments, no advanced notifications, no offline model, no complex booking logic, no Google Sheets sync in V1. All deferrable to later phases.

### Risk Mitigation Strategy

**API Contract Drift (Parallel Backend + Mobile Dev)**
Define TypeScript API contracts before either side codes. Store shared types both projects import. Mobile implements against mock data (MSW) until backend stabilizes. CI validates endpoints match type definitions.

**Poor Care Home WiFi**
Compress photos client-side before upload (1920px max, ~300KB target). Failed uploads enter a queue with exponential backoff (30s → 2min → 5min, stop after 3 attempts). Cached content shown offline with banner. Pull-to-refresh retries on connectivity.

**Push Notification Token Management**
Device token registered on app launch. Backend stores (user_id, device_token, platform, home_id). When FCM/APNs returns InvalidRegistration, token marked dead. Next app launch re-registers fresh token.

**Home-Scoped Notification Routing**
Photo upload triggers backend query: all family members linked to that resident within the same home. Pushes sent only to their device tokens. Home_id filter prevents cross-home notification leakage.

**Photo Storage Costs**
Enforce max file size (10MB) on client and API. Archive photos older than 12 months to cold storage. Set billing alert at 50/month.

**Google Sheets Sync — Post-MVP**
CSV export is sufficient for launch. Sheets sync (OAuth per home, rate limits, per-home enable toggle) is a Post-MVP feature when a specific home demands it.

## User Journeys



### Maria — Family Member (Mobile App)

**Opening scene:** Maria lives 45 minutes from Evergreen Lodge. She calls the receptionist twice a week to ask how her dad is doing. She misses the holiday event because the flyer got lost in her bag. She doesn't know what he ate for lunch today.

**Discovery:** Maria gets an invite from the home: "Download Evergreen — see photos, events, and meals for your dad."

**Rising action:** She installs the app, enters the invite code, sees her dad's name + room. First thing she taps: **Photos**. There's a photo of him in the garden from yesterday — she saves it immediately. She scrolls the **Events** tab, sees a coffee morning on Thursday, taps **Sign up** — done. She checks the **Menu**, sees he has his favourite for lunch.

**Climax:** That evening she calls her dad. "I saw the photo of you in the garden! And I signed you up for coffee morning Thursday." Her dad lights up — she knew something real about his day.

**Resolution:** Maria opens the app 3-4 times a week. She's the first to sign up for events. She's stopped calling reception. She feels connected to his daily life in a way she never was before.

### Sarah — Staff Member (Admin Portal + Mobile)

**Opening scene:** Sarah works at Evergreen Lodge. Every Friday she prints the weekly menu, photocopies it 40 times, walks it to each corridor. When she takes photos of residents, she emails them individually to family members — 12 emails, every time. Event sign-ups come back on paper slips she has to manually tally.

**Discovery:** The home admin shows her the new admin portal: "Everything in one place."

**Rising action:** Sarah snaps a photo of Mr Chen in the garden on her phone, opens the app, selects his name, adds a caption, uploads. She opens the admin portal, creates a "Summer BBQ" event — title, date, time, location, capacity. Hits publish. Later she checks the attendee list — 8 families signed up already, no paper involved.

**Climax:** It's Thursday morning. She opens the portal, exports the meal order CSV for the kitchen in one click. The cook gets the list. No more tallying slips.

**Resolution:** Sarah's day has 45 minutes of admin back. She spends it on the floor with residents instead. She actually enjoys her job more.

### James — Home Admin (Admin Portal)

**Opening scene:** James runs Evergreen Lodge. He has a spreadsheet for residents, another for family contacts, a folder of photo consent forms. Every new family member means he digs through papers to find their resident link. Content updates mean editing each of the 12 homes' pages separately.

**Discovery:** Priya (super admin) gives him admin access. He logs in, sees his home's dashboard.

**Rising action:** He adds a new resident — name, room, photo, DOB — 30 seconds. Links the daughter's email to her dad — she gets an invite automatically. He opens the news editor, writes "Visiting hours extended for summer," publishes — it's on the app instantly.

**Climax:** A family member calls upset they missed an event. James opens the portal, sees the event had 32 sign-ups. He realizes the capacity was hit and adds a second session. Creates it in 2 minutes, families get notified.

**Resolution:** James spends 2 hours a week on content instead of 6. The spreadsheet folder gathers dust.

### Priya — Super Admin (Admin Portal)

**Opening scene:** Priya oversees 12 care homes. She has no view across them — each home runs its own systems. She can't tell which homes are engaging families and which aren't. Setting up a new home means manually creating accounts, linking everything.

**Discovery:** She logs into the platform dashboard for the first time.

**Rising action:** She sees: 12 homes, 340 active family accounts this week, 1,200 photos uploaded, 85 events created. She drills into one home — their engagement is low. She sees the home admin hasn't uploaded a photo in 3 weeks. She can investigate. She clicks "Add Home" — fills in name, address, timezone — done. Assigns a new admin. The home is live.

**Climax:** A new care group wants to join. Priya creates their home, assigns an admin, confirms data isolation is automatic. The whole onboarding takes 5 minutes.

**Resolution:** Priya manages all 12 homes from one dashboard. She knows which homes are thriving. Expansion from 12 to 20 homes means 5 minutes of setup each, not weeks of configuration.

## Mobile App Specific Requirements



### Project-Type Overview

React Native (Expo) app targeting iOS and Android. Single codebase delivering role-based experiences (family, staff) with content scoped per care home.

### Technical Architecture Considerations

- **Cross-platform:** React Native via Expo — single codebase for iOS and Android
- **Authentication:** JWT-based with secure token storage, auto-login via refresh tokens, role-gated navigation
- **API Architecture:** Axios client with auth interceptor, consistent error parsing, pagination helpers
- **Media:** Camera and gallery access for photo uploads. Cloudinary/S3 storage with auth-protected media URLs



### Platform Requirements

- iOS 15+, Android 12+ baseline
- App store compliance: standard privacy policy, permission explanations for camera/gallery on first use



### Device Permissions

- **Camera** — Photo upload (staff and family)
- **Photo library** — Upload existing photos
- **Push notifications** — Event reminders, photo alerts, cancellations
- **Not needed in V1:** GPS/location, calendar access, biometric auth, QR scanner, Bluetooth/NFC



### Offline Strategy

- **Graceful degradation only** (no full offline in V1): app shows cached content when offline, queues photo uploads for automatic retry when connectivity returns. No local DB or conflict resolution.



### Push Notification Strategy


| Trigger                               | Audience      | V1        |
| ------------------------------------- | ------------- | --------- |
| New photo uploaded of linked resident | Family        | ✅         |
| Event sign-up confirmation            | Family        | ✅         |
| Event reminder (day before)           | Family, Staff | ✅         |
| Cancellation (event/meal)             | Family        | ✅         |
| Meal order deadline reminder          | Family        | ❌ Post-V1 |
| New news post                         | Family        | ❌ Post-V1 |




### Store Compliance

Standard privacy policy covering photo/data usage and camera permissions. No healthcare claims or payment handling — low review risk. iOS App Store + Google Play submission.

### Implementation Considerations

- Keyboard avoiding view on all forms
- Pull-to-refresh on all list screens
- Skeleton loading states for media-heavy screens
- Deep link handling (push → event detail screen) in V1



## Functional Requirements



### Authentication & Onboarding

- FR1: **[CORRECTED 2026-07-09]** There is no self-service registration. Account creation is strictly hierarchical — a user with a higher role (`super_admin` → `home_admin` → `staff`/`family`) creates the pending account for a role below it (see FR11, FR48). The invited user activates that account by setting a password via a one-time token: inline during invite-code onboarding for family (FR5), or via a direct email link for staff/home admin (reusing FR3's reset mechanism).
- FR2: Users can log in with email and password
- FR3: Users can reset their password via email link
- FR4: Users can view and edit their own profile (name, email)
- FR5: Users can join a care home via invite code during onboarding
- FR6: Users can authenticate with automatic token refresh
- FR7: The app detects expired tokens and redirects to login with a message explaining the session expired
- FR8: The app shows a splash screen that resolves to the correct screen based on auth state
- FR9: Users can log out, clearing local session
- FR10: Users see role-based navigation (family vs staff vs admin) after login
- FR11: Admins can invite new users to their care home via email
- FR12: Home admins can view and manage user roles within their care home



### Home Content Management

- FR13: Family members can view news posts for their care home
- FR14: Family members can view documents/PDFs for their care home
- FR15: Family members can view weekly menus for their care home
- FR16: Family members can view schedules for their care home
- FR17: Family members can view notices for their care home
- FR18: Family members can view static info pages (visiting rules, contact details)
- FR19: Family members can view announcements for their care home



### Residents & Family Mapping

- FR20: Family members can view a list of residents linked to them
- FR21: Family members can view a resident's profile (name, photo, room, DOB)
- FR22: Admins can create and manage resident profiles per care home
- FR23: Admins can link family member accounts to specific residents



### Photo Sharing

- FR24: Staff can upload photos tagged to a resident with a caption
- FR25: Family members can view a gallery of photos for their linked resident
- FR26: Family members can view photos in full-screen with swipe navigation
- FR27: Uploads are queued for retry on connection failure



### Events & Outings

- FR28: Family members can view upcoming events for their care home
- FR29: Family members can view events in list or calendar format
- FR30: Family members can view event details (title, date, time, location, description, capacity)
- FR31: Family members can sign up a linked resident for an event
- FR32: Family members can view their registrations
- FR33: Family members can cancel a registration
- FR34: Admins can create, edit, and delete events
- FR35: Admins can view attendee lists per event
- FR36: Admins can export event registrations as CSV



### Meal Ordering

- FR37: Family members can view the weekly menu with day tabs and meal options
- FR38: Family members can select meals for a linked resident
- FR39: Family members can view current week's orders
- FR40: Family members can modify or cancel a meal order
- FR41: Staff can view meal orders by day
- FR42: Staff can export meal orders as CSV



### Push Notifications

- FR43: Family members receive push notification when a new photo of their resident is uploaded
- FR44: Family members receive push confirmation when they sign up for an event
- FR45: Users receive push reminder the day before an event they registered for
- FR46: Users receive push notification if an event or meal is cancelled



### Admin & Staff Management

- FR47: Super admins can create and manage care homes
- FR48: Super admins can assign home admins to a care home
- FR49: Super admins can create additional super admins
- FR50: Home admins can manage users for their care home
- FR51: Home admins can manage content (news, menus, schedules, notices) for their home
- FR52: Staff can upload photos for any resident within their care home
- FR53: Staff can create and manage events for their care home



### Analytics & Dashboard

- FR54: Super admins can view platform-level metrics (active users, content counts per home)
- FR55: Home admins can view home-level metrics (event sign-ups, photo uploads, family activity)



## Non-Functional Requirements



### Performance

- NFR1: Mobile screens load content in under 2 seconds on a good network connection (4G+)
- NFR2: API responses complete in under 200ms for 95th percentile under normal load
- NFR3: Photo gallery thumbnails load in under 1 second via server-side compression
- NFR4: Push notifications are delivered within 30 seconds of trigger event



### Security

- NFR5: All data in transit is encrypted via TLS 1.2+
- NFR6: All photo and document storage is encrypted at rest
- NFR7: API endpoints enforce home_id scoping — no user can access data from another home
- NFR8: Authentication tokens are stored securely on device (platform keychain)
- NFR9: Password reset links expire within 1 hour of request
- NFR10: API rate limits prevent abuse of auth endpoints (login, password reset)



### Scalability

- NFR11: Adding new care homes requires no code changes or downtime — super admin creates via UI
- NFR12: The system handles up to 2,000 concurrent users across all homes with no performance degradation
- NFR13: Photo storage design supports up to 50,000 photos before requiring archival or performance review



### Integration

- NFR14: Push notification delivery via FCM (Android) and APNs (iOS) with delivery status tracking
- NFR15: Email delivery for password resets and user invites retries on transient failure (3 retries: 60s → 5min → 30min)
- NFR16: CSV exports complete within 10 seconds for up to 5,000 rows

