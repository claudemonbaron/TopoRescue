-- TopoRescue: utenti e registro accessi (16 novembre 2026)
-- Da incollare in Supabase > SQL Editor > New query > Run. Si puo' rilanciare: non rompe niente.

-- 1. Profilo di ogni utente (uno per account di Supabase Auth)
create table if not exists public.profili (
  id               uuid primary key references auth.users on delete cascade,
  nome             text not null default '',
  cognome          text not null default '',
  email            text not null default '',
  ente_tipo        text not null default 'Privato',   -- tendina: volontariato PC, CNSAS, VVF, CRI, forze dell'ordine/enti pubblici, Altro, Privato
  ente_nome        text not null default '',          -- nome del gruppo o della sezione
  autorizzato      boolean not null default false,    -- copia locale delle mappe: lo mette SOLO l'amministratore
  bloccato         boolean not null default false,    -- utente sospeso: lo mette SOLO l'amministratore
  note             text not null default '',          -- appunti dell'amministratore
  consenso_privacy timestamptz,
  creato           timestamptz not null default now(),
  ultimo_accesso   timestamptz
);
alter table public.profili enable row level security;

-- ognuno vede solo il proprio profilo
drop policy if exists "vedo il mio profilo" on public.profili;
create policy "vedo il mio profilo" on public.profili for select to authenticated using (auth.uid() = id);

-- ognuno modifica solo il proprio profilo, e solo i campi "suoi" (non autorizzato, bloccato, note)
drop policy if exists "modifico il mio profilo" on public.profili;
create policy "modifico il mio profilo" on public.profili for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);
revoke insert, update, delete on public.profili from anon, authenticated;
grant select on public.profili to authenticated;
grant update (nome, cognome, ente_tipo, ente_nome, ultimo_accesso) on public.profili to authenticated;

-- 2. Il profilo nasce da solo alla registrazione, con i dati del modulo (nome, cognome, ente, consenso)
create or replace function public.nuovo_utente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profili (id, nome, cognome, email, ente_tipo, ente_nome, consenso_privacy)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'nome', ''),
          coalesce(new.raw_user_meta_data->>'cognome', ''),
          coalesce(new.email, ''),
          coalesce(nullif(new.raw_user_meta_data->>'ente_tipo', ''), 'Privato'),
          coalesce(new.raw_user_meta_data->>'ente_nome', ''),
          case when new.raw_user_meta_data->>'consenso' = 'si' then now() end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists al_nuovo_utente on auth.users;
create trigger al_nuovo_utente after insert on auth.users for each row execute function public.nuovo_utente();

-- 3. Registro degli accessi (chi usa cosa, da dove): gli utenti scrivono, solo l'amministratore legge
create table if not exists public.accessi (
  id        bigserial primary key,
  utente    uuid not null default auth.uid() references auth.users on delete cascade,
  quando    timestamptz not null default now(),
  app       text not null default '',   -- ingresso, carica_web, estrazione_web, estrarre_mappe, carica_mappe
  versione  text not null default '',
  sistema   text not null default ''    -- Mac, Windows, browser
);
alter table public.accessi enable row level security;
drop policy if exists "scrivo i miei accessi" on public.accessi;
create policy "scrivo i miei accessi" on public.accessi for insert to authenticated with check (utente = auth.uid());
revoke all on public.accessi from anon, authenticated;
grant insert (app, versione, sistema) on public.accessi to authenticated;
grant usage on sequence public.accessi_id_seq to authenticated;

-- 4. Stato del login per le app e le pagine (una chiamata sola): autorizzato, bloccato; aggiorna ultimo_accesso
create or replace function public.mio_stato() returns table (autorizzato boolean, bloccato boolean, nome text)
language sql security definer set search_path = public as $$
  update public.profili set ultimo_accesso = now() where id = auth.uid()
  returning autorizzato, bloccato, nome;
$$;
revoke all on function public.mio_stato() from public, anon;
grant execute on function public.mio_stato() to authenticated;
