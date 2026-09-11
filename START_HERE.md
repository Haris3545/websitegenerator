# Start here

Hello — this is a message from Haris. If you're reading this, I'm no longer
with you (as in, I'm probably at university or something). How's Will and
Jack and G? Anything fun happening? Sorry, that's besides the point — in
order to get this up and running, there are a few steps for you to
undertake — mainly just grabbing some API keys, and creating something
called a "Supabase" account. I'll walk you through the steps now.

---

**If you're reading this with Claude (or another AI assistant) open**: you
can hand it this whole file and say "help me follow this." It can do
almost everything below *except* the actual account sign-ups — creating a
Supabase account, a Google account for API keys, etc. all have to be you,
clicking through in a browser, because it needs a real human to accept
terms of service and verify an email. Everything else — installing things,
editing files, running commands, deploying — it can do for you if you ask.

## What this actually is

A tool for building cultural-intelligence dashboards for artists — one
internal "builder" page where you set each artist up, and a generated site
per artist with live data (news, social listening, music stats, tour
dates, etc.). It runs on a database called Supabase and an AI model called
Gemini, both of which need a free account before anything works.

## Step 1 — Create a Supabase account

Supabase is the database — it stores every artist, every upload, every
piece of content. Nothing works without it.

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Click **New Project**. Give it any name, set a database password
   (save it somewhere), pick any region.
3. Wait a minute or two for it to finish setting up.

## Step 2 — Set up the database structure

The `migrations` folder in this project has a numbered list of files —
each one tells Supabase what tables/columns to create.

1. In your new Supabase project, click **SQL Editor** in the left sidebar.
2. Open `migrations/001_init.sql` from this project, copy its entire
   contents, paste into the SQL Editor, and click **Run**.
3. Repeat for every other file in the `migrations` folder, **in numerical
   order** (002, 003, 004, and so on, all the way through the highest
   number). Tedious, but it's paste-and-click each time.

## Step 3 — Create a storage bucket

This is just where uploaded images/videos get saved.

1. In Supabase, click **Storage** in the sidebar → **New bucket**.
2. Name it exactly `artist-media`, and make it **Public**.

## Step 4 — Get your Supabase keys

1. In Supabase, click **Project Settings** (gear icon) → **API**.
2. You'll see three values you need in a moment: **Project URL**,
   **anon public** key, and **service_role** key (click "Reveal" for that
   last one).

## Step 5 — Get a Gemini API key

Gemini is the AI model that powers a lot of the smart features (writing
insights, analyzing sentiment, etc.). This is free, no card required.

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   and sign in with any Google account.
2. Click **Create API key**. Copy it.

## Step 6 — Put those keys into the project

1. In this project's folder, find the file called `.env.example`. Make a
   copy of it and rename the copy to `.env.local`.
2. Open `.env.local` in any text editor and fill in the values you copied
   in Steps 4 and 5:
   ```
   NEXT_PUBLIC_SUPABASE_URL=<your Project URL>
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon public key>
   SUPABASE_SERVICE_ROLE_KEY=<your service_role key>
   GEMINI_API_KEY=<your Gemini key>
   ```
3. Leave everything else in that file blank for now — it's all optional
   extras (see the notes in that file for what each one adds).

## Step 7 — Create your own login

1. Back in Supabase: **Authentication** → **Users** → **Add user**. Use
   your own email, set a password, and tick **Auto Confirm User**.
2. Copy the **User UID** it shows you.
3. Go to **SQL Editor** again and run this, with your real UID pasted in:
   ```sql
   insert into builder_admins (user_id) values ('paste-your-uid-here');
   ```

## Step 8 — Run it

You'll need [Node.js](https://nodejs.org) installed (the LTS version) if
you don't have it already. Then, in this project's folder, open a
terminal and run:

```
npm install
npm run dev
```

Open [localhost:3000/builder](http://localhost:3000/builder) and log in
with the email/password from Step 7. If you can see the artist list,
everything above worked.

## Step 9 — Put it on the internet (optional, for a real live site)

Running it on your own computer (Step 8) only works while your computer's
on. To get a real web address anyone can visit:

1. Go to [vercel.com](https://vercel.com) and sign up (free — you can use
   the same email/GitHub account).
2. Install the Vercel command-line tool and deploy in one go:
   ```
   npx vercel
   ```
   Follow its prompts (it'll ask to log in, then a few simple questions —
   the defaults are fine for all of them).
3. When it asks about environment variables, or once it's deployed, add
   the same values from your `.env.local` (Step 6) in the Vercel
   dashboard: your project → **Settings** → **Environment Variables**.
4. Redeploy (`npx vercel --prod`) after adding them.

## That's it

Everything above gets the core tool working. There are a handful of
optional extra API keys (for YouTube stats, tour dates, news, etc.) — none
of them are required, the app just skips that one feature without them.
See `.env.example` for the full list and where to get each one, and add
them whenever you actually want that feature.

If anything above doesn't make sense, or breaks, describe what happened to
Claude (or whichever AI assistant you're using) along with this file —
it'll be able to help troubleshoot from there.

— Haris
