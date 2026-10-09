# Password recovery

From the login page, choose **Forgot password? Reset password**, enter the
account email (including Gmail addresses), and choose **Send verification code**.
Enter the six-digit code received by email, a new password, and its confirmation,
then choose **Reset password**. Passwords must contain 10–128 characters; every
character, including spaces, is preserved. After resetting, sign in with the
new password. `/ring#forgot-password` also opens recovery directly.

Codes expire after ten minutes, can be used once, and allow at most five
verification attempts. Only a scrypt code hash and the digest of an opaque
challenge identifier are stored. Request responses are identical for registered
and unregistered addresses. The code and challenge never enter the page URL.
Successful recovery revokes account sessions, other codes, legacy reset links
and failed-login limits. Failed email delivery leaves an earlier working code
usable. Codes require a configured email sender; no link base URL is needed.

Signed-in users can open **Profile → Password & security** to update their
password after confirming the current password. This keeps the current browser
signed in with a newly rotated session and signs out the account's other
devices. The same dialog offers **Send a reset code** when the current password
is forgotten. **Back to profile** returns without changing the password.

| Method | Endpoint | Input |
| --- | --- | --- |
| POST | `/api/auth/request-password-code` | `{ "email": "player@gmail.com" }` |
| POST | `/api/auth/reset-password-code` | `{ "challengeId": "…", "code": "123456", "password": "…" }` |
| POST | `/api/auth/change-password` | `{ "currentPassword": "…", "password": "…" }` |

Existing reset links remain supported, expire after 30 minutes, and can be used
once. Only a token digest is
stored in the existing PostgreSQL or explicit local SQLite state. Successful
resets revoke the account's sessions, outstanding reset links, and login lockouts.
The browser immediately removes the token from the address bar and keeps it in
memory for the reset request. Account profiles and sports data are retained.

The request response is the same for registered and unregistered email addresses.
Code and link requests share limits of three per email and twenty per client
address in fifteen minutes. Reset submissions are limited to ten per address in
that period. Signed-in password changes allow ten attempts per account and client
address in fifteen minutes.
Missing sender configuration shows a service-unavailable message. Delivery errors
are logged without tokens or credentials; recipient-specific errors keep the
generic response so they cannot reveal whether an account exists.

Address limits currently use the connection's `remote_addr`. Behind Render's
proxy, that can be shared by multiple visitors. An operator can apply Flask's
`ProxyFix` with the verified number of trusted proxy hops to distinguish visitors;
do not choose a count or trust forwarded headers without verifying the ingress
chain. [Render's proxy guidance](https://render.com/articles/how-render-handles-ddos-attacks),
[Flask's proxy configuration](https://flask.palletsprojects.com/en/stable/deploying/proxy_fix/).

## Gmail on Render

Use the Gmail API to send over HTTPS. The repository's Render free service cannot
send outbound SMTP traffic on ports 25, 465, or 587, so Gmail SMTP and app passwords
on those ports will not work with that plan.
[Render's free-service limits](https://render.com/docs/free).

Authorize the Gmail account that will send recovery emails:

1. Create a Google Cloud project, enable the Gmail API, and configure its OAuth
   consent screen for the sender account.
2. Create a **Web application** OAuth client. For the manual authorization below,
   add `https://developers.google.com/oauthplayground` as an authorized redirect URI.
3. Open [Google's OAuth Playground](https://developers.google.com/oauthplayground/),
   select **Use your own OAuth credentials** in its settings, and enter that
   client's ID and secret. Keep access type **Offline**.
4. Authorize only `https://www.googleapis.com/auth/gmail.send` while signed in as
   the sender. Exchange the authorization code for tokens and retain the refresh
   token privately. The account must match the sender address below.
5. Add these variables in the Render service's **Environment** settings, then
   deploy the application changes:

| Variable | Value |
| --- | --- |
| `GMAIL_CLIENT_ID` | Your Google OAuth client ID |
| `GMAIL_CLIENT_SECRET` | Its secret |
| `GMAIL_REFRESH_TOKEN` | The sender's refresh token |
| `PASSWORD_RESET_FROM` | The authorized Gmail address or its verified send-as alias |
| `PASSWORD_RESET_BASE_URL` | `https://byte-ring-demo.onrender.com/static/sportspace/index.html` (only required for legacy links) |

Keep credentials in Render's private environment settings. A Gmail login password
or app password is not an OAuth refresh token. The application requests access
tokens on the server and sends MIME email through `users.messages.send`; no mail
credentials are sent to the browser.
[Google's Gmail sending guide](https://developers.google.com/workspace/gmail/api/guides/sending),
[offline authorization](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

Use your own OAuth client: the Playground's default credentials produce refresh
tokens that it revokes after 24 hours. External OAuth applications in **Testing**
can also have short-lived refresh tokens; follow Google's consent-screen and
authorization requirements for a lasting deployment.
[OAuth Playground instructions](https://developers.google.com/oauthplayground/),
[Google's token expiration rules](https://developers.google.com/identity/protocols/oauth2#expiration).

## Other sender configurations

Gmail configuration takes priority when present. Leave all Gmail settings unset
to use Resend instead: set `RESEND_API_KEY`, `PASSWORD_RESET_FROM` to a verified
sender, and `PASSWORD_RESET_BASE_URL`. It also sends over HTTPS.
[Resend's send-email API](https://resend.com/docs/api-reference/emails/send-email).

For a host that permits SMTP, leave the HTTPS provider credentials unset and set
`SMTP_HOST`, `SMTP_FROM`, and `PASSWORD_RESET_BASE_URL`. Optional settings are
`SMTP_PORT` (587), `SMTP_USERNAME` and `SMTP_PASSWORD` as a pair, and
`SMTP_USE_TLS` (true, using STARTTLS). For local testing, the base URL may use
HTTP with `localhost` or `127.0.0.1`; public deployments require HTTPS. The reset
URL always comes from this configured value, never the request's Host header.

## Diagnosing login failures

Login treats email addresses without regard to case and trims their surrounding
spaces. Passwords are compared exactly. A successful password reset clears the
account's failed-login limits. Repeated failed logins otherwise impose a
15-minute limit and report it explicitly.

Ensure Render's `SPORTSPACE_SOCIAL_DB` variable is unset when using Neon. Setting
it selects a local SQLite file, which Render can remove on restart or redeploy.
The legacy `/users` table and sample player profiles are separate from registered
accounts and cannot be used as login credentials. Database health alone does not
prove that a particular account exists.

## Validation

Run `.venv/bin/python -m pytest app/tests -q` and
`node app/tests/test_auth_ui.cjs`. Tests cover exact-password login after a new
application process, recovery forms, token expiry and replay, session revocation,
rate limits, sender configuration, and mocked email delivery. Test fixtures never
send real email or alter accounts on the deployed website.
