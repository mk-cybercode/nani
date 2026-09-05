-- ============================================================
--  Nanie's Delicacies - recon tracker
--  Run this whole file once in the Supabase SQL editor.
--  Safe to re-run: it only creates things that are missing.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Lists you can add to from inside the app ----------

create table if not exists customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- Each product carries what one unit costs you to make and what you
-- normally sell one unit for. Both can be changed in the app at any time.
create table if not exists products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  cost_price numeric(12,2) not null default 0,   -- what one unit costs you
  sell_price numeric(12,2) not null default 0,   -- what you normally charge
  created_at timestamptz not null default now()
);

alter table products add column if not exists cost_price numeric(12,2) not null default 0;
alter table products add column if not exists sell_price numeric(12,2) not null default 0;

-- ---------- Sales / income ----------

-- A sale is a number of units at a price each.
--   amount = units * unit_price
--   profit = (unit_price - unit_cost) * units
-- unit_cost is copied from the product when the sale is captured, so
-- changing a product's cost price later does not rewrite old sales.
create table if not exists sales (
  id              uuid primary key default gen_random_uuid(),
  date            date not null default current_date,
  customer        text not null,
  product         text not null,
  units           numeric(12,2) not null default 1,   -- how many units were sold
  unit_price      numeric(12,2) not null default 0,   -- what you charged for one
  unit_cost       numeric(12,2) not null default 0,   -- what one cost you to make
  amount          numeric(12,2) not null default 0,   -- units * unit_price
  status          text not null default 'unpaid'      -- paid | part | unpaid
                  check (status in ('paid','part','unpaid')),
  amount_received numeric(12,2) not null default 0,   -- how much has actually come in
  method          text not null default 'cash'        -- cash | eft
                  check (method in ('cash','eft')),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- If you ran an earlier version of this file, this adds the new columns
-- and treats every existing sale as one unit at the price it was captured at.
alter table sales add column if not exists units      numeric(12,2) not null default 1;
alter table sales add column if not exists unit_price numeric(12,2) not null default 0;
alter table sales add column if not exists unit_cost  numeric(12,2) not null default 0;
update sales set unit_price = amount where unit_price = 0 and amount <> 0;

-- ---------- Purchases / expenses ----------

create table if not exists purchases (
  id         uuid primary key default gen_random_uuid(),
  date       date not null default current_date,
  item       text not null,
  supplier   text,
  amount     numeric(12,2) not null default 0,
  status     text not null default 'unpaid'          -- paid | unpaid
             check (status in ('paid','unpaid')),
  method     text not null default 'cash'            -- cash | eft
             check (method in ('cash','eft')),
  -- Who the money actually came from.
  --   business  the business's own cash or bank
  --   p1 / p2   one partner's own money (names live in app.js)
  --   split     both partners, share1 + share2
  paid_by    text not null default 'business'
             check (paid_by in ('business','p1','p2','split')),
  share1     numeric(12,2) not null default 0,       -- first partner's share
  share2     numeric(12,2) not null default 0,       -- second partner's share
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Added by a later version of this file.
alter table purchases add column if not exists paid_by text not null default 'business';
alter table purchases add column if not exists share1 numeric(12,2) not null default 0;
alter table purchases add column if not exists share2 numeric(12,2) not null default 0;
do $$ begin
  alter table purchases add constraint purchases_paid_by_check
    check (paid_by in ('business','p1','p2','split'));
exception when duplicate_object then null; end $$;

-- ---------- Stock orders ----------
-- Quantities are in units (jars, bottles). unit_price is the rand value of
-- one unit, so the rand value of an order is qty_ordered * unit_price.
-- outstanding = qty_ordered - qty_delivered, worked out by the database.

create table if not exists stock_orders (
  id             uuid primary key default gen_random_uuid(),
  product        text not null,
  customer       text not null,
  date_ordered   date not null default current_date,
  qty_ordered    numeric(12,2) not null default 0,      -- number of units
  unit_price     numeric(12,2) not null default 0,      -- rand value per unit
  date_delivered date,
  qty_delivered  numeric(12,2) not null default 0,
  complete       boolean not null default false,
  note           text,
  outstanding    numeric(12,2) generated always as (qty_ordered - qty_delivered) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- If you ran an earlier version of this file, this adds the new column.
alter table stock_orders add column if not exists unit_price numeric(12,2) not null default 0;

-- ---------- Manual cash / bank adjustments ----------
-- kind decides which balance moves and in which direction:
--   banked    cash -> bank      (you deposited takings)
--   drawn     bank -> cash      (you withdrew money)
--   cash_in   cash + (opening float, correction up)
--   cash_out  cash - (money taken out, correction down)
--   bank_in   bank + (correction up)
--   bank_out  bank - (correction down)

create table if not exists adjustments (
  id         uuid primary key default gen_random_uuid(),
  date       date not null default current_date,
  kind       text not null
             check (kind in ('banked','drawn','cash_in','cash_out','bank_in','bank_out')),
  amount     numeric(12,2) not null default 0,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Money the partners put in and take back ----------
-- Only money that comes out of a partner's own pocket, and money paid
-- back to her, belongs here. Purchases she paid for are counted from
-- the purchases table itself, so do not repeat them here.
--   in      she put her own money in
--   repaid  the business paid her back

create table if not exists partner_money (
  id         uuid primary key default gen_random_uuid(),
  date       date not null default current_date,
  partner    text not null check (partner in ('p1','p2')),
  kind       text not null check (kind in ('in','repaid')),
  amount     numeric(12,2) not null default 0,
  method     text not null default 'cash' check (method in ('cash','eft')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Stock sitting on someone else's shelf ----------
-- Units left at a shop that only get paid for once they sell.
--   on_shelf = units_out - units_sold - units_returned
-- paid_by / share1 / share2 record whose money is tied up in that batch.

create table if not exists consignment (
  id             uuid primary key default gen_random_uuid(),
  date_out       date not null default current_date,
  customer       text not null,                      -- the shop holding it
  product        text not null,
  units_out      numeric(12,2) not null default 0,
  unit_cost      numeric(12,2) not null default 0,   -- what one unit cost to make
  unit_price     numeric(12,2) not null default 0,   -- what it should sell for
  paid_by        text not null default 'business'
                 check (paid_by in ('business','p1','p2','split')),
  share1         numeric(12,2) not null default 0,
  share2         numeric(12,2) not null default 0,
  units_sold     numeric(12,2) not null default 0,
  units_returned numeric(12,2) not null default 0,
  settled        boolean not null default false,     -- shop has paid up
  settled_on     date,                               -- when they paid
  settle_method  text not null default 'cash'        -- how they paid
                 check (settle_method in ('cash','eft')),
  sale_id        uuid references sales(id) on delete set null,  -- the sale it created
  note           text,
  on_shelf       numeric(12,2)
                 generated always as (units_out - units_sold - units_returned) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Added by a later version of this file. Settling a consignment now
-- writes a real sale, and this remembers which one so the two stay
-- in step instead of being captured twice.
alter table consignment add column if not exists settled_on    date;
alter table consignment add column if not exists settle_method text not null default 'cash';
alter table consignment add column if not exists sale_id       uuid references sales(id) on delete set null;
do $$ begin
  alter table consignment add constraint consignment_settle_method_check
    check (settle_method in ('cash','eft'));
exception when duplicate_object then null; end $$;

-- ---------- Keep updated_at honest ----------

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sales_updated        on sales;
drop trigger if exists trg_purchases_updated    on purchases;
drop trigger if exists trg_stock_orders_updated on stock_orders;
drop trigger if exists trg_adjustments_updated  on adjustments;
drop trigger if exists trg_partner_money_updated on partner_money;
drop trigger if exists trg_consignment_updated  on consignment;

create trigger trg_sales_updated        before update on sales        for each row execute function set_updated_at();
create trigger trg_purchases_updated    before update on purchases    for each row execute function set_updated_at();
create trigger trg_stock_orders_updated before update on stock_orders for each row execute function set_updated_at();
create trigger trg_adjustments_updated  before update on adjustments  for each row execute function set_updated_at();
create trigger trg_partner_money_updated before update on partner_money for each row execute function set_updated_at();
create trigger trg_consignment_updated  before update on consignment  for each row execute function set_updated_at();

-- ---------- Indexes (lists are always newest first) ----------

create index if not exists idx_sales_date        on sales (date desc, created_at desc);
create index if not exists idx_purchases_date    on purchases (date desc, created_at desc);
create index if not exists idx_stock_date        on stock_orders (date_ordered desc, created_at desc);
create index if not exists idx_adjustments_date  on adjustments (date desc, created_at desc);
create index if not exists idx_partner_date      on partner_money (date desc, created_at desc);
create index if not exists idx_consignment_date  on consignment (date_out desc, created_at desc);

-- ---------- Starting lists ----------

insert into customers (name) values ('Forsmay Butchery'), ('Freezer Fillers')
  on conflict (name) do nothing;

-- Cost and selling prices start at zero — set them in the app under
-- "Products & prices" on the Home screen.
insert into products (name) values ('Green Chutney'), ('Sesame Crunch Oil')
  on conflict (name) do nothing;

-- ============================================================
--  Access
--  The app talks to Supabase with the public "anon" key, and
--  there are no user accounts, so the anon role needs to be
--  able to read and write these six tables.
--  Row Level Security stays ON (Supabase will nag otherwise)
--  with one open policy per table.
--  Be clear-eyed about what this means: anyone who has your
--  site URL AND your anon key can read and write this data.
--  The passcode screen in the app does not change that - it
--  only stops a stray link being opened by the wrong person.
-- ============================================================

alter table customers    enable row level security;
alter table products     enable row level security;
alter table sales        enable row level security;
alter table purchases    enable row level security;
alter table stock_orders enable row level security;
alter table adjustments  enable row level security;
alter table partner_money enable row level security;
alter table consignment  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['customers','products','sales','purchases','stock_orders',
                        'adjustments','partner_money','consignment']
  loop
    execute format('drop policy if exists "app access" on %I', t);
    execute format(
      'create policy "app access" on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Live updates on both phones ----------
-- Adds the tables to the realtime publication so one partner's
-- entry appears on the other's phone without a refresh.

do $$
declare t text;
begin
  foreach t in array array['customers','products','sales','purchases','stock_orders',
                        'adjustments','partner_money','consignment']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
