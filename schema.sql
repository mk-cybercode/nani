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
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create trigger trg_sales_updated        before update on sales        for each row execute function set_updated_at();
create trigger trg_purchases_updated    before update on purchases    for each row execute function set_updated_at();
create trigger trg_stock_orders_updated before update on stock_orders for each row execute function set_updated_at();
create trigger trg_adjustments_updated  before update on adjustments  for each row execute function set_updated_at();

-- ---------- Indexes (lists are always newest first) ----------

create index if not exists idx_sales_date        on sales (date desc, created_at desc);
create index if not exists idx_purchases_date    on purchases (date desc, created_at desc);
create index if not exists idx_stock_date        on stock_orders (date_ordered desc, created_at desc);
create index if not exists idx_adjustments_date  on adjustments (date desc, created_at desc);

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

do $$
declare t text;
begin
  foreach t in array array['customers','products','sales','purchases','stock_orders','adjustments']
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
  foreach t in array array['customers','products','sales','purchases','stock_orders','adjustments']
  loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
