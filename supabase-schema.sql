-- Ti-Tuka — Esquema Supabase
-- Ejecutar en el SQL Editor de Supabase

-- Artesanos
create table artisans (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users,
  name text,
  craft text,
  city text,
  story text,
  avatar_url text,
  created_at timestamp default now()
);

-- Productos
create table products (
  id uuid default gen_random_uuid() primary key,
  artisan_id uuid references artisans(id),
  name text,
  description text,
  price numeric,
  category text,
  image_url text,
  created_at timestamp default now()
);

-- Storage: crear buckets públicos en el panel de Supabase
-- product-images  — fotos de productos
-- artisan-avatars — fotos de artesanos

-- Políticas RLS sugeridas (ajustar según necesidad):
-- alter table artisans enable row level security;
-- alter table products enable row level security;

-- create policy "Artesanos públicos" on artisans for select using (true);
-- create policy "Productos públicos" on products for select using (true);
-- create policy "Artesano inserta perfil" on artisans for insert with check (auth.uid() = user_id);
-- create policy "Artesano actualiza perfil" on artisans for update using (auth.uid() = user_id);
-- create policy "Artesano inserta productos" on products for insert with check (
--   artisan_id in (select id from artisans where user_id = auth.uid())
-- );
-- create policy "Artesano elimina productos" on products for delete using (
--   artisan_id in (select id from artisans where user_id = auth.uid())
-- );
