# Ring

Ring is the sports social home. Arenas are communities inside Ring, with their
own highlights, players, awards and squads. The game-inspired interface uses a
local cinematic arena background, dark navy and teal surfaces, lime accents,
photo stories, social posts, and subtle motion that respects reduced-motion
settings. Login and sign-up share the arena artwork, with responsive player
access cards, password visibility controls, account error messages and a local
eight-sticker sports pack.

## Assign Work To AI Teams

The [team workflow](../../../docs/ai-team/SKILL.md) defines Frontend, Backend,
QA, DevOps and Team Lead roles across Social, Booking and Tournaments.
Use it in an agent chat with a request like:

```text
Read docs/ai-team/SKILL.md.
Team: Frontend
Service: Booking
Task: Add a calendar for selecting available ground slots using demo data.
```

For a feature involving multiple teams, choose `Team: Lead` and describe the
complete outcome. The lead can delegate when the agent environment supports it,
or work through the roles sequentially. These files are reusable instructions,
not installed background workers. See the
[initial task suggestions](../../../docs/ai-team/tasks/README.md).

## Start The Website

Run the Flask server to use the arena, player rankings and persistent social API:

```bash
cd /root/byte-devops
python3 -m venv .venv
.venv/bin/python -m pip install -r app/requirements.txt
cd app
SPORTSPACE_SOCIAL_DB=/tmp/dhoyo-local.sqlite3 ../.venv/bin/python -m flask --app app run --port 8002
```

Open http://localhost:8002/ring. Stop with Ctrl+C. The older `/sportspace` link
also works.

Opening `index.html` directly or using `python3 -m http.server` does not run the
arena API. Match Updates, ground bookings and tournament demos remain available
without it, but player rankings, support and team management require Flask.

Visitors first see the login page and can switch to sign-up to create their own
player account. Signed-in players see Ring's personalized social feed and photo
stories. Discover Arenas opens sport communities such as Afterhours FC and Zero Ping. Community
pages contain Highlights, Players & awards, and Squads subsections, with breadcrumb
navigation back to Ring. Arena membership persists separately from squad membership.
Player profiles retain organizer awards, games, wins and 0.2-point community
support. Ground booking, tournaments and saved activity remain available.

The application persists player awards, team membership, support, posts,
engagement, interests, follows and stories in PostgreSQL by default. The explicit
`SPORTSPACE_SOCIAL_DB` override above uses SQLite for local development without
Neon. Set it to a writable persistent path to keep local data outside `/tmp`.
Accounts use individual player identities and session cookies. Login, sign-up
and sign-out are served by `/api/auth`. The explicit demo identity used by older
domain tests is separate from the normal account flow.

The login screen's **Forgot password? Reset password** action sends a six-digit
verification code to the registered email, including Gmail addresses. Enter the
code and a matching new password to recover the account. Codes expire after ten
minutes, allow five verification attempts, and can be used once. Recovery keeps
the profile and sports activity and signs out the account's old sessions.
**Profile → Password & security** lets signed-in users change their password
with their current password, or request a recovery code. Email delivery requires
a configured sender; see the [Gmail and other sender setup](../../../docs/password-reset.md).

Booking and tournament activity remains browser-local under `sportspace-v1`.
There are no payments, shared booking inventory, or real event registrations.
Sample images load from Unsplash and require internet access. Uploaded raster
photos are stored with the demo state. Sample venues, people and
events are illustrative. Lucide icons are bundled locally with their license.

## Social Feed

- The three main feed modes are Global, Country and State. State is selected
  initially and includes only the profile's state within its country. Country
  includes that nation with the home state first. Global includes all locations,
  ordered home state → rest of country → international, then by relevance within
  each group. Location and interests are editable from the feed or profile.
- Stories use the same geographic scope. Country and State come from the player's
  saved profile location; the feed has no independent country picker. The profile
  editor's **Use my current location** button requests browser location permission
  and fills city, state and country. The player saves the profile to apply it.
  Permission denial or lookup failure keeps the saved location and allows manual
  editing. Posts retain their publication location.
- The legacy For You, Following and city-local API modes remain compatible.
- Player ranks are Star, Diamond, Gold and Silver, based on organizer awards.
  Likes, comments and saves on a post do not grant those awards. A player's
  official tier can provide a bounded local discovery boost.
- Stories accept JPG, PNG or WebP uploads or image URLs and expire after 24 hours.
  The viewer supports previous, next, arrow keys and Escape. Post photos and full
  profile photos also support raster uploads; full photos preserve aspect ratio.

## Player profiles and connections

**Friends & requests** on Home and in the menu opens incoming requests. Use
**Find players → Add friend** or a registered player's profile to send one.
Only accepted requests create friendships; sample players cannot receive them.
**Edit profile → Who can see your photos? → Friends only** restricts profile
photos, photo posts and stories to the owner and accepted friends. The setting
applies to existing photos, persists across sign-ins and defaults to public for
existing profiles. Text posts and sporting results remain visible. Server checks
protect the feed, profiles, stories and directory avatars. Friendship changes
clear loaded photos and reload the allowed content.

The full connection map appears at the top of Home and as the first section of every
profile, before the player stats, photos and stories. The separate
Connections navigation item and profile tab have been removed. A fixed bottom
bar provides Home, Explore, Share, Saved and Profile on desktop and mobile.
Profiles have Moments, Matches, Rank & awards and Photos sections.
`GET /api/arena/players/<id>` loads the player's own posts and active stories
regardless of the visitor's feed mode. Stories show their author and the profile
story viewer navigates only that player's stories.

Connections show every accepted squad membership, not just squads the player
leads. Teammate cards include games, wins and rank and open complete profiles.
Shared match participants also appear as connections. Squad and match links open
rosters, results and award events. Pending applicants are not accepted connections.
Seeded historical game and award totals are distinguished from detailed records.
Profiles include follow/support actions, editable geography and a copy-link button.

## Friends and friend requests

Open **Friends** in the top bar or **Find players** in Connections to search other
registered players by name or sport. Choose **Add friend** to send a request.
The recipient's Friends badge shows pending incoming requests. In **Requests**,
recipients can accept or decline, and senders can cancel their pending requests.
The **Friends** tab lists accepted friends, links to their profiles, and allows
either player to remove the friendship. Registered player profiles also have
friend request controls; your own profile includes **Manage friends**.

Requests and friendships persist in the same PostgreSQL or explicit local SQLite
state as accounts. Accepted friends appear in both players' profile connection
maps. Pending requests are visible only to their sender and recipient and do not
count as connections. Friendships are independent of follows, squad memberships,
support and awards. Sample profiles cannot receive requests. Duplicate requests,
self requests and actions by unrelated accounts are rejected. The sender comes
from the signed-in session, and existing authentication and CSRF checks apply.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/friends` | Own friends, incoming and outgoing pending requests |
| GET | `/api/friends/players?q={query}` | Find other registered players and their relationship to the visitor |
| POST | `/api/friends/requests` | Send `{ "playerId": "..." }` |
| POST | `/api/friends/requests/{requestId}` | Submit `{ "action": "accept" }`, `decline`, `cancel` or `remove` |

## Private sticker messages

Open **Stickers** in the top bar to browse the pack before choosing a recipient.
Select a sticker and choose **Send to player** to pick a registered player, then
confirm with **Send sticker**. **Share sticker** opens the device's share chooser
when supported, using a transparent PNG image when file sharing is available.
**Copy link** and **Download** also let users share through other apps. If a
browser cannot open sharing or access the clipboard, the sticker link remains
available to copy manually. A failed catalog load has a **Try again** button.

Sign in, open **Messages** in the top bar, then find another registered player by
name or sport. Select a player and choose a sticker to send it. The pack includes
Good game, fire, a trophy, a wave, a heart, a football, a star and a fist bump.
Registered players can also open Messages from another account's profile.
Sample player profiles are excluded because they have no account to receive messages.

Conversations persist in the same PostgreSQL or explicit local SQLite state as
accounts. Only the sender and recipient can read their shared messages. The
server derives the sender from the session and accepts only catalog sticker IDs.
The inbox shows unread counts and refreshes incoming stickers while open.
Opening a conversation marks its incoming stickers as read. Stickers load from
local SVG assets and do not require an external sticker service.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/messages/players?q={query}` | Find other registered players by name or sport |
| GET | `/api/messages/conversations` | Own conversations and unread counts |
| GET | `/api/messages/conversations/{playerId}` | Own conversation with that player; mark incoming stickers read |
| POST | `/api/messages/conversations/{playerId}` | Send `{ "stickerId": "gg" }` to another registered player |

`POST /api/arena/location/resolve` resolves coarse device coordinates through
[Nominatim reverse geocoding](https://nominatim.org/release-docs/latest/api/Reverse/).
It stores the returned city/state/country and a cache fingerprint, not raw
coordinates. Lookups are cached for 24 hours and spaced at least two seconds
apart across workers using the shared state. No automatic polling is used.
The editor includes OpenStreetMap attribution. Internet access is required for
detection; manual profile location still works offline from the provider.

The deterministic scoring algorithm is a starter, not a trained recommendation
model. Production work needs real identities, per-user engagement tables, moderation,
rate limits, pagination, and a production data model. Flask is required for
player ranking and persistence.

## Player Awards And Community Stars

The example "3 Star, 20 Diamond, 30 Gold, 40 Silver" is interpreted as one
player's award counts. These are not promotion thresholds or quotas of players.
The seeded Maya Rao profile demonstrates that collection.

Each tier has a dedicated standings subsection linked from the arena. A player
must have an organizer award in that tier to enter its standings. Category rating
is that tier's organizer award count plus community points. Five distinct people
supporting a player add 1.0 community point; each person contributes 0.2.
Support can be removed, and repeated clicks cannot accumulate extra points.
Community points do not issue organizer awards or promote an official badge.

Organizer awards must reference a completed match and a participating player.
The demo rejects duplicate awards for the same match, player and tier. Games and
wins provide performance context; no universal conversion from a game result to
an award is assumed. The organizer chooses the earned category and count.

The organizer console is explicitly a demo role. Its `X-Demo-Role: organizer`
header is not authentication. All supporters currently use the same demo user ID,
so multiple browsers do not count as distinct people. Production needs trusted
user IDs, authorized organizers, real result verification and an audit policy.

Fixtures marked live are sample match states, not a live sports data integration.

## Files

- `index.html`: page structure and accessible dialog.
- `auth-ui.js` / `auth.css`: player login, sign-up and session access UI.
- `account-security.js`: profile password updates and email-code recovery entry.
- `stickers.js` / `stickers.json`: retryable shared local sticker catalog and login preview.
- `stickers-ui.js` / `stickers.css`: sticker pack, sharing, copy and image download.
- `messages.js` / `messages.css`: private sticker inbox and recipient search.
- `friends.js` / `friends.css`: player discovery, friend requests and friends list.
- `../../friends.py`: persistent friendships and participant-only request actions.
- `assets/stickers/`: original SVG sports stickers.
- `game.css`: arena artwork, game-inspired community styling and reactions.
- `assets/game-arena.webp`: local optimized arena artwork. See
  [the generation prompt](assets/README.md) for provenance.
- `style.css`: responsive layout and visual styling.
- `app.js`: sample data, rendering and browser-local actions.
- `social.js`: refreshed social UI, story viewer, API integration and static fallback.
- `social.css`: social layout, ranks and responsive styling.
- `arena.js` / `arena.css`: arena, category standings, player profiles and teams.
- `ring.js` / `ring.css`: Ring social home, Arena discovery, community hierarchy
  and the dark visual theme.
- `player-hub.js` / `player-hub.css`: geographic feed controls, complete player
  profiles, media uploads and player-centered connection maps.
- `../../geography.py`: existing demo geography migration and scope ordering.
- `../../social.py`: social API and recommendation scoring.
- `../../arena.py`: player achievements, supporter ledger, teams and demo awards.
- `../../messages.py`: authenticated private conversations, delivery and unread counts.

## Backend implementation

Arena endpoints return the current arena state (`players`, `teams`, `matches`,
`currentUserId`, `awardOrder`) after mutations. The demo identity is assigned on
the server; clients cannot supply a different supporter ID.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/arena` | Arena data and player award/support breakdowns |
| POST | `/api/arena/communities/{id}/membership` | Join or leave an Arena community |
| POST | `/api/arena/players/{id}/support` | Toggle one community star worth 0.2 |
| POST | `/api/arena/teams/{id}/join` | Request team membership |
| POST | `/api/arena/teams/{id}/members` | Owner adds an eligible `playerId` |
| POST | `/api/arena/teams/{id}/requests/{requestId}` | Owner approves/rejects a request |
| POST | `/api/arena/awards` | Demo organizer awards `tier`, `count` to `playerId` for `matchId` |

The implemented demo social API uses `/api/social`:

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | `/api/social/feed` | `mode=for-you`, `following`, or `local`; optional `sport`, `q`, `city` |
| GET/PATCH | `/api/social/preferences` | Read/update sports and city |
| POST | `/api/social/posts` | Create a text post with sport |
| POST | `/api/social/posts/{id}/like` | Toggle like |
| POST | `/api/social/posts/{id}/save` | Toggle saved post |
| POST | `/api/social/posts/{id}/comments` | Add comment |
| POST | `/api/social/follow` | Toggle followed author name |
| GET/POST | `/api/social/stories` | Read active stories/create a 24-hour story |

Feed responses contain `posts`, `stories`, and `preferences`. Errors use an
`error` field and a non-success status. Mutation requests are JSON.

Post creation accepts optional `communityId`. It must name an existing Arena
whose sport matches the post; the server records that Arena's city. Arena pages
use this association to keep their highlights together. Communities are public;
joining is not required to post in this demo.

Remaining backend work:

| Service | Suggested endpoints | Responsibility |
| --- | --- | --- |
| Social | Extend `/api/social` | Real accounts, uploads, moderation, production persistence |
| Booking | `/api/grounds`, `/api/grounds/:id/availability`, `/api/bookings` | Inventory, reservations, cancellations |
| Tournaments | `/api/tournaments`, `/api/tournaments/:id/registrations` | Teams, registration, schedules, brackets and results |

Use a shared identity provider and enforce ownership and roles on the server. Ground availability must be checked and reserved atomically in the booking database; this prototype only prevents conflicting slots within its own browser state. The tournament demo covers registration only; scoring and bracket management still need implementation. Avoid collecting real personal data in this demo.
