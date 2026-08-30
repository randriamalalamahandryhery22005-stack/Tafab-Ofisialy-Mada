/* =========================================================
   TAFAß V11 — REACTIONS UPDATE
   Adds 🥰 and 🙄 to the real Supabase reaction system.
   No demo/local data is inserted.
   ========================================================= */

-- Remove any existing reaction-type CHECK constraint safely.
do $$
declare
    c record;
begin
    for c in
        select conname
        from pg_constraint
        where conrelid = 'public.post_reactions'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%reaction_type%'
    loop
        execute format(
            'alter table public.post_reactions drop constraint if exists %I',
            c.conname
        );
    end loop;
end $$;

alter table public.post_reactions
add constraint post_reactions_reaction_type_check
check (
    reaction_type in (
        'like',
        'love',
        'haha',
        'wow',
        'sad',
        'angry',
        'care',
        'eye_roll'
    )
);

-- Recreate the RPC because the accepted reaction types are part of its logic.
drop function if exists public.tafa_set_post_reaction(uuid, text);

create function public.tafa_set_post_reaction(
    p_post_id uuid,
    p_reaction_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    current_reaction text;
    total_reactions integer;
    new_reaction text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if not exists (
        select 1 from public.posts where id = p_post_id
    ) then
        raise exception 'Post not found';
    end if;

    if p_reaction_type not in (
        'like','love','haha','wow','sad','angry','care','eye_roll'
    ) then
        raise exception 'Invalid reaction type';
    end if;

    select reaction_type
    into current_reaction
    from public.post_reactions
    where post_id = p_post_id
      and user_id = auth.uid();

    if current_reaction = p_reaction_type then
        delete from public.post_reactions
        where post_id = p_post_id
          and user_id = auth.uid();
        new_reaction := null;
    elsif current_reaction is not null then
        update public.post_reactions
        set reaction_type = p_reaction_type,
            created_at = now()
        where post_id = p_post_id
          and user_id = auth.uid();
        new_reaction := p_reaction_type;
    else
        insert into public.post_reactions (
            post_id, user_id, reaction_type
        ) values (
            p_post_id, auth.uid(), p_reaction_type
        );
        new_reaction := p_reaction_type;
    end if;

    select count(*)
    into total_reactions
    from public.post_reactions
    where post_id = p_post_id;

    update public.posts
    set reactions_count = total_reactions,
        updated_at = now()
    where id = p_post_id;

    return jsonb_build_object(
        'post_id', p_post_id,
        'my_reaction', new_reaction,
        'reactions_count', total_reactions
    );
end;
$$;

grant execute
on function public.tafa_set_post_reaction(uuid, text)
to authenticated;

alter table public.post_reactions replica identity full;

do $$
begin
    begin
        alter publication supabase_realtime
        add table public.post_reactions;
    exception
        when duplicate_object then null;
    end;
end $$;

select 'TAFAß V11 REACTIONS READY' as status;
