# Tempo owner guide

This is the plain-English guide for running Tempo during the private beta. It explains what each service does, what is already built, what to watch, and what needs to happen next.

## The short version

Tempo is one product made from four connected pieces:

| Piece | Purpose | Where you use it |
| --- | --- | --- |
| Tempo code | The screens, coaching rules, sign-in, workout logging, and API. | This project folder and GitHub. |
| GitHub | The safe online copy and version history of the code. | `kevinwhinery123-maker/Stomper`. |
| Railway | Runs the Tempo Node server on the internet. It gives people the public site link. | Railway dashboard. |
| Neon | Stores permanent data: accounts, profiles, workouts, plans, Coach conversations, feedback, and errors. | Neon dashboard. |

The flow is: a tester opens the Railway link -> Tempo server runs the code -> Tempo reads or saves data in Neon -> the tester sees the result. GitHub is how you publish a code update to Railway.

## What Tempo currently does

People can:

- Create an account and stay signed in between Railway restarts.
- Save a profile: goal, experience, training days, session time, equipment, location, and optional constraints.
- Get a seven-day running, lifting, or hybrid plan with rest days.
- Change today's workout based on available time, energy, run/lift preference, or gym/indoor/outdoor setup.
- Mark a planned session complete or unavailable; Tempo re-spaces missed work conservatively.
- Log runs, lifting sets/reps/weight, recovery, CrossFit, and other workouts; edit a manual entry later.
- See recent activity and weekly/monthly/yearly summaries.
- Use the rules-based **Beta Coach** for some clear commands.
- Send beta feedback to `kwhin03@gmail.com` through the Today page.

The Connect page deliberately says Strava, Garmin, and Samsung Health are **Coming soon**. They are not part of this beta promise.

## Important folders and files

| File | What it does | When to touch it |
| --- | --- | --- |
| `index.html` | Nearly all of the visual interface and browser-side behavior. | Page layout, colors, buttons, forms, mobile design, onboarding. |
| `server.js` | The web server and API routes. It receives requests, checks sign-in, and talks to Neon. | New API features, security, user actions. |
| `db.js` | Database queries and table setup. | New data to store or retrieve. |
| `plan-engine.js` | The predictable workout-plan rules. | How plans progress or adjust. |
| `coach.js` | Beta Coach wording, optional live AI, and sentence-to-action interpretation. | Coach capability and commands. |
| `coach-safety.js` | The boundary that prevents Coach from acting as medical advice. | Safety policy changes only. |
| `.env` | Your local private settings. **Never upload or share this file.** | Local secrets only. |
| `.env.example` | A safe example of the variable names. | Reference only; safe to commit. |
| `DEPLOY_TO_RAILWAY.md` | The beginner deployment checklist. | When deploying or troubleshooting hosting. |

## Railway: what it is for

Railway is the hosting computer for Tempo. Your laptop only runs Tempo while `node server.js` is open. Railway runs the same server continuously so testers can use it from their own phones.

Your current public address is:

`https://stomper-production.up.railway.app`

### What Railway does automatically

1. Notices a new push to the GitHub repository.
2. Downloads the code and installs packages.
3. Runs `npm start`, which runs `node server.js`.
4. Provides an internet address and a private `PORT` number.
5. Shows build logs, deployment logs, resource metrics, and current variable settings.

### Railway variables

These go in the Railway service's **Variables** section, never in GitHub:

| Variable | Why it exists | Required now? |
| --- | --- | --- |
| `DATABASE_URL` | The private address/password Tempo uses to connect to Neon. | Yes. |
| `NODE_ENV=production` | Tells Tempo it is running publicly; it enables production cookie behavior. | Yes. |
| `FEEDBACK_RECIPIENT_EMAIL` | Where tester feedback is sent. | Yes. |
| `OPENAI_API_KEY` | Lets Smart AI Coach call the OpenAI API. It costs money. | No; leave off for beta. |
| `OPENAI_MODEL` | The model name used if live AI is later enabled. | No. |
| `STRAVA_*` values | Future Strava connection credentials. | No; integrations are disabled in beta. |

If Railway crashes with `DATABASE_URL is missing`, the variable was not added to the **Railway service**, or was added with a typo. Do not put a local `.env` file into GitHub to solve this.

### Where to look in Railway

- **Deployment / Logs:** First place to look when the site is broken, fails to deploy, or a tester reports an error. Red errors matter; routine startup lines and the Neon SSL warning do not necessarily mean a failure.
- **Metrics:** Click the Tempo service, then **Metrics**. Railway shows CPU, memory, disk, and inbound/outbound network traffic. It keeps up to 30 days of service metric history. This is useful for “is the server healthy?” and “are people using data?” but it is **not a visitor counter**. [Railway metrics documentation](https://docs.railway.com/observability/metrics)
- **Observability / Logs:** Search logs across the environment. Railway captures what the app prints to standard output/error. [Railway logs documentation](https://docs.railway.com/observability/logs)
- **Usage:** Check this at least weekly during beta so costs do not surprise you.
- **Variables:** Confirm names only. Do not copy secrets into screenshots, social posts, or chat.
- **Settings / Networking:** Your generated `*.up.railway.app` address lives here. You do not need to buy a custom domain for the beta.

### Health check

Tempo has a health address at `/health`. Opening this public address should show a small healthy response:

`https://stomper-production.up.railway.app/health`

If the health check is configured in Railway, it lets Railway confirm a fresh deployment can start and reach Neon before it receives visitors. It is useful but not required to let the site run.

## Neon: what it is for

Neon is Tempo's hosted PostgreSQL database. It is the permanent memory of the app. Without Neon, accounts, workouts, feedback, and Coach history would vanish when the server restarts.

Tempo stores:

- Accounts and securely hashed passwords.
- Sign-in sessions.
- Profiles and training preferences.
- Workouts, lifting sets, running details, and activity edits.
- Plan overrides and daily Tempo Checks.
- Beta Coach conversations.
- Friend connections and tester feedback.
- A short technical `app_errors` record when the server catches an unexpected error. It is designed not to store the full workout or Coach message.

### Where to look in Neon

- **Project dashboard / Monitoring:** Check database CPU, RAM, connections, and storage when the app feels slow or stops saving.
- **Tables:** Useful for carefully reviewing beta feedback and app errors. Do not casually edit or delete user rows while people are testing.
- **Usage / Billing:** Review monthly. Database compute, storage, and history/restore settings affect usage.
- **Settings -> Restore window / Backup & Restore:** This is your recovery safety net. Neon keeps change history for a configured time; longer restore history can increase storage use. Neon also offers backup/restore features that depend on plan and settings. [Neon project management and restore documentation](https://neon.com/docs/manage/projects) and [Neon pricing/usage documentation](https://neon.com/pricing)

### Neon safety rules

1. Treat `DATABASE_URL` like a password. Do not paste it into GitHub, Reddit, or screenshots.
2. Turn on two-factor authentication for your Neon account when available.
3. Before a risky database change, create a backup/snapshot if your plan supports it, or create a clearly named branch such as `before-beta-change`.
4. If data looks wrong, pause before editing anything. Take a screenshot, check Railway logs, then decide whether to restore.
5. Do not delete the production Neon project to “clean it up.” That permanently removes people's beta data.

## GitHub: what it is for

GitHub is the source-of-truth copy of the code and its history. Railway deploys from GitHub, so the public site changes after you push.

Normal update routine:

```powershell
cd "C:\Users\Kevin\Documents\Codex\2026-07-14\create-a-scheduled-task-called-weekday"
git status
git add index.html
git commit -m "Describe the change"
git push
```

Use the exact files that changed in `git add`; do not automatically use `git add .` if you are unsure what it includes. Railway will normally deploy the push on its own. Open the Railway deployment, wait for success, then test the public website in an incognito/private browser.

If an update is bad, do not panic. GitHub history lets us identify and safely reverse a specific change. Ask before using commands like `git reset --hard`, because that can erase work on your computer.

## Your local computer vs. the public website

| Place | What it is for | Important note |
| --- | --- | --- |
| `http://localhost:3000` | Your own test copy. | Only works while your local server is running. |
| Railway address | The public beta copy. | Uses Railway variables and Neon. |
| `.env` on your computer | Local secrets/settings. | Not automatically used by Railway. |
| Railway Variables | Public server secrets/settings. | Do not commit them to GitHub. |

To run locally:

```powershell
cd "C:\Users\Kevin\Documents\Codex\2026-07-14\create-a-scheduled-task-called-weekday"
node server.js
```

Then open `http://localhost:3000`. Stop it with `Ctrl + C` in that PowerShell window.

## How to watch traffic and beta use

### What you can see today without adding another tool

1. **Railway Metrics -> Network:** A rise in inbound/outbound traffic tells you the public service is being used.
2. **Railway Logs / HTTP logs:** Look for requests and errors, especially around the time a tester reports a problem.
3. **Neon data:** You can see whether accounts, workouts, feedback, and Coach conversations are being saved.
4. **Feedback box:** This is the most useful source early on. Ask testers what they tried, where they got confused, and what they expected to happen.

### What Tempo does *not* have yet

Tempo does not currently have a privacy-aware product analytics dashboard. Railway can show network bytes, CPU, and memory, but it cannot reliably tell you “12 unique people visited today” or “6 people completed onboarding.”

When the beta is stable, add a lightweight privacy-conscious analytics tool (for example, Plausible or Umami) and track only useful events:

- Landing page viewed.
- Account created.
- Profile saved.
- Plan viewed.
- First activity logged.
- Coach message sent.
- Tester feedback sent.

Do **not** send names, email addresses, full workout notes, Coach messages, or database URLs to analytics. Before adding analytics, update the Privacy page to explain it.

### Weekly beta scorecard

Every week, write down:

| Question | Where to find it |
| --- | --- |
| Did the public service stay online? | Railway deployments and logs. |
| Did errors appear? | Railway logs and Neon `app_errors`. |
| Are people finishing setup? | Tester check-ins now; analytics later. |
| Are people logging a second workout? | Neon workout rows and direct feedback. |
| Where are people confused? | Feedback messages and short conversations with testers. |
| Is usage/cost rising unexpectedly? | Railway Usage and Neon Usage/Billing. |

For the current two testers, ask them these five questions after a few days:

1. What did you expect Tempo to do in your first minute?
2. Where did you hesitate or get lost?
3. Did your plan feel like it understood your real schedule?
4. What did you ask Coach that it could not do?
5. What would make you open Tempo tomorrow?

## Basic operating routine

### Each time code changes

1. Test locally.
2. Run `npm test` in PowerShell.
3. Push only the intended files to GitHub.
4. Wait for Railway deployment success.
5. Test the public link on a phone and in a private/incognito browser.
6. If something breaks, check Railway logs first; do not change database data blindly.

### Once a week during beta

1. Review tester feedback.
2. Review Railway logs for repeated errors.
3. Check Railway Usage and Neon Usage/Billing.
4. Check Neon restore/backup status before major changes.
5. Make a short list: top 3 confusing things, top 3 requested features, top 3 bugs.
6. Fix the highest-impact issue first; do not try to add everything at once.

### Before sharing the link more widely

- Confirm account creation, login, profile save, plan, activity logging/editing, Coach, feedback, and account deletion all work on a phone.
- Confirm `/health` works.
- Verify Railway Variables are set and secrets are not in GitHub.
- Create a Neon recovery point.
- Read the Privacy page as if you are a new tester.
- Be honest in the invitation: private beta, general fitness guidance only, Smart AI and integrations are coming later.

## Beta Coach: what it does now

The current Coach has two layers:

1. **Beta Coach / plan-based fallback:** Free and predictable. It uses fixed rules and only understands specific kinds of wording.
2. **Smart AI Coach:** Optional live OpenAI connection. It is intentionally off for this beta because it needs an API key, AI consent, and paid usage.

The current Beta Coach can generally understand clear messages such as:

- `I can train Monday, Wednesday, and Friday.`
- `Set my goal to running.`
- `Make my sessions 30 minutes.`
- `I only have 20 minutes today and low energy.`
- `Make today a recovery workout.`
- `I need to skip today.`
- `Today I need an indoor run.`
- `Today I want to lift with no gym.`
- `Log a 3 mile run for 28 minutes.`
- `Log bench press 3x8 at 135 lb.`
- `Mark today's workout complete.`

It can also give rule-based explanations about running, strength, effort, recovery, plans, motivation, and progress. But it cannot yet understand every natural sentence or make arbitrary changes. That is why the testers feel it “doesn't do enough.” Their feedback is accurate.

## How to make Coach feel much better without Smart AI

Smart AI is **not required** for the most important upgrade: making clear, everyday language cause reliable plan changes. We can improve that safely with a broader command system first.

The right design is:

1. Read the user's sentence.
2. Identify a supported intent such as “move workout,” “change today to running,” “I only have 30 minutes,” or “log yesterday's lift.”
3. Show a plain-English confirmation of exactly what Tempo understood.
4. Apply only that specific change to Neon and the plan engine.
5. Show the updated plan immediately.

For example:

> User: “I have a busy week, only 30 minutes Monday and Wednesday, and I can run outside on Saturday.”

> Tempo: “I understood: 30-minute sessions on Monday and Wednesday, with an outdoor run Saturday. Want me to update this week?”

After the person confirms, Tempo changes the stored plan. This is safer than an AI silently guessing and changing records.

### Best next Coach improvements

Build these in this order:

1. **Better action language:** Add natural synonyms and multi-part commands for schedule, time, equipment, location, skip/move/swap, and logging a past activity.
2. **Confirmation before changes:** Let Coach say what it plans to change and provide an Apply button. This builds trust and prevents accidental plan edits.
3. **More supported actions:** Move a workout to a particular day, change next week's days, reduce/increase this week's workload, change a workout's length, add a rest day, and log multiple lifts/runs in one message.
4. **Coach starter prompts:** Display useful clickable examples on the Coach page based on the person's plan.
5. **Coach memory summary:** Save a short, factual summary from Tempo's own data—goal, recent mileage, recent lifts, normal schedule, and current plan—not a free-form AI memory that can make things up.

These steps make Coach useful, testable, and inexpensive. They also improve the app even after live AI is added.

## When Smart AI is worth adding

Smart AI becomes valuable for open-ended conversation, nuanced questions, and many different ways of expressing the same request. Examples:

- “Work was brutal and I slept badly. What is the smallest meaningful thing I can do tonight?”
- “I want to be ready for a 10K in October but I can only run twice most weeks.”
- “I feel stuck on my bench press; what should I focus on in my next few sessions?”

It should **not** directly edit data just because it thinks it understood. The reliable system above should still be the only way changes are applied. Smart AI can turn flexible language into a proposed structured action, but Tempo should display the change for approval before it saves it.

In other words: use deterministic Tempo rules for factual data and actions; use Smart AI for conversation, interpretation, explanation, and suggestions. That prevents the “it forgot or made up data” problem that people reported with generic chat tools.

## Recommended next feature

Build the **Coach Action Upgrade** before paying for Smart AI. It directly addresses the two testers' biggest complaints:

- Coach will be easier to set up because the quick-start checklist directs them to profile first.
- Coach will understand more normal phrases and visibly confirm what it will change.
- The plan will update from explicit, saved actions instead of vague chat replies.

After that is working with testers, decide whether live Smart AI is worth the cost. By then, we will know the exact questions it needs to answer rather than paying for AI before the product behavior is clear.

## Troubleshooting guide

| Problem | First check | Usual fix |
| --- | --- | --- |
| Railway says crashed | Railway deployment logs. | Confirm `DATABASE_URL` exists in Railway Variables, then redeploy. |
| Public site shows old design | GitHub push and Railway deployment status. | Wait for deployment success, then refresh or open a private browser tab. |
| Local site works but public site fails | Railway Variables and logs. | Local `.env` does not transfer to Railway; add the variable in Railway. |
| Login/data does not persist | Railway logs, then Neon connection/usage. | Check Neon is reachable and `DATABASE_URL` is correct. |
| A tester says Coach did nothing | Ask for the exact sentence. | Add or improve a supported intent; do not guess what it did. |
| A tester reports a plan bug | Ask for screenshot, exact date, profile choices, and steps. | Reproduce locally before changing production. |
| You accidentally make a risky data change | Stop changing things. | Use Neon Backup & Restore / restore window according to your recovery plan. |

## Things not to do

- Do not put `.env`, `DATABASE_URL`, or API keys in GitHub.
- Do not promise Strava, Garmin, Samsung, or Smart AI in the beta until they work.
- Do not use Coach as a replacement for medical advice, injury assessment, symptoms, diagnosis, or treatment.
- Do not edit production database rows casually while testers are active.
- Do not buy a custom domain yet unless the beta is proving useful.
- Do not turn on paid AI until you understand its budget, have a spending cap, and are ready to test it.

## Simple glossary

- **Deployment:** Publishing a new version of the code to Railway.
- **Database:** The permanent organized storage in Neon.
- **Environment variable:** A private setting, such as a database password, stored in Railway instead of code.
- **API:** The behind-the-scenes path the web page uses to ask the server to save or retrieve data.
- **Backend:** The server code (`server.js`, `db.js`, plan and Coach rules) that runs on Railway.
- **Frontend:** What people see and tap in the browser (`index.html`).
- **Health check:** A small address Railway uses to confirm the app is alive.
- **Logs:** A record of startup events and errors, useful for debugging.
- **Metrics:** Measurements such as CPU, memory, and network traffic.
- **Restore window:** The period Neon keeps history that can help recover older data.
- **Private beta:** A limited test with real people while features and reliability are still improving.

