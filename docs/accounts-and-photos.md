# Accounts, connections and photo posts

The home screen and **Teams & players** navigation show all team and player cards.
Team cards open the roster, captain and match details. Player cards open their profile,
connections, photos and activity. Static assets use no-store caching to avoid stale UI.

## Accounts

Create an account on the sign-in screen using a name, email, password (10–128
characters), sport, city, region and country. Sign out from the top bar.
Each account has a separate player ID, profile, preferences, likes and saved posts.
Posts, stories and comments use the signed-in author's identity. Other accounts
cannot edit your profile. Historical demo players remain as sample content and
cannot be claimed through registration.

Passwords use Werkzeug scrypt hashes. Session cookies are HttpOnly and SameSite=Lax;
the database stores hashes of opaque session tokens, expires them after seven days,
and revokes them on logout. JSON mutations require the X-Dhoyo-Request header and
reject cross-origin requests. The old demo organizer header grants no permissions.
For an HTTPS deployment, set AUTH_COOKIE_SECURE=1 (especially behind a TLS proxy).
Registration currently does not verify email ownership; password-reset email and
organizer administration are not implemented.

The existing PostgreSQL sportspace_state JSONB row stores accounts, sessions,
userPreferences and sports content. No migration deletes or replaces the existing
sports data. This retains the current project's document storage design; all writes
serialize through its transaction lock. Legacy users is not an authentication table.
Account and session fields are never included in public API responses.

## Photos

Share → Add a photo uses the browser/OS file picker. The composer shows a preview,
a caption counter and removal control. Images keep their aspect ratio. The browser
resizes images and the server validates/re-encodes them with Pillow. Supported browser-
decodable photos under 5 MB are accepted; export unsupported HEIC files as JPG/PNG.
Photos are persisted in the existing PostgreSQL document as normalized image data.

Cloud sources depend on the device's configured providers:
- iPhone/iPad: Photo Library or Browse / Files (iCloud and installed file providers).
- Android: local photos and providers exposed by the system photo/file picker.
- Windows/macOS: local, downloaded or synced cloud files.
- Google Photos not exposed in the picker: download the image first and select it.

There are no direct Google Photos, Google Drive or OneDrive OAuth connections yet.
Those require provider application registration, OAuth credentials, redirect URLs,
and user consent. The UI explains the working device-picker path without displaying
nonfunctional provider buttons.

References:
- https://developers.google.com/photos/overview/authorization
- https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/
- https://support.apple.com/en-us/102238

## Validation

pytest app/tests covers authentication, account isolation, photo validation and
existing sports behavior. Legacy domain fixtures explicitly enable AUTH_TEST_DEMO
only inside their tests. Never enable that setting on a running website.
Browser smoke checks use a separate SQLite fixture with real registration and cookies.
