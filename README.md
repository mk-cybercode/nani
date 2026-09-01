# Nanie's Delicacies — recon tracker

A small phone-first web app for tracking sales, purchases, stock orders and the
cash and bank balances of Nanie's Delicacies. Everything is in Rands.

Both partners open the same web address, type the shared passcode once, and see
the same live figures. Any device works — an entry captured on one phone shows
up on the other's within a second or two, and the app refreshes itself whenever
it is brought back to the foreground.

Three files, no build step, no framework: `index.html`, `app.js`, `styles.css`.

## Getting it running

1. **Database** — follow `SETUP.md`. It takes about ten minutes: make a free
   Supabase project, run `schema.sql`, copy two keys.
2. **Config** — open `app.js` and fill in the block at the very top:
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `PASSCODE`.
3. **Publish** — see below.

## Putting it online for free

The repository already holds the whole app, so GitHub Pages can serve it as-is.

1. On GitHub go to this repository → **Settings** → **Pages**.
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)**. Click **Save**.
4. Wait a minute, then reload the page. It shows your address:

       https://mk-cybercode.github.io/nani/

5. Open that address on both phones and enter the passcode.

Every time you push a change to `main`, the live site updates within a minute.

### Add it to a phone home screen

- **iPhone (Safari):** open the link → Share button → **Add to Home Screen**.
- **Android (Chrome):** open the link → ⋮ menu → **Add to Home screen**.

It then opens full screen with its own icon, like an app.

## Using it

- **Home** shows cash on hand, money in the bank, what customers owe you, what
  you owe suppliers, and the profit for the current month, then the latest few
  entries. Tap any entry to open it.
- **Products & prices** (button on Home) is where each product gets what one
  unit costs you to make and what you normally sell one for. Set these first —
  the profit on every sale is worked out from them.
- **Money** is the partners' tab. It shows what the business owes each of you
  and where that came from, and it is where you capture money one of you puts
  in from her own pocket, or money the business pays back. The same two figures
  appear on Home.
- **Stock** holds two lists behind a switch at the top: **On shelves** (stock
  left at a shop that only gets paid for once it sells) and **Orders** (what a
  customer ordered and what has been delivered).
- **Sales** asks who you sold to, which product, how many units and the price
  for one. The price fills in from the product automatically and can be changed
  for that sale. The total and the profit appear as you type, before you save.
  Then: have they paid (Paid / Part paid / Not paid) and how (Cash or EFT).
- **Purchases** and **Stock** work the same way — a list newest first with a
  **+** button. Tap any row to edit or delete it. Each list filters by This
  month, Last month or All.
- **Adjust cash or bank** (on Home) is how you force a balance to match
  reality — money banked, money drawn, an opening float or a correction. It
  shows you what the balance will be before you save.
- **New customers and products** are added from inside the sales and stock
  forms, with the **＋ New** button next to the dropdown.

### Who is owed what

    Owed to a partner = purchases she paid for out of her own pocket
                      + money she put in
                      − money the business has paid back to her

When you capture a purchase, **Who paid for this?** decides where the money
came from: the business, one partner, or both (Split, where you type what the
first partner put in and the rest falls to the other). A purchase a partner
paid for does **not** come off the business's cash or bank — it becomes money
owed to her instead, and only leaves the balance when she is paid back.

Stock out on consignment records whose money is tied up in that batch, and the
Money tab shows it as a separate line. It is deliberately **not** added to what
she is owed: the ingredients were already captured as a purchase, and counting
both would make the debt look twice as big as it is.

### How the profit is worked out

    Profit on a sale = (price for one − what one cost you) × units sold

The cost is copied onto the sale when you capture it, so changing a product's
cost price later never rewrites sales you already saved. If a product has no
cost price, the sale still saves but the form says the profit cannot be worked
out until you set one.

Purchases are kept separate from this. Cost price answers "what does one jar
cost me to make"; purchases record the actual money going out of the account.

### How the balances are worked out

    Cash on hand = cash received on sales
                 − cash paid on purchases
                 + cash adjustments (float, drawn, corrections)
                 − cash banked

    In the bank  = EFT received on sales
                 − EFT paid on purchases
                 + cash banked
                 + bank adjustments − money drawn

Unpaid sales and unpaid purchases do not move these balances. They appear as
**Owed to us** and **We still owe** instead.

## Export for the bookkeeper

Under **Export for the bookkeeper** on Home (also in the ⋯ menu), pick a period
and a format:

- **Spreadsheet (Excel / CSV)** — one file per list: sales, purchases, stock
  orders and cash adjustments. They open straight in Excel, Numbers or Google
  Sheets.
- **Statement (PDF)** — opens the phone's print screen. Choose **Save as PDF**
  (iPhone: pinch out on the preview, then Share → Save to Files). It prints the
  balances, then every entry for the period as a plain table.

## Things worth knowing

- The passcode keeps a forwarded link from being opened by a stranger. It is not
  real security: anyone with the web address can read the page source and reach
  the database. Keep the link between the two of you. If you ever want proper
  logins, they can be added without losing any data.
- Offline, the app says so at the top of the screen and refuses to save rather
  than pretending. Get back onto data and save again.
- Deleting anything asks first, and cannot be undone.

## Files

    index.html    the page
    app.js        all the behaviour; config block at the top
    styles.css    all the styling, including the printed statement
    schema.sql    run once in the Supabase SQL editor
    SETUP.md      click-by-click Supabase setup
