# Setting up the database (do this once)

You need a free Supabase project. It holds the data so both phones see the same thing.

## 1. Make the project

1. Go to **https://supabase.com** and sign up (free plan, no card).
2. Click **New project**.
   - **Name:** `nanies-delicacies`
   - **Database password:** let it generate one, then save it somewhere. You will
     not need it for this app, but you cannot get it back later.
   - **Region:** pick the closest one — **South Africa (Johannesburg)** if it is
     offered, otherwise **West EU (London)** or **Frankfurt**.
3. Click **Create new project** and wait about two minutes while it starts.

## 2. Create the tables

1. In the left sidebar click **SQL Editor**.
2. Click **New query**.
3. Open `schema.sql` from this repo, copy the **whole file**, paste it into the box.
4. Click **Run** (bottom right, or Ctrl+Enter).
5. You should see **Success. No rows returned.** That is correct.
6. Click **Table Editor** in the sidebar — you should now see six tables:
   `customers`, `products`, `sales`, `purchases`, `stock_orders`, `adjustments`.
   `customers` already has Forsmay Butchery and Freezer Fillers in it, and
   `products` has Green Chutney and Sesame Crunch Oil.

The SQL is safe to run again if you are ever unsure whether it worked.

## 3. Copy your two keys into the app

1. Sidebar → **Project Settings** (the gear at the bottom) → **API**.
2. Copy **Project URL** — it looks like `https://abcdefgh.supabase.co`.
3. Under **Project API keys** copy the **`anon` `public`** key — a long string
   starting `eyJ...`.
   **Do not** copy the `service_role` key. That one is a master key and must
   never go into a web page.
4. Open `app.js` in this repo. The very top of the file is a block marked
   `CONFIG - PASTE YOUR OWN VALUES HERE`. Paste the URL and the anon key in,
   and set the shared passcode to whatever you and your partner will use.

## 4. Nothing else to click

The SQL already did the rest for you:

- **Row Level Security** is switched on for all six tables, with one open policy
  so the app's public key can read and write. Supabase will show the tables as
  "RLS enabled" with no warning triangle.
- **Realtime** is switched on for all six tables, so when one of you saves an
  entry it appears on the other's phone without a refresh.

You do **not** need to touch Authentication, Storage, Edge Functions or anything
else in the Supabase dashboard.

## What the passcode is and is not

The passcode screen stops the wrong person poking around if a link gets
forwarded. It is not real security. Anyone who has the web address can read the
page's source and get the public key. Keep the link between the two of you, and
do not put anything in the notes fields you would mind a stranger reading.

If you ever need to lock it down properly — real logins, one account each — say
so and it can be added later without losing any data.
