# Tempo private-beta launch: Railway guide

This guide puts Tempo online so a small group of testers can use it from their phones. Do not share database passwords or API keys in GitHub, screenshots, or chat.

## Before you begin

- Your Tempo project is pushed to GitHub.
- Your Neon database is working locally.
- You are launching a private beta for people 18 or older.

## 1. Create a Railway account

1. Visit https://railway.app and create an account. Choosing **Continue with GitHub** is easiest.
2. Create a new project.
3. Choose **Deploy from GitHub repo**.
4. Select the `kevinwhinery123-maker/Stomper` repository.
5. Railway should recognize this as a Node application. If it asks for a start command, enter `npm start`.

## 2. Add the private variables

In the Railway service, open **Variables**. Add these one at a time:

| Name | What to enter |
| --- | --- |
| `DATABASE_URL` | Copy the full connection string from your Neon project. |
| `NODE_ENV` | `production` |
| `FEEDBACK_RECIPIENT_EMAIL` | `kwhin03@gmail.com` |

Do not add an OpenAI key for this first beta unless you deliberately want to pay for live AI. Tempo Beta Coach works without it.

## 3. Configure the health check

1. Open the Railway service **Settings**.
2. Find **Healthcheck**.
3. Set the path to `/health`.

Tempo now has this route. Railway uses it to make sure a new version can reach Neon before it sends visitors to it.

## 4. Deploy and get the tester link

1. Railway deploys automatically after you save variables.
2. Open the deployment logs. You want to see `Tempo is running with Neon` and no red errors.
3. In **Settings** or **Networking**, generate a Railway domain.
4. Open that link in an incognito/private browser window.
5. Create a brand-new test account, save a profile, log one activity, and then delete that account from Profile. This confirms the public version, database, account deletion, and cookie all work.

## 5. Invite a small first group

Start with 5–10 adults you know. Tell them:

> Tempo is a private fitness-planning beta. It gives general fitness guidance, not medical advice. Please do not enter medical information. Use the feedback box in Today to report anything confusing or broken.

Ask each tester to try: creating an account, building a plan, changing today’s workout, logging a workout, editing it, using Coach, and sending feedback.

## Protect the database before testers join

1. Open your Neon project.
2. Open **Settings**, then **Restore window**, and confirm that a restore window is enabled. Keep the default if you do not want to pay for a longer window.
3. Before your first invite, open **Backup & Restore** and create a snapshot if that feature is available on your Neon plan. If it is not, create a clearly named branch such as `before-private-beta` instead.

This gives you a safe point to return to if a beta bug changes or deletes data unexpectedly.

## 6. After the first week

Review the saved feedback in Neon, the `app_errors` table in Neon, and any Railway deployment logs. Tempo saves only the request method, route, time, and a short technical error message in `app_errors`—not a user's workout or Coach message. Fix high-impact issues before sharing the link more widely. Keep Strava, Garmin, Samsung Health, and paid AI marked **Coming soon** until you have tested those integrations separately.

## Important notes

- Railway automatically supplies a `PORT`; Tempo already uses it.
- Tempo creates its database tables, including durable sign-in sessions, when it starts.
- A Railway restart should no longer sign everyone out.
- A custom domain can wait until testers say the product is useful.
