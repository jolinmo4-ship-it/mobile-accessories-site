# XiQi Product Backend

Minimal Express backend for Supabase product data and product image uploads.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in Supabase URL, anon key, products table, and storage bucket. Add a service role key if your Supabase RLS policies require it.
3. Run `npm install`.
4. Run `npm start`.

The server serves the existing website from the parent folder and exposes:

- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/admin/products`
- `POST /api/admin/products`
- `POST /api/admin/upload`

## Expected Supabase columns

- `id`
- `name`
- `category`
- `short_desc`
- `description`
- `image_url`
- `status`
- `sort_order`
- `created_at`

## Supabase setup

Run `supabase-schema.sql` in the Supabase SQL editor before using the product API.

For product image upload, the simplest setup is to add `SUPABASE_SERVICE_ROLE_KEY`
to `backend/.env`. Without it, your Supabase table and storage policies must allow
the anon key to insert products and upload files.
