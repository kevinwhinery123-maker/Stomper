# Tempo password-reset setup

Tempo now has a **Forgot password?** button and a secure reset flow. The app creates a random one-time reset token, stores only a hash of it in Neon, expires it after one hour, and signs out older sessions after the password is changed.

For real users to receive the reset link on the public Railway site, you must connect an email sender. The code is ready for [Resend](https://resend.com/).

## What you need

- A free Resend account.
- A sender address from a domain you control and verify in Resend, such as `support@yourdomain.com`.
- Your Railway project.

Resend requires an API key and a verified domain/sender for normal email delivery. Do not use your personal email password in Tempo or Railway.

## Setup steps

1. Create an account at [resend.com](https://resend.com/).
2. In Resend, add and verify a sending domain. Resend gives you DNS records to add where you bought the domain. This protects deliverability and lets Tempo email testers.
3. Create an API key in Resend. Copy it once and keep it private.
4. Open Railway -> Tempo service -> **Variables**.
5. Add these three variables:

| Variable | Value |
| --- | --- |
| `PUBLIC_APP_URL` | `https://stomper-production.up.railway.app` |
| `RESEND_API_KEY` | Your Resend key beginning with `re_` |
| `RESEND_FROM_EMAIL` | `Tempo <support@your-verified-domain.com>` |

6. Railway will redeploy automatically. Wait until the deployment is successful.
7. Open Tempo in a private/incognito browser. Use **Profile -> Forgot password?**, enter an email for a test account, and confirm the reset email arrives.
8. Open the link, set a new password, then sign in with it.

## Before Resend is configured

The Forgot password screen will appear, but public users cannot receive a reset email yet. This is intentional: Tempo never reveals a reset token in the public page.

For local development only, submit a reset request while `node server.js` is running. The local reset link is printed in the PowerShell server window. Never use that local-development shortcut as a public recovery process.

## Safety notes

- Keep `RESEND_API_KEY` only in Railway Variables and local `.env`, never GitHub.
- Use a dedicated sender such as `support@...`, not your personal inbox password.
- Tempo returns the same message whether or not an account exists. This prevents people from using the reset form to discover who has an account.
- Reset links expire in one hour and work once. A successful password reset signs out older sessions.
