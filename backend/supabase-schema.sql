create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  short_desc text,
  description text,
  image_url text not null,
  price text default 'Contact for price',
  gallery text[] default '{}',
  video_url text,
  moq text,
  material text,
  packaging text,
  lead_time text,
  features text,
  product_video text,
  status text not null default 'published',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table products add column if not exists price text;
alter table products alter column price set default 'Contact for price';
update products set price = 'Contact for price' where price is null or price = '';
alter table products add column if not exists gallery text[] default '{}';
alter table products alter column gallery set default '{}';
alter table products add column if not exists video_url text;
alter table products add column if not exists product_video text;
update products set video_url = product_video where video_url is null and product_video is not null;
alter table products add column if not exists moq text;
alter table products add column if not exists material text;
alter table products add column if not exists packaging text;
alter table products add column if not exists lead_time text;
alter table products add column if not exists features text;

create index if not exists products_status_sort_idx
on products (status, sort_order, created_at desc);

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

alter table products enable row level security;

drop policy if exists "Public can read products" on products;
drop policy if exists "Public can read published products" on products;
create policy "Public can read products"
on products for select
using (true);

drop policy if exists "Public admin can manage products" on products;
drop policy if exists "Authenticated can manage products" on products;
create policy "Authenticated can manage products"
on products for all
to authenticated
using (true)
with check (true);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_sort_idx
on product_images (product_id, sort_order, created_at);

alter table product_images enable row level security;

drop policy if exists "Public can read product images table" on product_images;
create policy "Public can read product images table"
on product_images for select
using (true);

drop policy if exists "Public admin can manage product images table" on product_images;
drop policy if exists "Authenticated can manage product images table" on product_images;
create policy "Authenticated can manage product images table"
on product_images for all
to authenticated
using (true)
with check (true);

drop policy if exists "Public can upload product images" on storage.objects;
drop policy if exists "Public can read product images" on storage.objects;
drop policy if exists "Authenticated can upload product images" on storage.objects;
drop policy if exists "Authenticated can delete product images" on storage.objects;
create policy "Public can read product images"
on storage.objects for select
using (bucket_id = 'product-images');

create policy "Authenticated can upload product images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'product-images');

drop policy if exists "Public can delete product files" on storage.objects;
create policy "Authenticated can delete product images"
on storage.objects for delete
to authenticated
using (bucket_id = 'product-images');

create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  whatsapp text,
  product text,
  message text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table inquiries add column if not exists status text not null default 'new';
alter table inquiries alter column status set default 'new';
update inquiries set status = lower(status) where status is not null;

alter table inquiries enable row level security;

drop policy if exists "Public can manage inquiries" on inquiries;
drop policy if exists "Public can submit inquiries" on inquiries;
drop policy if exists "Public can insert inquiries" on inquiries;
create policy "Public can insert inquiries"
on inquiries for insert
with check (true);

drop policy if exists "Public admin can manage inquiries" on inquiries;
drop policy if exists "Authenticated can read inquiries" on inquiries;
drop policy if exists "Authenticated can update inquiries" on inquiries;
drop policy if exists "Authenticated can delete inquiries" on inquiries;

create policy "Authenticated can read inquiries"
on inquiries for select
to authenticated
using (true);

create policy "Authenticated can update inquiries"
on inquiries for update
to authenticated
using (true)
with check (true);

create policy "Authenticated can delete inquiries"
on inquiries for delete
to authenticated
using (true);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text,
  slug text,
  image_url text,
  description text,
  link text,
  sort_order integer not null default 0,
  status text not null default 'published',
  created_at timestamptz not null default now()
);

alter table categories add column if not exists name text;
alter table categories add column if not exists slug text;
alter table categories add column if not exists image_url text;
alter table categories add column if not exists description text;
alter table categories add column if not exists link text;
alter table categories add column if not exists sort_order integer not null default 0;
alter table categories add column if not exists status text not null default 'published';
alter table categories add column if not exists created_at timestamptz not null default now();

alter table categories alter column image_url drop not null;

update categories
set name = coalesce(nullif(name, ''), slug)
where name is null or name = '';

update categories
set slug = regexp_replace(lower(coalesce(nullif(slug, ''), name, id::text)), '[^a-z0-9]+', '-', 'g')
where slug is null or slug = '';

update categories
set link = 'product.html?category=' || slug
where link is null or link = '';

update categories
set status = 'hidden'
where status = 'draft';

update categories
set slug = 'hydrogel-film-cutting-machine',
    link = 'product.html?category=hydrogel-film-cutting-machine'
where name = 'Hydrogel Film Cutting Machine';

insert into categories (name, slug, link, sort_order, status)
select 'Phone Cases', 'phone-cases', 'product.html?category=phone-cases', 10, 'published'
where not exists (select 1 from categories where slug = 'phone-cases' or name = 'Phone Cases');

insert into categories (name, slug, link, sort_order, status)
select 'Chargers', 'chargers', 'product.html?category=chargers', 20, 'published'
where not exists (select 1 from categories where slug = 'chargers' or name = 'Chargers');

insert into categories (name, slug, link, sort_order, status)
select 'Screen Protectors', 'screen-protectors', 'product.html?category=screen-protectors', 30, 'published'
where not exists (select 1 from categories where slug = 'screen-protectors' or name = 'Screen Protectors');

insert into categories (name, slug, link, sort_order, status)
select 'Power Banks', 'power-banks', 'product.html?category=power-banks', 40, 'published'
where not exists (select 1 from categories where slug = 'power-banks' or name = 'Power Banks');

insert into categories (name, slug, link, sort_order, status)
select 'Earbuds', 'earbuds', 'product.html?category=earbuds', 50, 'published'
where not exists (select 1 from categories where slug = 'earbuds' or name = 'Earbuds');

insert into categories (name, slug, link, sort_order, status)
select 'Data Cables', 'data-cables', 'product.html?category=data-cables', 60, 'published'
where not exists (select 1 from categories where slug = 'data-cables' or name = 'Data Cables');

alter table categories enable row level security;

drop policy if exists "Public can read categories" on categories;
drop policy if exists "Public can read published categories" on categories;
create policy "Public can read categories"
on categories for select
using (true);

drop policy if exists "Public admin can manage categories" on categories;
drop policy if exists "Authenticated can manage categories" on categories;
create policy "Authenticated can manage categories"
on categories for all
to authenticated
using (true)
with check (true);

create table if not exists factory_media (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  video_url text not null,
  status text not null default 'published',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table factory_media enable row level security;

drop policy if exists "Public can read factory media" on factory_media;
drop policy if exists "Public can read published factory media" on factory_media;
create policy "Public can read factory media"
on factory_media for select
using (true);

drop policy if exists "Public admin can manage factory media" on factory_media;
drop policy if exists "Authenticated can manage factory media" on factory_media;
create policy "Authenticated can manage factory media"
on factory_media for all
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('factory-videos', 'factory-videos', true)
on conflict (id) do nothing;

drop policy if exists "Public can upload factory videos" on storage.objects;
drop policy if exists "Public can read factory videos" on storage.objects;
drop policy if exists "Authenticated can upload factory videos" on storage.objects;
drop policy if exists "Authenticated can delete factory videos" on storage.objects;
create policy "Public can read factory videos"
on storage.objects for select
using (bucket_id = 'factory-videos');

create policy "Authenticated can upload factory videos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'factory-videos');

create policy "Authenticated can delete factory videos"
on storage.objects for delete
to authenticated
using (bucket_id = 'factory-videos');

notify pgrst, 'reload schema';
