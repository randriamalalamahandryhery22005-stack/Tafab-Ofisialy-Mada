(() => {
  "use strict";

  const SUPABASE_URL = "https://qvxmaeepwrprtoaipoir.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OxmDXLn69jclSWnYtdjsxQ_TMfMI4X-";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: async (_n, _t, fn) => await fn() }
  });

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
  const routes = ["home","friends","search","messages","notifications","profile","videos","reels","pages","groups","saved","menu","tafab","settings"];
  const state = {
    user: null, profile: null, route: "home", posts: [], friends: [], stories: [],
    channel: null, theme: localStorage.getItem("tafa-theme") || "dark", entering: false,
    profileTab: "posts", selectedConversation: null
  };

  function avatarHTML(p, cls = "avatar") {
    const letter = (p?.first_name || p?.username || p?.email || "T").slice(0, 1).toUpperCase();
    return p?.avatar_url
      ? `<span class="${cls}"><img src="${esc(p.avatar_url)}" alt=""></span>`
      : `<span class="${cls}">${esc(letter)}</span>`;
  }
  function nameOf(p) { return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || p?.username || "Utilisateur"; }
  function timeAgo(date) {
    const t = new Date(date || Date.now()).getTime(), d = Math.max(0, Date.now() - t);
    const m = Math.floor(d / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} h`;
    return `${Math.floor(h / 24)} j`;
  }
  function toast(msg) {
    const el = $("toast"); if (!el) return;
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
  }
  function setLoading(button, loading, label) {
    if (!button) return;
    button.disabled = loading; if (loading) button.dataset.oldLabel = button.textContent;
    button.textContent = loading ? "Patientez…" : (button.dataset.oldLabel || label || button.textContent);
  }

  async function loadProfile() {
    if (!state.user) return;
    const { data } = await sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle();
    state.profile = data || {
      id: state.user.id, first_name: state.user.user_metadata?.first_name || "",
      last_name: state.user.user_metadata?.last_name || "", email: state.user.email || ""
    };
    const sideName = $("sideName"); if (sideName) sideName.textContent = nameOf(state.profile);
    const sideAvatar = $("sideAvatar"); if (sideAvatar) sideAvatar.outerHTML = avatarHTML(state.profile, "avatar");
  }

  async function loadPosts() {
    if (!state.user) return;
    const { data, error } = await sb.from("posts").select("*").order("created_at", { ascending: false }).limit(30);
    state.posts = error ? [] : (data || []);
    await hydratePosts();
    if (state.route === "home" || state.route === "profile") await render();
  }

  async function hydratePosts() {
    const ids = [...new Set(state.posts.map(p => p.user_id).filter(Boolean))];
    if (!ids.length) return;
    const { data } = await sb.from("profiles").select("*").in("id", ids);
    const map = new Map((data || []).map(p => [p.id, p]));
    state.posts = state.posts.map(p => ({ ...p, author: map.get(p.user_id) }));
  }

  async function reactionsFor(postId) {
    const { data } = await sb.from("post_reactions").select("reaction_type,user_id").eq("post_id", postId);
    return data || [];
  }
  async function commentsFor(postId) {
    const { data } = await sb.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending: true }).limit(50);
    return data || [];
  }

  function storyStrip() {
    const profiles = [state.profile, ...state.posts.map(p => p.author).filter(Boolean)].filter(Boolean);
    const unique = [...new Map(profiles.map(p => [p.id, p])).values()].slice(0, 8);
    return `<div class="card story-card"><div class="stories"><button class="story story-add" data-action="add-story"><div class="story-ring"><span class="avatar">+</span></div><small>Votre story</small></button>${unique.map((p,i)=>`<button class="story" data-action="story" data-id="${esc(p.id)}"><div class="story-ring">${avatarHTML(p)}</div><small>${esc(i===0?"Votre story":(p.first_name||nameOf(p)).slice(0,10))}</small></button>`).join("")}</div></div>`;
  }

  async function renderFeed() {
    let html = storyStrip();
    html += `<div class="card composer">
      <div class="composer-top">${avatarHTML(state.profile)}<b>${esc(nameOf(state.profile))}</b></div>
      <textarea id="postText" placeholder="Quoi de neuf, ${esc((state.profile?.first_name || "").trim() || "vous")} ?"></textarea>
      <div class="composer-actions"><label class="file-label">▧ Photo/Vidéo<input id="postFile" type="file" accept="image/*,video/*" hidden></label><button type="button" data-action="mood">◎ Humeur</button><button type="button" class="primary" id="publishBtn">Publier</button></div>
    </div>`;
    if (!state.posts.length) html += `<div class="card empty">Aucune publication pour le moment.<br><span>Publiez la première sur Tafaß.</span></div>`;
    for (const p of state.posts) html += await postHTML(p);
    $("content").innerHTML = html;
    $("publishBtn")?.addEventListener("click", publishPost);
  }

  async function postHTML(p) {
    const [rs, cs] = await Promise.all([reactionsFor(p.id), commentsFor(p.id)]);
    const counts = {}; rs.forEach(r => counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1);
    const mine = rs.find(r => r.user_id === state.user.id)?.reaction_type;
    const media = p.media_url
      ? (p.media_type === "video" || p.media_type === "reel"
        ? `<video class="post-media" src="${esc(p.media_url)}" controls preload="metadata"></video>`
        : `<img class="post-media" src="${esc(p.media_url)}" alt="Publication">`)
      : "";
    const comments = cs.map(c => `<div class="comment">${avatarHTML(c.user_id === state.user.id ? state.profile : null)}<div class="bubble"><b>${esc(c.user_id === state.user.id ? nameOf(state.profile) : "Utilisateur")}</b><br>${esc(c.text || c.content || "")}</div></div>`).join("");
    const reactions = Object.entries(counts).map(([k,v]) => `${esc(k)} ${v}`).join(" · ") || "Aucune réaction";
    return `<article class="post" id="post-${esc(p.id)}">
      <div class="post-head">${avatarHTML(p.author)}<div class="meta"><b>${esc(nameOf(p.author))}</b><small>${timeAgo(p.created_at)} · Public</small></div><button class="post-menu" data-action="post-menu" data-id="${esc(p.id)}">⋯</button></div>
      ${p.content ? `<div class="post-body">${esc(p.content)}</div>` : ""}${media}
      <div class="post-stats"><span>${reactions}</span><span>${cs.length} commentaire(s) · ${Number(p.shares || 0)} partage(s)</span></div>
      <div class="post-actions"><button class="react-btn" data-action="react" data-id="${esc(p.id)}">♡ ${esc(mine || "J’aime")}</button><button data-action="comment" data-id="${esc(p.id)}">▢ Commenter</button><button data-action="share" data-id="${esc(p.id)}">↗ Partager</button></div>
      <div id="reaction-${esc(p.id)}"></div>
      <div class="comments">${comments}<div class="comment-form"><input id="comment-${esc(p.id)}" placeholder="Écrire un commentaire..."><button data-action="send-comment" data-id="${esc(p.id)}">Envoyer</button></div></div>
    </article>`;
  }

  async function showReactions(id) {
    const box = $("reaction-" + id); if (!box) return;
    box.innerHTML = `<div class="reaction-picker">${["J’aime","J’adore","Solidaire","Haha","Waouh","Triste","En colère"].map(x => `<button data-reaction="${esc(x)}">${esc(x)}</button>`).join("")}</div>`;
    box.querySelectorAll("[data-reaction]").forEach(b => b.addEventListener("click", () => setReaction(id, b.dataset.reaction), { once: true }));
  }
  async function setReaction(postId, reaction) {
    const { error } = await sb.rpc("tafa_set_post_reaction", { p_post_id: postId, p_reaction_type: reaction });
    if (error) return toast(error.message);
    toast("Réaction enregistrée"); await loadPosts();
  }
  async function addComment(postId) {
    const input = $("comment-" + postId), text = input?.value.trim(); if (!text) return;
    const { error } = await sb.from("comments").insert({ post_id: postId, user_id: state.user.id, text, content: text });
    if (error) return toast(error.message);
    input.value = ""; toast("Commentaire publié"); await loadPosts();
  }
  async function sharePost(id) {
    const { error } = await sb.rpc("tafa_increment_post_share", { p_post_id: id });
    if (error) {
      const p = state.posts.find(x => x.id === id);
      if (!p) return toast(error.message);
      const r = await sb.from("posts").update({ shares: Number(p.shares || 0) + 1 }).eq("id", id);
      if (r.error) return toast(r.error.message);
    }
    toast("Publication partagée"); await loadPosts();
  }
  async function publishPost() {
    if (!state.user) return;
    const text = $("postText")?.value.trim() || "", file = $("postFile")?.files?.[0];
    if (!text && !file) return toast("Écrivez quelque chose ou choisissez un média.");
    const button = $("publishBtn"); setLoading(button, true);
    try {
      let media_url = null, media_type = null;
      if (file) {
        const ext = file.name.split(".").pop().toLowerCase(), path = `${state.user.id}/${crypto.randomUUID()}.${ext}`;
        const up = await sb.storage.from("posts").upload(path, file, { upsert: false });
        if (up.error) throw new Error("Upload : " + up.error.message);
        media_url = sb.storage.from("posts").getPublicUrl(path).data.publicUrl;
        media_type = file.type.startsWith("video/") ? "reel" : "image";
      }
      const { error } = await sb.from("posts").insert({ user_id: state.user.id, content: text, media_url, media_type, visibility: "public" });
      if (error) throw new Error(error.message);
      $("postText").value = ""; $("postFile").value = ""; toast("Publication publiée"); await loadPosts();
    } catch (e) { toast(e.message); }
    finally { setLoading(button, false, "Publier"); }
  }

  async function friendsPage() {
    const { data, error } = await sb.from("profiles").select("*").neq("id", state.user.id).limit(40);
    if (error) return simplePage("Amis", `<div class="empty">${esc(error.message)}</div>`);
    const people = data || [];
    const incoming = await sb.from("friend_requests").select("*").eq("receiver_id", state.user.id).eq("status", "pending");
    const sent = await sb.from("friend_requests").select("receiver_id,status").eq("sender_id", state.user.id);
    const sentIds = new Set((sent.data || []).map(x => x.receiver_id));
    const pending = new Set((incoming.data || []).map(x => x.sender_id));
    $("content").innerHTML = `<div class="card"><div class="page-header"><h2>Amis</h2><span class="muted">${people.length} personnes</span></div><div class="friends-filter"><button class="active">Suggestions</button><button>Amis</button><button>Demandes</button></div>${pending.size ? `<h3 class="menu-section-title">Demandes reçues</h3>${people.filter(p=>pending.has(p.id)).map(p=>friendRow(p,"incoming")).join("")}` : ""}<h3 class="menu-section-title">Suggestions pour vous</h3>${people.map(p=>friendRow(p,sentIds.has(p.id)?"sent":"add")).join("")}</div>`;
  }
  function friendRow(p, type) {
    const action = type === "sent" ? `<button class="ghost-action" disabled>Envoyée</button>` : type === "incoming" ? `<div><button class="small-action" data-action="accept-friend" data-id="${esc(p.id)}">Confirmer</button><button class="ghost-action" data-action="decline-friend" data-id="${esc(p.id)}">Supprimer</button></div>` : `<button class="small-action" data-action="add-friend" data-id="${esc(p.id)}">Ajouter</button>`;
    return `<div class="list-row">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b><small>${p.username ? "@"+esc(p.username) : "Membre Tafaß"}</small></div>${action}</div>`;
  }
  async function addFriend(id) {
    const { error } = await sb.from("friend_requests").insert({ sender_id: state.user.id, receiver_id: id, status: "pending" });
    toast(error ? error.message : "Invitation envoyée"); if (!error) await friendsPage();
  }
  async function handleFriend(id, status) {
    const { error } = await sb.from("friend_requests").update({ status }).eq("sender_id", id).eq("receiver_id", state.user.id).eq("status", "pending");
    if (error) return toast(error.message);
    if (status === "accepted") {
      await sb.from("friendships").upsert([{ user_id: state.user.id, friend_id: id }, { user_id: id, friend_id: state.user.id }], { onConflict: "user_id,friend_id" });
    }
    toast(status === "accepted" ? "Ami ajouté" : "Demande supprimée"); await friendsPage();
  }

  async function searchPage(q = "") {
    const term = q.trim(); let data = [];
    if (term) {
      const r = await sb.from("profiles").select("*").or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,username.ilike.%${term}%`).limit(30);
      data = r.data || [];
    }
    $("content").innerHTML = `<div class="card search-page"><div class="page-header"><h2>Rechercher</h2></div><input id="searchInput" value="${esc(term)}" placeholder="Compte, pseudo..."><div id="searchResults">${term ? (data.length ? data.map(p=>`<div class="list-row">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b><small>@${esc(p.username||"")}</small></div><button class="small-action" data-action="view-profile" data-id="${esc(p.id)}">Voir</button></div>`).join("") : `<div class="empty">Aucun résultat.</div>`) : `<div class="empty">Recherchez un utilisateur.</div>`}</div></div>`;
    $("searchInput").addEventListener("keydown", e => { if (e.key === "Enter") searchPage(e.target.value); });
  }

  async function messagesPage() {
    const { data: members } = await sb.from("conversation_members").select("conversation_id,user_id").eq("user_id", state.user.id);
    const ids = (members || []).map(x => x.conversation_id);
    let conversations = [];
    if (ids.length) {
      const { data } = await sb.from("conversations").select("*").in("id", ids).order("created_at", { ascending: false });
      conversations = data || [];
    }
    const otherIds = [...new Set((members || []).map(m => m.user_id))];
    let people = [];
    if (otherIds.length) { const r = await sb.from("profiles").select("*").in("id", otherIds); people = r.data || []; }
    const person = people[0];
    $("content").innerHTML = `<div class="card"><div class="page-header"><h2>Messages</h2><button class="round-button" data-action="new-message">↗</button></div><div class="searchbox" style="width:100%;margin-bottom:10px"><span class="icon">⌕</span><input id="messageSearch" placeholder="Rechercher"></div>${conversations.length ? conversations.map(c=>`<button class="list-row" style="width:100%;text-align:left" data-action="open-conversation" data-id="${esc(c.id)}">${avatarHTML(person)}<div class="grow"><b>${esc(c.name || nameOf(person) || "Conversation")}</b><small>Ouvrir la conversation</small></div><small>›</small></button>`).join("") : `<div class="empty">Aucune conversation.<br><button class="text-button" data-action="new-message">Commencer une discussion</button></div>`}</div>`;
  }

  async function newMessage() {
    const { data: people } = await sb.from("profiles").select("*").neq("id", state.user.id).limit(20);
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>Nouvelle conversation</h3><div>${(people||[]).map(p=>`<button class="list-row" style="width:100%;text-align:left" data-action="start-conversation" data-id="${esc(p.id)}">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b><small>${esc(p.username||"")}</small></div><span>›</span></button>`).join("")}</div></div>`);
  }
  async function startConversation(otherId) {
    const { data: mine } = await sb.from("conversation_members").select("conversation_id").eq("user_id", state.user.id);
    for (const m of mine || []) {
      const r = await sb.from("conversation_members").select("user_id").eq("conversation_id", m.conversation_id);
      if ((r.data || []).some(x => x.user_id === otherId)) { closeModal(); return openConversation(m.conversation_id); }
    }
    const { data: conv, error } = await sb.from("conversations").insert({ type: "private", created_by: state.user.id }).select().single();
    if (error) return toast(error.message);
    const add = await sb.from("conversation_members").insert([{ conversation_id: conv.id, user_id: state.user.id }, { conversation_id: conv.id, user_id: otherId }]);
    if (add.error) return toast(add.error.message);
    closeModal(); await openConversation(conv.id);
  }
  async function openConversation(id) {
    state.selectedConversation = id;
    const { data: msgs } = await sb.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }).limit(100);
    const ids = [...new Set((msgs || []).map(m => m.sender_id))];
    const { data: profiles } = ids.length ? await sb.from("profiles").select("*").in("id", ids) : { data: [] };
    const map = new Map((profiles || []).map(p => [p.id, p]));
    $("content").innerHTML = `<div class="card"><div class="page-header"><button class="text-button" data-route="messages">‹ Messages</button><h2 style="margin:auto">Discussion</h2><span></span></div><div class="message-list">${(msgs||[]).map(m=>`<div class="message ${m.sender_id===state.user.id?"mine":""}"><div>${esc(m.content)}</div><small>${timeAgo(m.created_at)}</small></div>`).join("")||`<div class="empty">Dites bonjour 👋</div>`}</div><form id="messageForm" class="comment-form"><input id="messageText" placeholder="Écrire un message..." required><button>Envoyer</button></form></div>`;
    $("messageForm").addEventListener("submit", async e => { e.preventDefault(); const text=$("messageText").value.trim(); if(!text)return; const r=await sb.from("messages").insert({conversation_id:id,sender_id:state.user.id,content:text}); if(r.error)toast(r.error.message); else {$("messageText").value=""; await openConversation(id);} });
  }

  async function notificationsPage() {
    const { data, error } = await sb.from("notifications").select("*").eq("user_id", state.user.id).order("created_at", { ascending: false }).limit(50);
    if (error) return simplePage("Alertes", `<div class="empty">${esc(error.message)}</div>`);
    $("content").innerHTML = `<div class="card"><div class="page-header"><h2>Alertes</h2><button class="text-button" data-action="mark-read">Tout lire</button></div><div>${(data||[]).map(n=>`<div class="list-row ${n.is_read?"":"unread"}">${avatarHTML(null)}<div class="grow"><b>${esc(n.title || "Nouvelle activité")}</b><small>${esc(n.message || "Vous avez une nouvelle notification.")} · ${timeAgo(n.created_at)}</small></div>${n.is_read?"":"<span class=\"blue-dot\"></span>"}</div>`).join("") || `<div class="empty">Aucune alerte pour le moment.</div>`}</div></div>`;
  }
  async function markRead() {
    const { error } = await sb.from("notifications").update({ is_read: true }).eq("user_id", state.user.id).eq("is_read", false);
    if (error) return toast(error.message); toast("Alertes lues"); await notificationsPage(); updateBadges();
  }
  async function updateBadges() {
    const n = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", state.user.id).eq("is_read", false);
    const el = $("notifBadge"); if (el) { el.textContent = String(n.count || 0); el.classList.toggle("hidden", !n.count); }
  }

  async function profilePage(tab = state.profileTab) {
    state.profileTab = tab;
    const p = state.profile || {}, mine = state.posts.filter(x => x.user_id === state.user.id);
    const photos = mine.filter(x => x.media_url && x.media_type === "image");
    const cover = p.cover_url ? `style="background-image:url('${esc(p.cover_url)}')"` : "";
    let tabBody = "";
    if (tab === "photos") tabBody = `<div class="card"><div class="photo-grid">${photos.map(x=>`<img src="${esc(x.media_url)}" alt="Photo">`).join("") || `<div class="empty" style="grid-column:1/-1">Aucune photo publiée.</div>`}</div></div>`;
    else if (tab === "friends") tabBody = `<div class="card"><div class="list-row">${avatarHTML(p)}<div class="grow"><b>Votre réseau</b><small>Découvrez vos amis et les personnes que vous suivez.</small></div></div><button class="primary big" data-route="friends">Voir mes amis</button></div>`;
    else if (tab === "videos") tabBody = `<div class="card"><div class="empty">${mine.some(x=>x.media_type==="video"||x.media_type==="reel")?"Vos vidéos sont disponibles ici.":"Aucune vidéo publiée."}</div></div>`;
    else tabBody = `<div class="card"><div class="profile-post-list">${mine.length?mine.map(x=>`<div class="list-row"><div class="grow"><b>${esc(x.content || "Publication avec média")}</b><small>${timeAgo(x.created_at)}</small></div></div>`).join(""):`<div class="empty">Aucune publication.</div>`}</div></div>`;
    $("content").innerHTML = `<div class="hero card" style="padding:0;overflow:hidden"><div class="profile-cover" ${cover}></div><div class="profile-main">${avatarHTML(p,"avatar profile-avatar")}<h2 class="profile-name">${esc(nameOf(p))}</h2><div class="profile-handle">@${esc(p.username||"tafa_user")}</div><p class="profile-bio">${esc(p.bio || "Développeur | Passionné | Rêveur")}</p><div class="profile-actions"><button class="primary" data-action="edit-profile">Modifier le profil</button><button class="ghost-action" data-action="profile-more">•••</button></div><div class="profile-stats"><div class="profile-stat"><b>${mine.length}</b><small>Publications</small></div><div class="profile-stat"><b>1,2 K</b><small>Amis</small></div><div class="profile-stat"><b>3,4 K</b><small>Abonnés</small></div></div><div class="profile-info"><div>⌂ ${esc(p.location || "Toamasina, Madagascar")}</div><div>◷ Rejoint Tafaß en 2024</div></div><div class="profile-tabs">${[["posts","Publications"],["photos","Photos"],["videos","Vidéos"],["friends","Amis"]].map(([k,v])=>`<button class="${tab===k?"active":""}" data-action="profile-tab" data-tab="${k}">${v}</button>`).join("")}</div></div></div>${tabBody}`;
  }

  function editProfile() {
    const p = state.profile || {};
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>Modifier le profil</h3><div class="form-stack"><label>Prénom<input id="pfFirst" value="${esc(p.first_name||"")}"></label><label>Nom<input id="pfLast" value="${esc(p.last_name||"")}"></label><label>Pseudo<input id="pfUsername" value="${esc(p.username||"")}"></label><label>Bio<textarea id="pfBio">${esc(p.bio||"")}</textarea></label><label>Ville / pays<input id="pfLocation" value="${esc(p.location||"")}"></label><button class="primary big" data-action="save-profile">Enregistrer</button></div></div>`);
  }
  async function saveProfile() {
    const patch = { first_name:$("pfFirst").value.trim(), last_name:$("pfLast").value.trim(), username:$("pfUsername").value.trim().replace(/^@/,"") || null, bio:$("pfBio").value.trim(), location:$("pfLocation").value.trim() };
    const { error } = await sb.from("profiles").update(patch).eq("id", state.user.id);
    if (error) return toast(error.message);
    closeModal(); await loadProfile(); toast("Profil mis à jour"); await profilePage();
  }

  async function genericListPage(route) {
    if (route === "videos" || route === "reels") {
      const wanted = route === "reels" ? ["reel","video"] : ["video"];
      const rows = state.posts.filter(p => wanted.includes(p.media_type));
      $("content").innerHTML = `<div class="card"><div class="page-header"><h2>${route === "reels" ? "Reels" : "Vidéos"}</h2><span class="muted">Découvrir</span></div>${rows.length?rows.map(p=>`<article class="post"><div class="post-head">${avatarHTML(p.author)}<div class="meta"><b>${esc(nameOf(p.author))}</b><small>${timeAgo(p.created_at)}</small></div></div>${p.content?`<div class="post-body">${esc(p.content)}</div>`:""}${p.media_type==="video"||p.media_type==="reel"?`<video class="post-media" src="${esc(p.media_url)}" controls></video>`:""}</article>`).join(""):`<div class="empty">Aucun contenu pour le moment.</div>`}</div>`;
      return;
    }
    if (route === "pages") {
      const { data } = await sb.from("pages").select("*").limit(30);
      return simplePage("Pages", `<div class="menu-grid">${(data||[]).map(p=>`<div class="menu-card"><span class="menu-icon">▣</span><span><b>${esc(p.name)}</b><small>${esc(p.category||"Page")}</small></span></div>`).join("") || `<div class="empty" style="grid-column:1/-1">Aucune Page disponible.</div>`}</div>`);
    }
    if (route === "groups") {
      const { data } = await sb.from("groups").select("*").limit(30);
      return simplePage("Groupes", `<div class="menu-grid">${(data||[]).map(g=>`<div class="menu-card"><span class="menu-icon">◎</span><span><b>${esc(g.name)}</b><small>${esc(g.privacy)}</small></span></div>`).join("") || `<div class="empty" style="grid-column:1/-1">Aucun groupe disponible.</div>`}</div>`);
    }
    if (route === "saved") {
      const { data } = await sb.from("saved_posts").select("post_id").eq("user_id", state.user.id);
      const ids = (data||[]).map(x=>x.post_id), saved = state.posts.filter(p=>ids.includes(p.id));
      return simplePage("Enregistrements", saved.length ? saved.map(p=>`<div class="list-row">${avatarHTML(p.author)}<div class="grow"><b>${esc(nameOf(p.author))}</b><small>${esc(p.content||"Publication enregistrée")}</small></div></div>`).join("") : `<div class="empty">Vos publications enregistrées apparaîtront ici.</div>`);
    }
  }

  function tafabPage() {
    simplePage("Tafaß", `
      <div class="tafab-hero card-inner">
        <div class="tafab-brand-mark">T</div>
        <div class="grow">
          <h3>Marché & échanges Tafaß</h3>
          <p class="page-subtitle">Un espace simple pour découvrir une offre et en discuter.</p>
        </div>
      </div>
      <div class="tafab-grid">
        <article class="tafab-card tafab-discussion">
          <div class="tafab-card-head"><span class="tafab-icon">💬</span><div><b>Discussion — Vente d’eau</b><small>Échange local</small></div></div>
          <p><b>Vendeur :</b> Eau potable disponible aujourd’hui. Livraison possible selon le quartier.</p>
          <p class="muted">Client : « Bonjour, est-ce qu’il reste des bidons d’eau et pouvez-vous livrer ? »</p>
          <div class="tafab-actions"><button class="primary" data-action="tafab-message">Répondre</button><button class="ghost-action" data-action="tafab-info">Voir les détails</button></div>
        </article>
        <article class="tafab-card tafab-ad">
          <div class="tafab-ad-label">PUBLICATION • Tafaß</div>
          <h3>💧 Eau potable à vendre</h3>
          <p>Eau potable propre et prête à la livraison. Contactez le vendeur directement pour connaître le prix, la quantité et la zone desservie.</p>
          <div class="tafab-price">Disponible aujourd’hui</div>
          <button class="primary big" data-action="tafab-contact">Contacter le vendeur</button>
        </article>
      </div>
    `);
  }

  function menuPage() {
    const p = state.profile || {};
    const items = [
      ["profile","◉","Profil","Voir votre profil"],["friends","♧","Amis","Votre réseau"],["groups","◎","Groupes","Communautés"],["pages","▣","Pages","Pages que vous gérez"],
      ["saved","♡","Enregistrements","Publications sauvegardées"],["videos","▷","Vidéos","Regarder et publier"],["reels","◉","Reels","Formats courts"],["settings","⚙","Paramètres & Confidentialité","Compte, sécurité et préférences"]
    ];
    simplePage("Menu", `<div class="menu-profile">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b><small>${esc(p.email || state.user?.email || "")}</small></div><button class="small-action" data-route="profile">Profil</button></div><div class="menu-section-title">Raccourcis</div><div class="menu-grid">${items.map(x=>`<button class="menu-card" data-route="${x[0]}"><span class="menu-icon">${x[1]}</span><span><b>${x[2]}</b><small>${x[3]}</small></span></button>`).join("")}</div><div class="menu-section-title">Actions</div><div class="menu-grid"><button class="menu-card danger-card" data-action="logout"><span class="menu-icon">↪</span><span><b>Déconnexion</b><small>Quitter ce compte</small></span></button></div>`);
  }

  function settingsPage() {
    const dark = state.theme === "dark";
    simplePage("Paramètres & Confidentialité", `<p class="page-subtitle">Gérez votre compte et votre expérience Tafaß.</p><div class="settings-grid"><button class="setting-card" data-action="setting" data-name="Compte"><span><b>Compte</b><small>Informations personnelles</small></span><span>›</span></button><button class="setting-card" data-action="setting" data-name="Paiement"><span><b>Paiement</b><small>Moyens et historique</small></span><span>›</span></button><button class="setting-card" data-action="setting" data-name="Aide"><span><b>Aide</b><small>Assistance Tafaß</small></span><span>›</span></button><button class="setting-card" data-action="setting" data-name="Politique de confidentialité"><span><b>Confidentialité</b><small>Contrôler vos données</small></span><span>›</span></button><button class="setting-card" data-action="setting" data-name="Historique d'activité"><span><b>Historique d'activité</b><small>Vos actions récentes</small></span><span>›</span></button><button class="setting-card" data-action="setting" data-name="Recherche"><span><b>Recherche</b><small>Préférences de recherche</small></span><span>›</span></button><button class="setting-card" data-action="theme"><span><b>Mode sombre</b><small>${dark?"Activé":"Désactivé"}</small></span><span class="toggle ${dark?"on":""}"><i></i></span></button><button class="setting-card" data-action="setting" data-name="Notifications"><span><b>Notifications</b><small>Alertes et activité</small></span><span>›</span></button></div>`);
  }
  function settingInfo(name) {
    const bodies = {
      "Compte":"Modifiez vos informations personnelles, votre pseudo et vos coordonnées depuis votre profil.",
      "Paiement":"Cette section est prête pour les fonctions de paiement connectées à votre compte Tafaß.",
      "Aide":"Consultez l'aide et les informations de support de Tafaß.",
      "Politique de confidentialité":"Vos données de profil et vos contenus sont contrôlés par les règles de confidentialité configurées dans Supabase.",
      "Historique d'activité":"Retrouvez ici vos activités récentes. Les événements disponibles sont ceux enregistrés par Tafaß.",
      "Recherche":"Utilisez la recherche globale pour trouver des comptes et des contenus.",
      "Notifications":"Gérez votre activité et consultez vos alertes depuis la section Alertes."
    };
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>${esc(name)}</h3><p class="muted" style="font-size:11px;line-height:1.6">${esc(bodies[name] || "Option Tafaß")}</p><button class="primary big" data-action="close-modal">Fermer</button></div>`);
  }

  function simplePage(title, body) { $("content").innerHTML = `<div class="card"><div class="page-header"><h2>${esc(title)}</h2></div>${body}</div>`; }
  function openModal(html) { $("modal").className = "modal"; $("modal").innerHTML = html; }
  function closeModal() { $("modal").className = "modal hidden"; $("modal").innerHTML = ""; }

  async function render() {
    if (!state.user) return;
    document.querySelectorAll("[data-route]").forEach(el => el.classList.toggle("active", el.dataset.route === state.route));
    window.scrollTo(0, 0);
    if (state.route === "home") await renderFeed();
    else if (state.route === "friends") await friendsPage();
    else if (state.route === "search") await searchPage("");
    else if (state.route === "messages") await messagesPage();
    else if (state.route === "notifications") await notificationsPage();
    else if (state.route === "profile") await profilePage();
    else if (["videos","reels","pages","groups","saved"].includes(state.route)) await genericListPage(state.route);
    else if (state.route === "menu") menuPage();
    else if (state.route === "tafab") tafabPage();
    else if (state.route === "settings") settingsPage();
    updateBadges();
  }

  function navigate(route) {
    if (!routes.includes(route)) route = "home";
    if (state.route === route && route !== "search") return;
    state.route = route;
    history.replaceState(null, "", "#" + route);
    render();
  }

  function syncThemeButton() {
    const btn = $("themeBtn");
    if (!btn) return;
    btn.innerHTML = state.theme === "dark"
      ? '<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>'
      : '<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    btn.setAttribute("aria-label", state.theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre");
  }

  function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.body.classList.toggle("light", state.theme === "light");
    localStorage.setItem("tafa-theme", state.theme);
    syncThemeButton();
    if (state.user && state.route === "settings") settingsPage();
  }

  async function logout() { await sb.auth.signOut(); location.reload(); }

  async function setupRealtime() {
    if (state.channel) await sb.removeChannel(state.channel);
    state.channel = sb.channel("tafa-live-ui")
      .on("postgres_changes", { event:"*", schema:"public", table:"posts" }, () => loadPosts())
      .on("postgres_changes", { event:"*", schema:"public", table:"comments" }, () => loadPosts())
      .on("postgres_changes", { event:"*", schema:"public", table:"post_reactions" }, () => loadPosts())
      .on("postgres_changes", { event:"*", schema:"public", table:"notifications" }, () => { updateBadges(); if (state.route === "notifications") notificationsPage(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"messages" }, () => { if (state.route === "messages" && state.selectedConversation) openConversation(state.selectedConversation); })
      .on("postgres_changes", { event:"*", schema:"public", table:"friend_requests" }, () => { if (state.route === "friends") friendsPage(); })
      .subscribe();
  }

  async function enterApp() {
    if (state.entering) return;
    state.entering = true;
    $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
    document.body.classList.toggle("light", state.theme === "light");
    syncThemeButton();
    await loadProfile(); await loadPosts(); await setupRealtime();
    state.entering = false;
    await render();
  }
  function showLogin() { $("signupView").classList.add("hidden"); $("loginView").classList.remove("hidden"); $("auth").classList.remove("hidden"); }
  function showSignup() { $("loginView").classList.add("hidden"); $("signupView").classList.remove("hidden"); $("auth").classList.remove("hidden"); }

  document.addEventListener("click", async e => {
    const routeEl = e.target.closest("[data-route]");
    if (routeEl) { e.preventDefault(); navigate(routeEl.dataset.route); return; }
    const actionEl = e.target.closest("[data-action]"); if (!actionEl) return;
    const action = actionEl.dataset.action, id = actionEl.dataset.id;
    if (action === "react") return showReactions(id);
    if (action === "comment") { $("comment-"+id)?.focus(); return; }
    if (action === "send-comment") return addComment(id);
    if (action === "share") return sharePost(id);
    if (action === "post-menu") return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>Publication</h3><div class="menu-grid"><button class="menu-card" data-action="save-post" data-id="${esc(id)}"><span class="menu-icon">♡</span><span><b>Enregistrer</b><small>Retrouver plus tard</small></span></button><button class="menu-card" data-action="close-modal"><span class="menu-icon">×</span><span><b>Fermer</b><small>Retour à l'accueil</small></span></button></div></div>`);
    if (action === "save-post") { const r=await sb.from("saved_posts").upsert({user_id:state.user.id,post_id:id},{onConflict:"user_id,post_id"}); toast(r.error?r.error.message:"Publication enregistrée"); closeModal(); return; }
    if (action === "add-friend") return addFriend(id);
    if (action === "accept-friend") return handleFriend(id,"accepted");
    if (action === "decline-friend") return handleFriend(id,"declined");
    if (action === "view-profile") { state.profileTab="posts"; return toast("Profil consultable depuis la recherche."); }
    if (action === "profile-tab") return profilePage(actionEl.dataset.tab);
    if (action === "edit-profile") return editProfile();
    if (action === "save-profile") return saveProfile();
    if (action === "profile-more") return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>Profil</h3><p class="muted" style="font-size:11px">Votre profil Tafaß est visible selon vos réglages de confidentialité.</p></div>`);
    if (action === "new-message") return newMessage();
    if (action === "start-conversation") return startConversation(id);
    if (action === "open-conversation") return openConversation(id);
    if (action === "mark-read") return markRead();
    if (action === "theme") return toggleTheme();
    if (action === "tafab-message") return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>Discussion — Vente d’eau</h3><p class="muted">Vous pouvez demander la disponibilité, le prix et la livraison au vendeur.</p><button class="primary big" data-action="close-modal">Fermer</button></div>`);
    if (action === "tafab-info") return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>Détails de l’offre</h3><p class="muted">Eau potable disponible aujourd’hui. Les informations de prix, quantité et livraison sont à confirmer avec le vendeur.</p><button class="primary big" data-action="close-modal">Fermer</button></div>`);
    if (action === "tafab-contact") return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>Contacter le vendeur</h3><p class="muted">Demandez le prix, la quantité disponible et la zone de livraison avant de confirmer votre achat.</p><button class="primary big" data-action="close-modal">Fermer</button></div>`);
    if (action === "setting") return settingInfo(actionEl.dataset.name);
    if (action === "logout") return logout();
    if (action === "close-modal") return closeModal();
    if (action === "add-story") return toast("Les stories seront disponibles après activation du stockage dédié.");
    if (action === "story") return toast("Story consultable prochainement.");
    if (action === "mood") return toast("Choisissez une humeur dans une prochaine version.");
  });

  document.querySelectorAll("[data-password-toggle]").forEach(btn => btn.addEventListener("click", () => {
    const input = $(btn.dataset.passwordToggle); if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  }));
  $("showSignup").addEventListener("click", showSignup);
  $("showLogin").addEventListener("click", showLogin);
  $("forgotPassword").addEventListener("click", async () => {
    const email = $("loginEmail").value.trim();
    if (!email || !email.includes("@")) return toast("Entrez votre adresse e-mail.");
    const { error } = await sb.auth.resetPasswordForEmail(email);
    toast(error ? error.message : "Lien de réinitialisation envoyé par e-mail.");
  });
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const value = $("loginEmail").value.trim(), password = $("loginPassword").value;
    $("authMsg").textContent = "Connexion…";
    let email = value;
    if (!value.includes("@")) {
      const r = await sb.from("profiles").select("email").eq("phone", value).maybeSingle();
      email = r.data?.email || "";
    }
    if (!email) { $("authMsg").textContent = "Compte introuvable."; return; }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    $("authMsg").textContent = error ? error.message : "";
  });
  $("signupForm").addEventListener("submit", async e => {
    e.preventDefault();
    const first=$("firstName").value.trim(), last=$("lastName").value.trim(), email=$("signupEmail").value.trim(), password=$("signupPassword").value, username=$("username").value.trim().replace(/^@/,"");
    if (!$("terms").checked) return toast("Acceptez les conditions pour continuer.");
    $("signupMsg").textContent = "Création du compte…";
    const meta = { first_name:first, last_name:last, username:username||null, phone:$("phone").value.trim(), phone_code:$("phoneCode").value, country:$("country").value, birth:$("birth").value||null };
    const { data, error } = await sb.auth.signUp({ email, password, data: meta });
    if (error) { $("signupMsg").textContent = error.message; return; }
    if (data.session) {
      const patch = { first_name:first,last_name:last,username:username||null,email,phone:$("phone").value.trim(),phone_code:$("phoneCode").value,country:$("country").value,birth:$("birth").value||null };
      await sb.from("profiles").update(patch).eq("id",data.user.id);
      $("signupMsg").textContent="Compte créé.";
    } else $("signupMsg").textContent="Compte créé. Vérifiez votre e-mail si la confirmation est activée.";
  });
  $("themeBtn").addEventListener("click", toggleTheme);
  syncThemeButton();
  $("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  $("globalSearch").addEventListener("keydown", e => { if (e.key === "Enter") { state.route="search"; history.replaceState(null,"","#search"); searchPage(e.target.value); } });
  window.addEventListener("hashchange", () => { const r=location.hash.slice(1); if(routes.includes(r)) { state.route=r; render(); } });

  document.body.classList.toggle("light", state.theme === "light");
  setTimeout(() => { const splash=$("splash"); if (splash) splash.remove(); }, 1600);
  sb.auth.onAuthStateChange(async (_event, session) => {
    state.user = session?.user || null;
    if (state.user) await enterApp(); else { $("app").classList.add("hidden"); showLogin(); }
  });
  (async () => {
    const { data } = await sb.auth.getSession();
    state.user = data.session?.user || null;
    if (state.user) await enterApp(); else showLogin();
  })();
})();
