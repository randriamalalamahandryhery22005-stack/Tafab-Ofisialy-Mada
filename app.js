document.documentElement.classList.add("app-boot");
(() => {
  "use strict";

  const SUPABASE_URL = "https://qvxmaeepwrprtoaipoir.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OxmDXLn69jclSWnYtdjsxQ_TMfMI4X-";
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
  const routes = ["home","friends","search","messages","notifications","profile","reels","pages","groups","saved","menu","tafab","settings"];
  const state = {
    user: null, profile: null, route: "home", navStack: ["home"], backOverride: null, posts: [], friends: [], stories: [],
    channel: null, theme: "dark", entering: false,
    profileTab: "posts", friendsTab: "suggestions", selectedConversation: null, viewingProfileId: null, renderToken: 0
  };

  const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%232d7cff'/%3E%3Cstop offset='.55' stop-color='%23745cff'/%3E%3Cstop offset='1' stop-color='%2310b8a6'/%3E%3C/linearGradient%3E%3ClinearGradient id='h' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23ffffff' stop-opacity='.9'/%3E%3Cstop offset='1' stop-color='%23dce8ff' stop-opacity='.7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='256' height='256' rx='128' fill='url(%23g)'/%3E%3Ccircle cx='128' cy='101' r='47' fill='url(%23h)'/%3E%3Cpath d='M52 218c10-47 38-70 76-70s66 23 76 70' fill='url(%23h)'/%3E%3Ccircle cx='128' cy='128' r='112' fill='none' stroke='%23ffffff' stroke-opacity='.22' stroke-width='5'/%3E%3C/svg%3E";
  function avatarHTML(p, cls = "avatar") {
    const url = p?.avatar_url || DEFAULT_AVATAR;
    return `<span class="${cls} default-avatar-image"><img src="${esc(url)}" alt="Avatar"></span>`;
  }
  function entityAvatarHTML(entity, type = "page", cls = "entity-logo") {
    const url = entity?.logo_url || entity?.avatar_url || DEFAULT_AVATAR;
    return `<div class="${cls} entity-default-avatar-image ${type}"><img src="${esc(url)}" alt="Avatar"></div>`;
  }

  const PAGE_CATEGORIES = [
    "Agriculture et élevage","Alimentation et boissons","Animaux","Art et culture","Automobile","Beauté et soins","Blog personnel","Commerce","Communauté","Conseil et services","Cuisine et gastronomie","Éducation","Électronique","Entreprise","Événementiel","Finance","Fitness et sport","Formation professionnelle","Hôtellerie","Immobilier","Informatique","Internet et technologie","Jeux vidéo","Juridique","Maison et décoration","Mode et vêtements","Médias et actualités","Musique","Organisation","Photographie","Politique et société","Produits locaux","Publicité et marketing","Restaurant","Santé et bien-être","Sciences","Services professionnels","Shopping","Tourisme et voyage","Transport","Vente au détail","Vidéos et créateurs","Association","Artisanat","Banque et assurance","Cinéma","Club","Cosmétiques","Développement personnel","Éditions et livres","Environnement","Famille et parentalité","Industrie","Journalisme","Librairie","Logistique","Marché et marketplace","Musée","Non lucratif","Parc et loisirs","Podcast","Radio","Recherche","Réseaux sociaux","Sécurité","Télécommunications","Université","Autre"
  ];
  function pageCategoryOptions(selected = "") {
    return PAGE_CATEGORIES.map(c => `<option value="${esc(c)}" ${String(selected||"") === c ? "selected" : ""}>${esc(c)}</option>`).join("");
  }

  function nameOf(p) { return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Membre Tafaß"; }
  const MG_CITIES = [
    "Antananarivo","Ambohimanambola","Ambohidratrimo","Andramasina","Anjozorobe","Ankazobe","Manjakandriana","Arivonimamo","Miarinarivo","Soavinandriana","Tsiroanomandidy","Antsirabe","Betafo","Ambatolampy","Fianarantsoa","Ambalavao","Manakara","Mananjary","Farafangana","Toamasina","Fenerive Est","Vatomandry","Brickaville","Mahajanga","Marovoay","Mitsinjo","Antsiranana","Ambilobe","Nosy Be","Sambava","Antalaha","Toliara","Morondava","Belo sur Tsiribihina","Miandrivazo","Taolagnaro","Amboasary","Ihosy","Ambovombe"
  ];
  const MG_PROVINCES = ["Antananarivo","Antsiranana","Fianarantsoa","Mahajanga","Toamasina","Toliara"];
  const COUNTRY_META = {
    MG:{name:"Madagascar",code:"+261",digits:9,placeholder:"330000000",test:/^[3-9]\d{8}$/},
    FR:{name:"France",code:"+33",digits:9,placeholder:"600000000",test:/^[1-9]\d{8}$/},
    US:{name:"États-Unis",code:"+1",digits:10,placeholder:"2025550123",test:/^[2-9]\d{9}$/}
  };
  function detectCountry(){
    const lang=(navigator.language||"").toUpperCase();
    if(/(^|[-_])MG\b/.test(lang)) return "MG";
    if(/(^|[-_])FR\b/.test(lang)) return "FR";
    if(/(^|[-_])(US|CA)\b/.test(lang)) return "US";
    const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"";
    if(tz.startsWith("Africa/")) return "MG";
    return "MG";
  }
  function phoneMeta(){ return COUNTRY_META[state.detectedCountry||detectCountry()] || COUNTRY_META.MG; }
  function normalizePhone(value, meta=phoneMeta()){
    let d=String(value||"").replace(/\D/g,"");
    if(d.startsWith(meta.code.replace("+",""))) d=d.slice(meta.code.length-1);
    return d;
  }
  function internationalPhone(value, meta=phoneMeta()){
    const d=normalizePhone(value,meta); return d ? meta.code+d : "";
  }
  function cityListHTML(id, values){ return `<datalist id="${id}">${values.map(v=>`<option value="${esc(v)}"></option>`).join("")}</datalist>`; }
  function validCity(value){ return MG_CITIES.some(c=>c.toLowerCase()===String(value||"").trim().toLowerCase()); }
  function validProvince(value){ return MG_PROVINCES.some(c=>c.toLowerCase()===String(value||"").trim().toLowerCase()); }

  let placeSearchTimer = null;
  let placeSearchController = null;
  function placeLabel(item){
    const a=item?.address||{};
    const parts=[a.city||a.town||a.municipality||a.village||a.county||a.state_district||a.state, a.state&&a.state!==(a.city||a.town||a.municipality||a.village||a.county||a.state_district)?a.state:null, a.country].filter(Boolean);
    return [...new Set(parts)].join(", ");
  }
  function placeDisplay(item){
    return String(item?.display_name || placeLabel(item) || "").trim();
  }
  function installPlaceSearch(inputId, listId){
    const input=$(inputId), list=$(listId);
    if(!input||!list) return;
    input.dataset.placeValid = input.value.trim() ? "true" : "false";
    const close=()=>{list.classList.remove("show"); list.innerHTML="";};
    const render=(items)=>{
      list.innerHTML = items.length ? items.map((x,i)=>`<button type="button" class="place-result" data-place-index="${i}"><b>${esc(placeLabel(x)||x.name||"Lieu")}</b><small>${esc(placeDisplay(x))}</small></button>`).join("") : `<div class="place-empty">Aucun lieu réel trouvé à Madagascar.</div>`;
      list._items=items; list.classList.add("show");
      list.querySelectorAll("[data-place-index]").forEach(btn=>btn.addEventListener("click",()=>{
        const x=list._items[Number(btn.dataset.placeIndex)];
        input.value=placeDisplay(x); input.dataset.placeValid="true"; input.dataset.placeLat=x.lat||""; input.dataset.placeLon=x.lon||""; input.dispatchEvent(new Event("change",{bubbles:true})); close();
      }));
    };
    input.addEventListener("input",()=>{
      input.dataset.placeValid="false";
      const q=input.value.trim(); clearTimeout(placeSearchTimer);
      if(q.length<2){close();return;}
      placeSearchTimer=setTimeout(async()=>{
        try{
          placeSearchController?.abort(); placeSearchController=new AbortController();
          const url=`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=mg&q=${encodeURIComponent(q)}`;
          const r=await fetch(url,{signal:placeSearchController.signal,headers:{"Accept":"application/json","Accept-Language":"fr"}});
          if(!r.ok) throw new Error("Recherche indisponible");
          const items=await r.json(); render(Array.isArray(items)?items:[]);
        }catch(e){ if(e.name!=="AbortError") render([]); }
      },350);
    });
    input.addEventListener("focus",()=>{ if(input.value.trim().length>=2) input.dispatchEvent(new Event("input")); });
    document.addEventListener("click",e=>{ if(!input.contains(e.target)&&!list.contains(e.target)) close(); },{once:false});
  }
  function notificationAction(n) {
    const map = {
      reaction: "a réagi à votre publication.",
      comment: "a commenté votre publication.",
      share: "a partagé votre publication.",
      friend_request: "vous a envoyé une demande d’ami.",
      friend_accepted: "a accepté votre demande d’ami.",
      message: "vous a envoyé un message.",
      follow: "vous suit maintenant.",
      page_follow: "s’est abonné à votre Page.",
      group_join: "a rejoint votre groupe.",
      comment_like: "a réagi à votre commentaire."
    };
    return map[n?.type] || n?.message || "a effectué une nouvelle activité.";
  }
  function notificationTarget(n, actor) {
    if (n?.type === "message" && n?.entity_id) return { action:"open-conversation", id:n.entity_id };
    if (["page_follow"].includes(n?.type) && n?.entity_id) return { action:"page-open", id:n.entity_id };
    if (["group_join"].includes(n?.type) && n?.entity_id) return { action:"group-open", id:n.entity_id };
    if (n?.entity_type === "post" || n?.post_id) return { action:"open-notification-post", id:n.post_id || n.entity_id };
    if (actor?.id) return { action:"view-profile", id:actor.id };
    return null;
  }
  function profileLink(p, inner, cls="profile-link") {
    if (!p?.id) return inner;
    return `<button type="button" class="${cls}" data-action="view-profile" data-id="${esc(p.id)}">${inner}</button>`;
  }
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
    const authEmail = state.user.email || "";
    state.profile = data || {
      id: state.user.id, first_name: state.user.user_metadata?.first_name || "",
      last_name: state.user.user_metadata?.last_name || "", email: authEmail
    };
    // The authenticated email is the source of truth for the UI.
    // Do not write to profiles during every app bootstrap: this can be blocked by RLS
    // and can make OAuth onboarding appear frozen. Email synchronization is handled
    // by the dedicated onboarding/account RPC instead.
    if (authEmail) state.profile.email = authEmail;
    const settings=(await sb.from("user_settings").select("theme").eq("user_id",state.user.id).maybeSingle()).data;
    if(settings?.theme==="light" || settings?.theme==="dark") state.theme=settings.theme;
    const sideName = $("sideName"); if (sideName) sideName.textContent = nameOf(state.profile);
    const sideAvatar = $("sideAvatar"); if (sideAvatar) { sideAvatar.outerHTML = avatarHTML(state.profile, "avatar").replace("<span ", '<span id="sideAvatar" '); }
  }

  async function loadPosts() {
    if (!state.user) return;
    const { data, error } = await sb.from("posts").select("*").order("created_at", { ascending: false }).limit(60);
    state.posts = error ? [] : (data || []);
    await hydratePosts();
  }

  async function loadMyPosts() {
    if (!state.user) return [];
    const { data, error } = await sb.from("posts").select("*")
      .eq("user_id", state.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return [];
    const rows = data || [];
    const ids = [...new Set(rows.map(x => x.user_id).filter(Boolean))];
    if (!ids.length) return rows;
    const { data: profiles } = await sb.from("profiles").select("*").in("id", ids);
    const map = new Map((profiles || []).map(x => [x.id, x]));
    return rows.map(x => ({ ...x, author: map.get(x.user_id) || state.profile }));
  }

  async function hydratePosts() {
    const ids = [...new Set(state.posts.map(p => p.user_id).filter(Boolean))];
    if (!ids.length) return;
    const { data } = await sb.from("profiles").select("*").in("id", ids);
    const map = new Map((data || []).map(p => [p.id, p]));
    state.posts = state.posts.map(p => ({ ...p, author: map.get(p.user_id) }));
  }

  const reactionMeta = {
    like: ["J’aime", "👍"], love: ["J’adore", "❤️"], haha: ["Haha", "😂"],
    wow: ["Waouh", "😮"], sad: ["Triste", "😢"], angry: ["En colère", "😡"],
    care: ["J’adore 🥰", "🥰"], eye_roll: ["🙄", "🙄"]
  };
  async function reactionsFor(postId) {
    const { data } = await sb.from("post_reactions").select("reaction_type,user_id").eq("post_id", postId);
    return data || [];
  }
  async function commentsFor(postId) {
    const { data } = await sb.from("comments").select("*").eq("post_id", postId).order("created_at", { ascending: true }).limit(100);
    const rows = data || [];
    const ids = [...new Set(rows.map(c => c.user_id).filter(Boolean))];
    const { data: profiles } = ids.length ? await sb.from("profiles").select("*").in("id", ids) : { data: [] };
    const map = new Map((profiles || []).map(x => [x.id, x]));
    return rows.map(c => ({ ...c, author: map.get(c.user_id) }));
  }
  async function sharersFor(postId) {
    const { data } = await sb.from("post_shares").select("user_id,created_at").eq("post_id", postId).order("created_at", { ascending: false }).limit(20);
    const rows = data || [];
    const ids = [...new Set(rows.map(x => x.user_id).filter(Boolean))];
    const { data: profiles } = ids.length ? await sb.from("profiles").select("*").in("id", ids) : { data: [] };
    const map = new Map((profiles || []).map(x => [x.id, x]));
    return rows.map(x => ({ ...x, user: map.get(x.user_id) })).filter(x => x.user);
  }

  async function renderFeed() {
    const token = state.renderToken;
    let html = `<div class="composer composer-clean">
      <div class="composer-top">${avatarHTML(state.profile)}<b>${esc(nameOf(state.profile))}</b></div>
      <textarea id="postText" placeholder="Quoi de neuf, ${esc((state.profile?.first_name || "").trim() || "vous")} ?"></textarea>
      <div class="composer-actions"><label class="file-label">▧ Photo/Vidéo<input id="postFile" type="file" accept="image/*,video/*" hidden></label><button type="button" class="primary" id="publishBtn">Publier</button></div>
    </div>`;
    if (!state.posts.length) html += `<div class="card empty">Aucune publication pour le moment.<br><span>Publiez la première sur Tafaß.</span></div>`;
    for (const p of state.posts) {
      if (token !== state.renderToken || state.route !== "home") return;
      html += await postHTML(p);
    }
    if (token !== state.renderToken || state.route !== "home") return;
    $("content").innerHTML = html;
    $("publishBtn")?.addEventListener("click", publishPost);
  }

  async function postHTML(p) {
    const [rs, cs, sh] = await Promise.all([reactionsFor(p.id), commentsFor(p.id), sharersFor(p.id)]);
    const counts = {}; rs.forEach(r => counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1);
    const mine = rs.find(r => r.user_id === state.user.id)?.reaction_type;
    const totalReactions = Object.values(counts).reduce((a,b) => a+b, 0);
    const reactionVisual = Object.entries(counts).map(([k,v]) => `<span class="reaction-chip"><i>${reactionMeta[k]?.[1] || "👍"}</i><b>${v}</b></span>`).join("");
    const media = p.media_url
      ? (p.media_type === "video" || p.media_type === "reel"
        ? `<video class="post-media" src="${esc(p.media_url)}" controls preload="metadata"></video>`
        : `<img class="post-media" src="${esc(p.media_url)}" alt="Publication">`)
      : "";
    const byParent = new Map();
    cs.forEach(c => { const k = c.parent_id || "root"; if (!byParent.has(k)) byParent.set(k, []); byParent.get(k).push(c); });
    const commentHTML = (parentId = null, depth = 0) => (byParent.get(parentId || "root") || []).map(c => {
      const own = c.user_id === state.user.id;
      const postOwner = p.user_id === state.user.id;
      const actions = `<div class="comment-actions"><button data-action="reply-comment" data-id="${esc(c.id)}">Répondre</button>${own || postOwner ? `<button data-action="delete-comment" data-id="${esc(c.id)}">Supprimer</button>` : ""}</div>`;
      const commentAuthor = c.author || (own ? state.profile : null);
      return `<div class="comment comment-depth-${Math.min(depth,3)}" data-comment-id="${esc(c.id)}">${profileLink(commentAuthor, avatarHTML(commentAuthor), "profile-link profile-avatar-link") }<div class="bubble"><div class="comment-author-line">${profileLink(commentAuthor, `<b>${esc(nameOf(commentAuthor))}</b>`, "profile-link profile-comment-name")}<small>${timeAgo(c.created_at)}</small></div><div class="comment-text">${esc(c.content || c.text || "")}</div>${actions}<div class="reply-box" id="reply-${esc(c.id)}"></div>${commentHTML(c.id, depth+1)}</div></div>`;
    }).join("");
    const shareNames = sh.slice(0,3).map(x => esc(nameOf(x.user))).join(", ");
    const shareSummary = sh.length ? `<span class="share-summary">↗ ${shareNames}${sh.length > 3 ? ` +${sh.length-3}` : ""}</span>` : "";
    return `<article class="post" id="post-${esc(p.id)}">
      <div class="post-head">${profileLink(p.author, avatarHTML(p.author), "profile-link profile-avatar-link")}<div class="meta">${profileLink(p.author, `<span class="post-author-name">${esc(nameOf(p.author))}</span>`, "profile-link profile-meta-link")}<span class="post-time"><small>${timeAgo(p.created_at)} · ${esc(p.visibility || "public")}</small></span></div><button class="post-menu" data-action="post-menu" data-id="${esc(p.id)}">⋯</button></div>
      ${p.content ? `<div class="post-body">${esc(p.content)}</div>` : ""}${media}
      <div class="post-stats"><span class="reaction-summary">${reactionVisual || "<span class='muted-inline'>Aucune réaction</span>"}</span><span>${cs.length} commentaire(s) · ${Number(p.shares || sh.length || 0)} partage(s)</span></div>
      ${shareSummary}
      <div class="post-actions"><button class="react-btn" data-action="react" data-id="${esc(p.id)}">${reactionMeta[mine]?.[1] || "👍"} ${esc(reactionMeta[mine]?.[0] || "J’aime")}</button><button data-action="comment" data-id="${esc(p.id)}">💬 Commenter</button><button data-action="share" data-id="${esc(p.id)}">↗ Partager</button></div>
      <div id="reaction-${esc(p.id)}"></div>
      <div class="comments">${commentHTML()}<div class="comment-form"><input id="comment-${esc(p.id)}" placeholder="Écrire un commentaire..."><button data-action="send-comment" data-id="${esc(p.id)}">Envoyer</button></div></div>
    </article>`;
  }

  async function showReactions(id) {
    const box = $("reaction-" + id); if (!box) return;
    box.innerHTML = `<div class="reaction-picker-premium">${Object.entries(reactionMeta).map(([key,[label,icon]]) => `<button data-reaction="${key}" title="${esc(label)}"><span>${icon}</span><small>${esc(label)}</small></button>`).join("")}</div>`;
    box.querySelectorAll("[data-reaction]").forEach(b => b.addEventListener("click", () => setReaction(id, b.dataset.reaction), { once: true }));
  }
  async function setReaction(postId, reaction) {
    const { error } = await sb.rpc("tafa_set_post_reaction", { p_post_id: postId, p_reaction_type: reaction });
    if (error) return toast(error.message);
    const post = state.posts.find(x => x.id === postId);
    toast("Réaction enregistrée"); await loadPosts();
    if (state.route === "profile") await profilePage(state.profileTab);
  }
  async function addComment(postId, parentId = null) {
    const input = $(parentId ? "reply-input-" + parentId : "comment-" + postId);
    const text = input?.value.trim(); if (!text) return;
    const payload = { post_id: postId, user_id: state.user.id, content: text, parent_id: parentId || null };
    const { error } = await sb.from("comments").insert(payload);
    if (error) return toast(error.message);
    const post = state.posts.find(x => x.id === postId);
    input.value = ""; toast(parentId ? "Réponse publiée" : "Commentaire publié"); await loadPosts();
    if (state.route === "profile") await profilePage(state.profileTab);
  }
  async function sharePost(id) {
    const { error } = await sb.rpc("tafa_share_post", { p_post_id: id, p_share_message: "" });
    if (error) return toast(error.message);
    await logActivity("post_shared", "Publication partagée", "post", id);
    toast("Publication partagée"); await loadPosts();
    if (state.route === "profile") await profilePage(state.profileTab);
  }

  async function deleteComment(id) {
    const { error } = await sb.rpc("tafa_delete_comment", { p_comment_id: id });
    if (error) return toast(error.message);
    toast("Commentaire supprimé"); await loadPosts();
    if (state.route === "profile") await profilePage(state.profileTab);
  }
  async function editPost(id) {
    const p = state.posts.find(x => x.id === id) || (await sb.from("posts").select("*").eq("id",id).maybeSingle()).data;
    if (!p || p.user_id !== state.user.id) return toast("Vous ne pouvez modifier que vos publications.");
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">PUBLICATION</span><h3>Modifier la publication</h3><textarea id="editPostText" class="premium-textarea">${esc(p.content || "")}</textarea><button class="primary big" data-action="save-post-edit" data-id="${esc(id)}">Enregistrer</button></div>`);
  }
  async function savePostEdit(id) {
    const content = $("editPostText")?.value.trim() || "";
    const { error } = await sb.rpc("tafa_update_post", { p_post_id: id, p_content: content });
    if (error) return toast(error.message);
    closeModal(); toast("Publication modifiée"); await loadPosts();
    if (state.route === "profile") await profilePage(state.profileTab);
  }
  async function deletePost(id) {
    const { error } = await sb.rpc("tafa_delete_post", { p_post_id: id });
    if (error) return toast(error.message);
    closeModal(); toast("Publication supprimée"); await loadPosts();
    if (state.route === "profile") await profilePage(state.profileTab);
  }
  async function reportPost(id) {
    const { error } = await sb.rpc("tafa_report_post", { p_post_id: id, p_reason: "Contenu à vérifier" });
    if (error) return toast(error.message);
    closeModal(); toast("Signalement envoyé");
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

  async function friendsPage(tab = state.friendsTab) {
    state.friendsTab = tab || "suggestions";
    const token = state.renderToken;
    const { data: people, error } = await sb.from("profiles").select("*").neq("id", state.user.id).order("created_at", { ascending:false }).limit(100);
    if (token !== state.renderToken) return;
    if (error) return simplePage("Amis", `<div class="empty">${esc(error.message)}</div>`);

    const [incomingR, sentR, mineR] = await Promise.all([
      sb.from("friend_requests").select("sender_id,status").eq("receiver_id", state.user.id).eq("status", "pending"),
      sb.from("friend_requests").select("receiver_id,status").eq("sender_id", state.user.id).eq("status", "pending"),
      sb.from("friendships").select("friend_id").eq("user_id", state.user.id)
    ]);
    if (token !== state.renderToken) return;
    const incoming = new Set((incomingR.data || []).map(x => x.sender_id));
    const sent = new Set((sentR.data || []).map(x => x.receiver_id));
    const friendIds = new Set((mineR.data || []).map(x => x.friend_id));
    const map = new Map((people || []).map(p => [p.id, p]));
    const friends = [...friendIds].map(id => map.get(id)).filter(Boolean);
    const requests = [...incoming].map(id => map.get(id)).filter(Boolean);
    const suggestions = (people || []).filter(p => !friendIds.has(p.id) && !incoming.has(p.id) && !sent.has(p.id));

    // Calcul réel et sécurisé des amis en commun via une fonction SQL dédiée.
    const commonMap = new Map();
    if (people?.length) {
      const commonR = await sb.rpc("tafa_common_friend_counts", { p_user_ids: people.map(p => p.id) });
      (commonR.data || []).forEach(r => commonMap.set(r.user_id, Number(r.common_count || 0)));
    }
    const tabButton = (key, label, count) => `<button class="${state.friendsTab === key ? "active" : ""}" data-action="friends-tab" data-tab="${key}">${label}${count ? ` <span class="tab-count">${count}</span>` : ""}</button>`;
    const body = state.friendsTab === "friends"
      ? (friends.length ? friends.map(p => friendRow(p,"friend",commonMap.get(p.id)||0)).join("") : `<div class="empty">Vous n'avez pas encore d'amis.</div>`)
      : state.friendsTab === "requests"
        ? (requests.length ? requests.map(p => friendRow(p,"incoming",commonMap.get(p.id)||0)).join("") : `<div class="empty">Aucune demande en attente.</div>`)
        : (suggestions.length ? suggestions.map(p => friendRow(p,sent.has(p.id)?"sent":"add",commonMap.get(p.id)||0)).join("") : `<div class="empty">Aucune suggestion pour le moment.</div>`);
    const title = state.friendsTab === "friends" ? "Vos amis" : state.friendsTab === "requests" ? "Demandes reçues" : "Suggestions pour vous";
    $("content").innerHTML = `<section class="clean-page friends-page"><div class="page-header clean-page-header"><div><h2>Amis</h2><p class="page-kicker">Votre réseau, vos demandes et vos suggestions réelles</p></div><span class="count-label">${friends.length} amis</span></div><div class="friends-filter clean-filter">${tabButton("suggestions","Suggestions",suggestions.length)}${tabButton("friends","Amis",friends.length)}${tabButton("requests","Demandes",requests.length)}</div><div class="clean-section friends-section"><h3 class="menu-section-title">${title}</h3><div class="friends-list">${body}</div></div></section>`;
  }
  function friendRow(p,type,commonCount=0) {
    const common = commonCount > 0 ? `<small class="mutual-friends">${commonCount} ami${commonCount > 1 ? "s" : ""} en commun</small>` : "";
    const action = type === "friend" ? `<button class="ghost-action" data-action="view-profile" data-id="${esc(p.id)}">Profil</button>` : type === "sent" ? `<button class="ghost-action" disabled>Demande envoyée</button>` : type === "incoming" ? `<div class="friend-actions"><button class="small-action" data-action="accept-friend" data-id="${esc(p.id)}">Confirmer</button><button class="ghost-action" data-action="decline-friend" data-id="${esc(p.id)}">Refuser</button></div>` : `<button class="small-action" data-action="add-friend" data-id="${esc(p.id)}">Ajouter</button>`;
    return `<div class="list-row friend-row">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b>${common}</div>${action}</div>`;
  }
  async function addFriend(id) {
    if (!id || id === state.user.id) return;
    const settings = (await sb.from("user_settings").select("allow_friend_requests").eq("user_id", id).maybeSingle()).data;
    if (settings?.allow_friend_requests === false) return toast("Ce compte n’accepte pas les demandes d’ami.");
    const existing = await sb.from("friend_requests").select("id,status,sender_id,receiver_id").or(`and(sender_id.eq.${state.user.id},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${state.user.id})`).maybeSingle();
    if (existing.data?.status === "pending") return toast(existing.data.sender_id === state.user.id ? "Demande déjà envoyée." : "Cette personne vous a déjà envoyé une demande.");
    const { error } = await sb.from("friend_requests").upsert({ sender_id: state.user.id, receiver_id: id, status: "pending", updated_at: new Date().toISOString() }, { onConflict: "sender_id,receiver_id" });
    if (error) return toast(error.message);
    await logActivity("friend_request_sent", "Demande d’ami envoyée", "profile", id);
    toast("Invitation envoyée");
    if (state.route === "friends") await friendsPage();
    if (state.viewingProfileId === id) await openUserProfile(id);
  }
  async function handleFriend(id, status) {
    const { error } = await sb.from("friend_requests").update({ status }).eq("sender_id", id).eq("receiver_id", state.user.id).eq("status", "pending");
    if (error) return toast(error.message);
    if (status === "accepted") {
      await sb.from("friendships").upsert([{ user_id: state.user.id, friend_id: id }, { user_id: id, friend_id: state.user.id }], { onConflict: "user_id,friend_id" });
    }
    toast(status === "accepted" ? "Ami ajouté" : "Demande supprimée");
    if (state.route === "friends") await friendsPage();
  }

  let searchTimer = null;
  async function searchPage(q = "") {
    const token = state.renderToken;
    const term = q.trim();
    let people = [], posts = [], pages = [], groups = [];

    // A search screen must stay clean until the user actually searches.
    // Search history is intentionally kept in the dedicated History table.
    if (term) {
      const safe = term.replace(/[%_]/g, "");
      const [pr, por, pgr, gr] = await Promise.all([
        sb.from("profiles").select("*").or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,username.ilike.%${safe}%`).limit(30),
        sb.from("posts").select("*").or(`content.ilike.%${safe}%`).order("created_at", {ascending:false}).limit(30),
        sb.from("pages").select("*").or(`name.ilike.%${safe}%,category.ilike.%${safe}%,bio.ilike.%${safe}%`).limit(20),
        sb.from("groups").select("*").or(`name.ilike.%${safe}%,description.ilike.%${safe}%`).limit(20)
      ]);
      people=pr.data||[]; posts=por.data||[]; pages=pgr.data||[]; groups=gr.data||[];
      if (state.user && safe.length >= 2) {
        const recent=await sb.from("search_history").select("id").eq("user_id",state.user.id).eq("search_text",term).limit(1);
        if(!(recent.data||[]).length) await sb.from("search_history").insert({ user_id:state.user.id, search_text:term, result_type:"all" });
      }
      const ids=[...new Set(posts.map(x=>x.user_id).filter(Boolean))];
      const pp=ids.length ? await sb.from("profiles").select("*").in("id",ids) : {data:[]};
      const map=new Map((pp.data||[]).map(x=>[x.id,x]));
      posts=posts.map(x=>({...x,author:map.get(x.user_id)}));
    }
    if (token !== state.renderToken || state.route !== "search") return;

    const peopleHtml=people.length ? people.map(p=>`<div class="list-row search-result-row">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b></div><button class="small-action" data-action="view-profile" data-id="${esc(p.id)}">Voir le profil</button></div>`).join("") : `<div class="empty">Aucun compte trouvé.</div>`;
    const postHtml=posts.length ? posts.map(p=>`<div class="list-row search-result-row"><div class="grow"><b>${esc(nameOf(p.author||{}))}</b><small>${esc((p.content||"Publication sans texte").slice(0,140))}</small></div><button class="small-action" data-action="search-post" data-id="${esc(p.id)}">Voir</button></div>`).join("") : `<div class="empty">Aucune publication trouvée.</div>`;
    const pageHtml=pages.length ? pages.map(x=>`<div class="list-row search-result-row"><div class="entity-search-icon">▣</div><div class="grow"><b>${esc(x.name)}</b><small>${esc(x.category||"Page")} · ${esc(x.bio||"")}</small></div><button class="small-action" data-action="page-open" data-id="${esc(x.id)}">Ouvrir</button></div>`).join("") : `<div class="empty">Aucune Page trouvée.</div>`;
    const groupHtml=groups.length ? groups.map(x=>`<div class="list-row search-result-row"><div class="entity-search-icon">◎</div><div class="grow"><b>${esc(x.name)}</b><small>${esc(x.privacy||"public")} · ${esc(x.description||"")}</small></div><button class="small-action" data-action="group-open" data-id="${esc(x.id)}">Ouvrir</button></div>`).join("") : `<div class="empty">Aucun groupe trouvé.</div>`;

    const results = term ? `
      <div class="clean-section search-results-section"><h3 class="menu-section-title">Comptes</h3><div class="clean-list" id="searchPeople">${peopleHtml}</div></div>
      <div class="clean-section search-results-section"><h3 class="menu-section-title">Publications</h3><div class="clean-list" id="searchPosts">${postHtml}</div></div>
      <div class="clean-section search-results-section"><h3 class="menu-section-title">Pages</h3><div class="clean-list" id="searchPages">${pageHtml}</div></div>
      <div class="clean-section search-results-section"><h3 class="menu-section-title">Groupes</h3><div class="clean-list" id="searchGroups">${groupHtml}</div></div>` : `
      <div class="search-idle-card">
        <div class="search-idle-icon">⌕</div>
        <h3>Commencez une recherche</h3>
        <p>Saisissez un nom, une publication, une Page ou un groupe. Les résultats apparaîtront uniquement après votre recherche.</p>
        <button class="ghost-action" data-action="menu-service" data-service="activity" data-name="Historique de recherche">Voir l’historique</button>
      </div>`;

    $("content").innerHTML = `<section class="clean-page search-page-premium"><div class="page-header clean-page-header"><div><h2>Rechercher</h2><p class="page-kicker">Recherche avancée Tafaß</p></div></div><div class="clean-search searchbox premium-searchbox"><span class="icon">⌕</span><input id="searchInput" value="${esc(term)}" placeholder="Nom, prénom, publication, Page ou groupe…" autocomplete="off"></div>${results}</section>`;
    $("searchInput")?.addEventListener("input", e=>{ clearTimeout(searchTimer); searchTimer=setTimeout(()=>searchPage(e.target.value),320); });
  }

  async function messagesPage() {
    const token = state.renderToken;
    const { data: memberships, error } = await sb.from("conversation_members")
      .select("conversation_id")
      .eq("user_id", state.user.id);

    if (token !== state.renderToken || state.route !== "messages") return;
    if (error) return simplePage("Messages", `<div class="empty">${esc(error.message)}</div>`);

    const ids = [...new Set((memberships || []).map(x => x.conversation_id))];
    let conversations = [];
    if (ids.length) {
      const r = await sb.from("conversations").select("*")
        .in("id", ids).order("created_at", { ascending: false });
      conversations = r.data || [];
    }

    const cards = [];
    for (const c of conversations) {
      const { data: cm } = await sb.from("conversation_members")
        .select("user_id").eq("conversation_id", c.id);
      const otherIds = [...new Set((cm || []).map(x => x.user_id).filter(id => id !== state.user.id))];
      let person = null;
      if (otherIds.length) {
        const r = await sb.from("profiles").select("*").eq("id", otherIds[0]).maybeSingle();
        person = r.data || null;
      }
      const { data: last } = await sb.from("messages").select("content,created_at")
        .eq("conversation_id", c.id).order("created_at", { ascending:false }).limit(1);
      cards.push(`<button class="list-row message-conversation" style="width:100%;text-align:left"
        data-action="open-conversation" data-id="${esc(c.id)}">
        ${avatarHTML(person || state.profile)}
        <div class="grow"><b>${esc(c.name || (person ? nameOf(person) : "Conversation"))}</b>
        <small>${esc(last?.[0]?.content || "Ouvrir la conversation")} · ${last?.[0] ? timeAgo(last[0].created_at) : ""}</small></div><small>›</small>
      </button>`);
    }

    if (token !== state.renderToken) return;
    $("content").innerHTML = `<section class="clean-page messages-page">
      <div class="page-header clean-page-header"><div><h2>Messages</h2><p class="page-kicker">Vos conversations, simplement et en temps réel</p></div><button class="round-button clean-new-button" data-action="new-message" aria-label="Nouvelle conversation">＋</button></div>
      <div class="clean-search searchbox"><span class="icon">⌕</span><input id="messageSearch" placeholder="Rechercher une conversation"></div>
      <div id="conversationList" class="clean-list">${cards.join("") || `<div class="empty">Aucune conversation.<br><button class="text-button" data-action="new-message">Commencer une discussion</button></div>`}</div>
    </section>`;

    $("messageSearch")?.addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll(".message-conversation").forEach(row => {
        row.classList.toggle("hidden", q && !row.textContent.toLowerCase().includes(q));
      });
    });
  }

  async function newMessage() {
    const { data: people } = await sb.from("profiles").select("*").neq("id", state.user.id).limit(20);
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>Nouvelle conversation</h3><div>${(people||[]).map(p=>`<button class="list-row" style="width:100%;text-align:left" data-action="start-conversation" data-id="${esc(p.id)}">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b></div><span>›</span></button>`).join("")}</div></div>`);
  }
  async function startConversation(otherId) {
    if(!otherId || otherId===state.user.id)return;
    const cfg=(await sb.from("user_settings").select("allow_messages").eq("user_id",otherId).maybeSingle()).data;
    if(cfg?.allow_messages===false)return toast("Ce compte n’accepte pas les messages.");
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
    const token = state.renderToken;
    state.selectedConversation = id;
    if (state.route !== "messages") {
      if (state.navStack[state.navStack.length - 1] !== "messages") state.navStack.push("messages");
      state.route = "messages"; history.replaceState(null, "", "#messages"); document.querySelectorAll("[data-route]").forEach(el => el.classList.toggle("active", el.dataset.route === "messages"));
    }
    const { data: memberCheck } = await sb.from("conversation_members").select("user_id").eq("conversation_id", id).eq("user_id", state.user.id).maybeSingle();
    if (!memberCheck) return toast("Conversation inaccessible.");
    const { data: msgs } = await sb.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }).limit(200);
    await sb.rpc("tafa_mark_conversation_read", { p_conversation_id:id });
    const ids = [...new Set((msgs || []).map(m => m.sender_id))];
    const { data: profiles } = ids.length ? await sb.from("profiles").select("*").in("id", ids) : { data: [] };
    if (token !== state.renderToken) return;
    const map = new Map((profiles || []).map(p => [p.id, p]));
    const otherId = (await sb.from("conversation_members").select("user_id").eq("conversation_id", id).neq("user_id", state.user.id).maybeSingle()).data?.user_id;
    const otherProfile = otherId ? (await sb.from("profiles").select("*").eq("id", otherId).maybeSingle()).data : null;
    $("content").innerHTML = `<section class="clean-page messages-page conversation-page"><div class="page-header clean-page-header"><button class="page-back" data-action="page-back" type="button"><span aria-hidden="true">‹</span><small>Messages</small></button><div class="conversation-title">${avatarHTML(otherProfile || state.profile,"avatar conversation-avatar")}<h2>${esc(otherProfile ? nameOf(otherProfile) : "Discussion")}</h2></div><span></span></div><div class="message-list clean-message-list">${(msgs||[]).map(m=>`<div class="message ${m.sender_id===state.user.id?"mine":""}"><div>${esc(m.content)}</div><small>${timeAgo(m.created_at)}</small></div>`).join("")||`<div class="empty">Dites bonjour 👋</div>`}</div><form id="messageForm" class="comment-form clean-message-form"><input id="messageText" placeholder="Écrire un message..." required><button>Envoyer</button></form></section>`;
    $("messageForm").addEventListener("submit", async e => { e.preventDefault(); const text=$("messageText").value.trim(); if(!text)return; const r=await sb.from("messages").insert({conversation_id:id,sender_id:state.user.id,content:text,is_read:false}); if(r.error)toast(r.error.message); else {$("messageText").value=""; await openConversation(id);} });
  }

  async function notificationsPage() {
    const token = state.renderToken;
    const { data, error } = await sb.from("notifications").select("*").eq("user_id", state.user.id).order("created_at", { ascending:false }).limit(100);
    if (token !== state.renderToken || state.route !== "notifications") return;
    if (error) return simplePage("Alertes", `<div class="empty">${esc(error.message)}</div>`);
    const actorIds = [...new Set((data || []).map(n => n.actor_id).filter(Boolean))];
    const { data: actors } = actorIds.length ? await sb.from("profiles").select("*").in("id", actorIds) : { data: [] };
    const amap = new Map((actors || []).map(p => [p.id,p]));
    if (token !== state.renderToken) return;
    $("content").innerHTML = `<section class="clean-page alerts-page"><div class="page-header clean-page-header"><div><h2>Alertes</h2><p class="page-kicker">Les activités réelles de votre compte, en temps réel</p></div><button class="text-button clean-read-button" data-action="mark-read">Tout lire</button></div>
      <div class="clean-list">${(data || []).map(n => {
        const actor = amap.get(n.actor_id);
        const target = notificationTarget(n, actor);
        const actionAttrs = target ? `data-action="${esc(target.action)}" data-id="${esc(target.id || "")}"` : `data-action="notification-read" data-id="${esc(n.id)}"`;
        const actorName = actor ? nameOf(actor) : "Un membre";
        return `<button class="list-row notification-row ${n.is_read ? "" : "unread"}" ${actionAttrs} data-notification="${esc(n.id)}">${avatarHTML(actor || null)}<div class="grow"><b>${esc(actorName)}</b><small>${esc(notificationAction(n))} · ${timeAgo(n.created_at)}</small></div>${n.is_read ? "" : '<span class="blue-dot"></span>'}<span class="notification-arrow">›</span></button>`;
      }).join("") || `<div class="empty">Aucune alerte pour le moment.</div>`}</div></section>`;
  }

  async function openNotificationPost(notificationId) {
    const n = (await sb.from("notifications").select("*").eq("id", notificationId).maybeSingle()).data;
    if (!n) return toast("Alerte introuvable");
    await sb.from("notifications").update({is_read:true}).eq("id",notificationId).eq("user_id",state.user.id);
    const postId=n.post_id || n.entity_id;
    if (!postId) return notificationsPage();
    const p=(await sb.from("posts").select("*").eq("id",postId).maybeSingle()).data;
    if(!p) return toast("Publication introuvable");
    const author=(await sb.from("profiles").select("*").eq("id",p.user_id).maybeSingle()).data || state.profile;
    return openModal(`<div class="modal-box post-preview-modal"><button class="modal-close" data-action="close-modal">×</button>${await postHTML({...p,author})}</div>`);
  }
  async function notificationRead(id) {
    await sb.from("notifications").update({is_read:true}).eq("id",id).eq("user_id",state.user.id);
    await notificationsPage(); updateBadges();
  }

  async function markRead() {
    const { error } = await sb.from("notifications").update({ is_read: true })
      .eq("user_id", state.user.id).eq("is_read", false);
    if (error) return toast(error.message);
    toast("Alertes lues");
    await notificationsPage();
    updateBadges();
  }

  async function updateBadges() {
    const n = await sb.from("notifications").select("id", { count:"exact", head:true })
      .eq("user_id", state.user.id).eq("is_read", false);
    const m = await sb.from("messages").select("id", { count:"exact", head:true }).neq("sender_id", state.user.id).eq("is_read", false);
    const mb = $("msgBadge"); if (mb) { mb.textContent=String(m.count||0); mb.classList.toggle("hidden", !(m.count||0)); }
    const el = $("notifBadge");
    if (el) {
      el.textContent = String(n.count || 0);
      el.classList.toggle("hidden", !n.count);
    }
  }

  async function openUserProfile(userId) {
    if (!userId || !state.user) return;
    state.viewingProfileId = userId;
    state.route = "profile";
    history.replaceState(null, "", "#profile");
    document.querySelectorAll("[data-route]").forEach(el => el.classList.toggle("active", el.dataset.route === "profile"));
    state.profileTab = "posts";
    state.renderToken++;
    const token = state.renderToken;
    const { data: p, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error || !p || token !== state.renderToken) {
      if (token !== state.renderToken) return;
      $("content").innerHTML = `<section class="profile-unavailable premium-unavailable" data-page-route="profile">
      <div class="profile-unavailable-icon"><span>◌</span></div>
      <span class="eyebrow">TAFAß • PROFIL</span>
      <h2>Profil indisponible</h2>
      <p>Ce profil n’est pas accessible actuellement. Il peut avoir été supprimé, désactivé, bloqué ou rendu privé.</p>
      <div class="unavailable-actions"><button class="primary" data-route="friends">Retour aux amis</button><button class="ghost-action" data-route="search">Rechercher un autre compte</button></div>
    </section>`;
      return;
    }
    if (userId !== state.user.id) {
      const cfg=(await sb.from("user_settings").select("profile_visibility").eq("user_id",userId).maybeSingle()).data;
      const visibility=cfg?.profile_visibility || "public";
      if (visibility === "private") {
        return $("content").innerHTML = `<section class="profile-unavailable premium-unavailable" data-page-route="profile"><div class="profile-unavailable-icon"><span>⌁</span></div><span class="eyebrow">TAFAß • CONFIDENTIALITÉ</span><h2>Profil indisponible</h2><p>Ce profil est privé. Vous ne pouvez pas consulter son contenu.</p><div class="unavailable-actions"><button class="primary" data-route="friends">Retour</button></div></section>`;
      }
      if (visibility === "friends") {
        const fr=(await sb.from("friendships").select("id").eq("user_id",state.user.id).eq("friend_id",userId).maybeSingle()).data;
        if(!fr) return $("content").innerHTML = `<section class="profile-unavailable premium-unavailable" data-page-route="profile"><div class="profile-unavailable-icon"><span>⌁</span></div><span class="eyebrow">TAFAß • CONFIDENTIALITÉ</span><h2>Profil indisponible</h2><p>Ce profil est réservé aux amis.</p><div class="unavailable-actions"><button class="primary" data-route="friends">Voir mes amis</button></div></section>`;
      }
    }

    const { data: mine } = await sb.from("posts").select("*").eq("user_id", userId).order("created_at", { ascending:false }).limit(100);
    const postRows = mine || [];
    const friendsR = await sb.from("friendships").select("id", { count:"exact", head:true }).eq("user_id", userId);
    const followersR = await sb.from("follows").select("id", { count:"exact", head:true }).eq("following_id", userId);
    const cover = p.cover_url ? `style="background-image:url('${esc(p.cover_url)}')"` : "";
    const isMe = userId === state.user.id;
    const [friendR, sentR, receivedR] = isMe ? [{data:null},{data:null},{data:null}] : await Promise.all([
      sb.from("friendships").select("id").eq("user_id",state.user.id).eq("friend_id",userId).maybeSingle(),
      sb.from("friend_requests").select("id,status").eq("sender_id",state.user.id).eq("receiver_id",userId).eq("status","pending").maybeSingle(),
      sb.from("friend_requests").select("id,status").eq("sender_id",userId).eq("receiver_id",state.user.id).eq("status","pending").maybeSingle()
    ]);
    const relationAction = isMe ? `<div class="profile-action-slot profile-action-left"><button class="primary" data-action="edit-profile">Modifier le profil</button></div>` : friendR.data ? `<div class="profile-action-slot profile-action-left"><button class="ghost-action" data-action="remove-friend" data-id="${esc(userId)}">Retirer des amis</button></div>` : receivedR.data ? `<div class="profile-action-slot profile-action-left"><button class="small-action" data-action="accept-friend" data-id="${esc(userId)}">Confirmer</button><button class="ghost-action" data-action="decline-friend" data-id="${esc(userId)}">Refuser</button></div>` : sentR.data ? `<div class="profile-action-slot profile-action-left"><button class="ghost-action" disabled>Demande envoyée</button></div>` : `<div class="profile-action-slot profile-action-left"><button class="primary" data-action="add-friend" data-id="${esc(userId)}">Ajouter</button></div>`;
    const actions = isMe ? relationAction : `${relationAction}<div class="profile-action-slot profile-action-center"><button class="ghost-action" data-action="message-user" data-id="${esc(userId)}">Messages</button></div><div class="profile-action-slot profile-action-right"><button class="round-button profile-more-button" data-action="profile-more" data-id="${esc(userId)}" aria-label="Plus d'options"><span aria-hidden="true">⋯</span></button></div>`;

    let body = "";
    for (const post of postRows) {
      body += await postHTML({ ...post, author:p });
    }
    if (!body) body = `<div class="empty profile-empty">Aucune publication pour le moment.</div>`;

    if (token !== state.renderToken) return;
    $("content").innerHTML = `<section class="profile-page-premium public-profile-page" data-page-route="profile">
      <div class="profile-cover-wrap"><div class="profile-cover" ${cover}></div></div>
      <div class="profile-main-premium">
        <div class="profile-identity-row">
          ${avatarHTML(p,"avatar profile-avatar")}
        </div>
        <div class="profile-name-block"><h2 class="profile-name">${esc(nameOf(p))}</h2></div>
        <p class="profile-bio">${esc(p.bio || "")}</p>
        <div class="profile-actions">${actions}</div>
        <div class="profile-stats"><div class="profile-stat"><b>${postRows.length}</b><small>Publications</small></div><div class="profile-stat"><b>${friendsR.count || 0}</b><small>Amis</small></div><div class="profile-stat"><b>${followersR.count || 0}</b><small>Abonnés</small></div></div>
        <div class="profile-info profile-info-v23"><div class="profile-info-title-v23">Lieu</div>${p.country ? `<div>🌍 Pays : ${esc(p.country)}</div>` : ""}${p.city_current ? `<div>⌖ Ville actuelle : ${esc(p.city_current)}</div>` : ""}${p.city_origin ? `<div>⌂ Ville d’origine : ${esc(p.city_origin)}</div>` : ""}${p.created_at ? `<div class="profile-member-v23">◷ Membre depuis ${new Date(p.created_at).toLocaleDateString("fr-FR", {month:"long", year:"numeric"})}</div>` : ""}</div>
        <div class="profile-tabs">
          ${[["posts","Publications"],["photos","Photos"],["videos","Vidéos"],["friends","Amis"]].map(([k,v])=>`<button class="${k==="posts"?"active":""}" data-action="public-profile-tab" data-id="${esc(userId)}" data-tab="${k}">${v}</button>`).join("")}
        </div>
        <section class="profile-content-section profile-publications-section">${body}</section>
      </div>
    </section>`;
  }

  async function openUserProfileTab(userId, tab="posts") {
    if (!userId) return;
    const { data:p }=await sb.from("profiles").select("*").eq("id",userId).maybeSingle();
    if(!p) return openUserProfile(userId);
    const { data:posts }=await sb.from("posts").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(100);
    const rows=(posts||[]).map(x=>({...x,author:p}));
    let body="";
    if(tab==="photos"){
      body=`<div class="photo-grid">${rows.filter(x=>x.media_type==="image"&&x.media_url).map(x=>`<img src="${esc(x.media_url)}" alt="Photo publiée" loading="lazy">`).join("")||`<div class="empty profile-empty">Aucune photo publiée.</div>`}</div>`;
    } else if(tab==="videos"){
      body=rows.filter(x=>["video","reel"].includes(x.media_type)).map(x=>`<article class="profile-publication"><p>${esc(x.content||"")}</p><video class="post-media" src="${esc(x.media_url)}" controls preload="metadata"></video></article>`).join("")||`<div class="empty profile-empty">Aucune vidéo publiée.</div>`;
    } else if(tab==="friends"){
      body=`<div class="profile-network-section"><p>Consultez les relations publiques de ce membre.</p><button class="primary big" data-route="friends">Ouvrir Amis</button></div>`;
    } else {
      for(const x of rows) body+=await postHTML(x);
      if(!body) body=`<div class="empty profile-empty">Aucune publication pour le moment.</div>`;
    }
    const root=document.querySelector(".public-profile-page .profile-publications-section");
    const nav=document.querySelector(".public-profile-page .profile-tabs");
    if(root) root.innerHTML=body;
    if(nav) nav.innerHTML=[["posts","Publications"],["photos","Photos"],["videos","Vidéos"],["friends","Amis"]].map(([k,v])=>`<button class="${tab===k?"active":""}" data-action="public-profile-tab" data-id="${esc(userId)}" data-tab="${k}">${v}</button>`).join("");
  }

  async function openPrivacySettings() {
    const cfg=(await sb.from("user_settings").select("*").eq("user_id",state.user.id).maybeSingle()).data||{};
    return openModal(`<div class="modal-box settings-modal privacy-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • CONFIDENTIALITÉ</span><h3>Confidentialité du profil</h3><p class="muted">Choisissez qui peut accéder à votre profil et comment les autres membres peuvent vous contacter.</p><label>Visibilité<select id="privacyVisibility"><option value="public" ${cfg.profile_visibility!=="friends"&&cfg.profile_visibility!=="private"?"selected":""}>Public</option><option value="friends" ${cfg.profile_visibility==="friends"?"selected":""}>Amis uniquement</option><option value="private" ${cfg.profile_visibility==="private"?"selected":""}>Privé</option></select></label><button class="primary big" data-action="save-privacy">Enregistrer</button></div>`);
  }

  async function removeFriend(id) {
    const r1=await sb.from("friendships").delete().eq("user_id",state.user.id).eq("friend_id",id);
    const r2=await sb.from("friendships").delete().eq("user_id",id).eq("friend_id",state.user.id);
    if(r1.error&&r2.error)return toast(r1.error.message);
    await logActivity("friend_removed","Ami retiré","profile",id); toast("Ami retiré");
    if(state.route==="friends") await friendsPage();
    if(state.viewingProfileId===id) await openUserProfile(id);
  }
  async function profileMore(id) {
    if(!id || id===state.user.id)return;
    const blocked=(await sb.from("blocked_profiles").select("id").eq("blocker_id",state.user.id).eq("blocked_id",id).maybeSingle()).data;
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">COMPTE</span><h3>Options du profil</h3><div class="menu-grid"><button class="menu-card" data-action="report-profile" data-id="${esc(id)}"><span class="menu-icon">⚑</span><span><b>Signaler le compte</b><small>Signaler un comportement ou un contenu</small></span></button><button class="menu-card ${blocked?"":"danger-card"}" data-action="${blocked?"unblock-profile":"block-profile"}" data-id="${esc(id)}"><span class="menu-icon">${blocked?"✓":"⊘"}</span><span><b>${blocked?"Débloquer le compte":"Bloquer le compte"}</b><small>${blocked?"Autoriser à nouveau les interactions":"Empêcher les interactions avec ce compte"}</small></span></button></div></div>`);
  }
  async function reportProfile(id) {
    const reason=prompt("Pourquoi souhaitez-vous signaler ce compte ?", "Comportement ou contenu inapproprié");
    if(reason===null)return;
    const r=await sb.from("profile_reports").upsert({reporter_id:state.user.id,reported_id:id,reason:reason.trim()||"Contenu à vérifier",status:"pending"},{onConflict:"reporter_id,reported_id"});
    if(r.error)return toast(r.error.message); closeModal(); toast("Signalement envoyé"); await logActivity("profile_reported","Compte signalé","profile",id);
  }
  async function blockProfile(id) {
    const r=await sb.from("blocked_profiles").upsert({blocker_id:state.user.id,blocked_id:id},{onConflict:"blocker_id,blocked_id"});
    if(r.error)return toast(r.error.message); closeModal(); toast("Compte bloqué"); await logActivity("profile_blocked","Compte bloqué","profile",id);
  }
  async function unblockProfile(id) {
    const r=await sb.from("blocked_profiles").delete().eq("blocker_id",state.user.id).eq("blocked_id",id);
    if(r.error)return toast(r.error.message); closeModal(); toast("Compte débloqué");
  }

  async function profilePage(tab = state.profileTab) {
    const token = state.renderToken;
    state.profileTab = ["posts","photos","friends"].includes(tab) ? tab : "posts";
    tab = state.profileTab;
    const p = state.profile || {};
    const mine = await loadMyPosts();
    const photos = mine.filter(x => x.media_url && x.media_type === "image");
    const cover = p.cover_url ? `style="background-image:url('${esc(p.cover_url)}')"` : "";
    const [friendsCountR, followersCountR] = await Promise.all([
      sb.from("friendships").select("id", { count:"exact", head:true }).eq("user_id", state.user.id),
      sb.from("follows").select("id", { count:"exact", head:true }).eq("following_id", state.user.id)
    ]);
    const friendsCount = friendsCountR.count || 0, followersCount = followersCountR.count || 0;
    if (token !== state.renderToken || state.route !== "profile") return;

    let tabBody = "";
    if (tab === "photos") {
      tabBody = `<section class="profile-content-section"><div class="photo-grid">${photos.map(x => `<img src="${esc(x.media_url)}" alt="Photo publiée" loading="lazy">`).join("") || `<div class="empty profile-empty">Aucune photo publiée.</div>`}</div></section>`;
    } else if (tab === "videos") {
      const videos = mine.filter(x => x.media_type === "video" || x.media_type === "reel");
      tabBody = `<section class="profile-content-section"><div class="profile-video-list">${videos.map(x => `<article class="profile-publication"><div class="profile-publication-head">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b><small>${timeAgo(x.created_at)} · ${x.media_type === "reel" ? "Reel" : "Vidéo"}</small></div></div>${x.content ? `<p>${esc(x.content)}</p>` : ""}<video class="post-media" src="${esc(x.media_url)}" controls preload="metadata"></video></article>`).join("") || `<div class="empty profile-empty">Aucune vidéo publiée.</div>`}</div></section>`;
    } else if (tab === "friends") {
      tabBody = `<section class="profile-content-section profile-network-section"><div class="profile-network-stat"><b>${friendsCount}</b><span>amis</span></div><p>Votre réseau Tafaß et vos relations réelles.</p><button class="primary big" data-route="friends">Voir mes amis</button></section>`;
    } else {
      const renderedMine = [];
      for (const x of mine) renderedMine.push(await postHTML(x));
      tabBody = `<section class="profile-content-section profile-publications-section">${renderedMine.length ? renderedMine.join("") : `<div class="empty profile-empty">Aucune publication pour le moment.</div>`}</section>`;
    }

    $("content").innerHTML = `<section class="profile-page-premium">
      <div class="profile-cover-wrap"><div class="profile-cover" ${cover}></div></div>
      <div class="profile-main-premium">
        <div class="profile-identity-row">${avatarHTML(p,"avatar profile-avatar")}</div>
        <div class="profile-name-block"><h2 class="profile-name">${esc(nameOf(p))}</h2></div>
        <p class="profile-bio">${esc(p.bio || "")}</p>
        <div class="profile-actions"><button class="primary" data-action="edit-profile">Modifier le profil</button></div>
        <div class="profile-stats"><div class="profile-stat"><b>${mine.length}</b><small>Publications</small></div><div class="profile-stat"><b>${friendsCount}</b><small>Amis</small></div><div class="profile-stat"><b>${followersCount}</b><small>Abonnés</small></div></div>
        <div class="profile-info profile-info-v23"><div class="profile-info-title-v23">Lieu</div>${p.country ? `<div>🌍 Pays : ${esc(p.country)}</div>` : ""}${p.city_current ? `<div>⌖ Ville actuelle : ${esc(p.city_current)}</div>` : ""}${p.city_origin ? `<div>⌂ Ville d’origine : ${esc(p.city_origin)}</div>` : ""}${p.created_at ? `<div class="profile-member-v23">◷ Membre depuis ${new Date(p.created_at).toLocaleDateString("fr-FR", {month:"long", year:"numeric"})}</div>` : ""}</div>
        <div class="profile-tabs">${[["posts","Publications"],["photos","Photos"],["friends","Amis"]].map(([k,v])=>`<button class="${tab===k?"active":""}" data-action="profile-tab" data-tab="${k}">${v}</button>`).join("")}</div>
      </div>${tabBody}
    </section>`;
  }

  function editProfile() {
    const p=state.profile||{};
    openModal(`<div class="modal-box profile-redesign-v5">
      <header class="redesign-modal-header">
        <button class="modal-back-v5" data-action="close-modal" aria-label="Retour"><span>‹</span><small>Retour</small></button>
        <div class="redesign-heading"><span class="brand-kicker"><img src="assets/tafass-logo-premium.svg" alt="Tafaß"> <span>TAFAß · PROFIL</span></span><h3>Modifier le profil</h3><p>Personnalisez votre présence publique avec une présentation claire et élégante.</p></div>
      </header>
      <div class="profile-redesign-body">
        <section class="profile-visual-card-v5">
          <label class="profile-cover-v5" id="editorCoverPreview" style="${p.cover_url?`background-image:url('${esc(p.cover_url)}')`:''}">
            <span class="cover-fallback-v5"><b>Votre couverture</b><small>Ajoutez une image qui vous représente</small></span>
            <span class="cover-edit-v5">📷 <b>Modifier</b></span>
            <input id="pfCover" type="file" accept="image/jpeg,image/png,image/webp" hidden>
          </label>
          <label class="profile-avatar-wrap-v5" id="editorAvatarPreview">
            ${avatarHTML(p,"avatar editor-avatar-image-v3")}
            <span class="avatar-edit-v5">📷</span>
            <input id="pfAvatar" type="file" accept="image/jpeg,image/png,image/webp" hidden>
          </label>
          <div class="profile-visual-meta-v5"><div><b>${esc(nameOf(p))}</b><small>Profil public Tafaß</small></div><span>PHOTO & COUVERTURE</span></div>
        </section>

        <section class="redesign-section-v5">
          <div class="redesign-section-head-v5"><span class="section-icon-v5">Aa</span><div><b>Présentation</b><small>Ce que les autres voient sur votre profil</small></div></div>
          <div class="redesign-field-v5 wide"><label><span>Bio</span><textarea id="pfBio" maxlength="500" placeholder="Présentez-vous en quelques mots…">${esc(p.bio||'')}</textarea><small class="field-counter-v5">Maximum 500 caractères</small></label></div>
        </section>

        <section class="redesign-section-v5">
          <div class="redesign-section-head-v5"><span class="section-icon-v5">⌖</span><div><b>Lieu</b><small>Ajoutez des informations de localisation publiques</small></div></div>
          <div class="redesign-field-v5"><label><span>Pays</span><input value="Madagascar" readonly disabled></label></div>
          <div class="redesign-field-v5 wide place-field-v5"><label><span>Ville actuelle / Lieu</span><div class="place-search-wrap-v4"><input id="pfCityCurrent" value="${esc(p.city_current||'')}" placeholder="Rechercher un lieu réel…" autocomplete="off" data-place-valid="${p.city_current?'true':'false'}"><div id="pfCityCurrentResults" class="place-results-v4"></div></div><small>Sélectionnez un lieu réel à Madagascar.</small></label></div>
          <div class="redesign-field-v5 wide place-field-v5"><label><span>Ville d'origine</span><div class="place-search-wrap-v4"><input id="pfCityOrigin" value="${esc(p.city_origin||'')}" placeholder="Rechercher une ville réelle…" autocomplete="off" data-place-valid="${p.city_origin?'true':'false'}"><div id="pfCityOriginResults" class="place-results-v4"></div></div><small>La ville d'origine peut rester vide.</small></label></div>
        </section>
      </div>
      <footer class="redesign-modal-footer-v5"><button class="ghost-action" data-action="close-modal">Annuler</button><button class="primary big profile-save-button" data-action="save-profile"><span>✓</span> Enregistrer les modifications</button></footer>
    </div>`);
    installPlaceSearch("pfCityCurrent","pfCityCurrentResults");
    installPlaceSearch("pfCityOrigin","pfCityOriginResults");
    $("pfAvatar")?.addEventListener("change", e => { const file=e.target.files?.[0]; if(!file)return; if(!file.type.startsWith("image/"))return toast("Choisissez une image."); const img=document.createElement("img"); img.src=URL.createObjectURL(file); img.className="avatar editor-avatar-image-v3-img"; img.alt="Avatar"; const old=$("editorAvatarPreview")?.querySelector(".avatar"); if(old) old.replaceWith(img); });
    $("pfCover")?.addEventListener("change", e => { const file=e.target.files?.[0]; if(!file)return; if(!file.type.startsWith("image/"))return toast("Choisissez une image."); $("editorCoverPreview").style.backgroundImage=`url("${URL.createObjectURL(file)}")`; });
  }

  function accountSettings() {
    const p=state.profile||{}, authEmail=state.user?.email||p.email||'';
    const changed=p.name_changed_at?new Date(p.name_changed_at):null, next=changed?new Date(changed.getTime()+15*86400000):null, locked=next&&next.getTime()>Date.now();
    openModal(`<div class="modal-box account-redesign-v5">
      <header class="redesign-modal-header account-header-v5">
        <button class="modal-back-v5" data-action="close-modal" aria-label="Retour"><span>‹</span><small>Retour</small></button>
        <div class="redesign-heading"><span class="brand-kicker"><img src="assets/tafass-logo-premium.svg" alt="Tafaß"> <span>TAFAß · COMPTE</span></span><h3>Informations du compte</h3><p>Gérez vos informations privées et vos coordonnées de connexion dans un espace sécurisé.</p></div>
      </header>
      <div class="account-redesign-body-v5">
        <div class="account-identity-banner-v5"><span class="account-mark-v5">${esc((p.first_name||'T').slice(0,1).toUpperCase())}</span><div><b>${esc(nameOf(p))}</b><small>Informations privées · non visibles sur le profil public</small></div><span class="secure-pill-v5">● Sécurisé</span></div>
        <section class="redesign-section-v5 account-section-v5">
          <div class="redesign-section-head-v5"><span class="section-icon-v5">ID</span><div><b>Identité</b><small>Nom et prénom associés à votre compte</small></div></div>
          <div class="redesign-grid-v5 two">
            <div class="redesign-field-v5"><label><span>Prénom</span><input id="asFirst" value="${esc(p.first_name||'')}" ${locked?'disabled':''} autocomplete="given-name"></label></div>
            <div class="redesign-field-v5"><label><span>Nom</span><input id="asLast" value="${esc(p.last_name||'')}" ${locked?'disabled':''} autocomplete="family-name"></label></div>
          </div>
          <div class="account-note-v5">${locked?`🔒 Nom et prénom verrouillés jusqu’au ${next.toLocaleDateString('fr-FR')}.`:'✓ Votre nom et prénom peuvent être modifiés une fois tous les 15 jours.'}</div>
        </section>
        <section class="redesign-section-v5 account-section-v5">
          <div class="redesign-section-head-v5"><span class="section-icon-v5">@</span><div><b>Coordonnées</b><small>Utilisées pour vous connecter et récupérer votre compte</small></div></div>
          <div class="redesign-field-v5 wide"><label><span>E-mail</span><input id="asEmail" value="${esc(authEmail)}" type="email" autocomplete="email"></label></div>
          <div class="redesign-field-v5 wide"><label><span>Numéro de téléphone</span><div class="phone-field-v5"><span>${esc(phoneMeta().code)}</span><input id="asPhone" value="${esc(normalizePhone(p.phone||"",phoneMeta()))}" type="tel" inputmode="numeric" maxlength="${phoneMeta().digits}" placeholder="${phoneMeta().placeholder}" autocomplete="tel-national"></div><small>Pays détecté automatiquement : ${esc(phoneMeta().name)} · Entrez uniquement le numéro national.</small></label></div>
        </section>
        <section class="redesign-section-v5 account-section-v5">
          <div class="redesign-section-head-v5"><span class="section-icon-v5">••</span><div><b>Informations personnelles</b><small>Ces données restent liées à votre compte</small></div></div>
          <div class="redesign-grid-v5 two">
            <div class="redesign-field-v5"><label><span>Date de naissance</span><input id="asBirth" value="${esc(p.birth||'')}" type="date"></label></div>
            <div class="redesign-field-v5"><label><span>Genre</span><select id="asGender"><option value="">Choisir</option><option value="Homme" ${p.gender==='Homme'?'selected':''}>Homme</option><option value="Femme" ${p.gender==='Femme'?'selected':''}>Femme</option><option value="Autre" ${p.gender==='Autre'?'selected':''}>Autre</option></select></label></div>
          </div>
        </section>
      </div>
      <footer class="redesign-modal-footer-v5"><button class="ghost-action" data-action="close-modal">Annuler</button><button class="primary big" data-action="save-account-settings"><span>✓</span> Enregistrer</button></footer>
    </div>`);
  }

  async function saveAccountSettings() {
    const p=state.profile||{}, first=$("asFirst")?.value.trim()||'', last=$("asLast")?.value.trim()||'', oldFirst=String(p.first_name||'').trim(), oldLast=String(p.last_name||'').trim();
    const changed=first!==oldFirst||last!==oldLast;
    if(changed&&p.name_changed_at&&Date.now()<new Date(p.name_changed_at).getTime()+15*86400000) return toast('Le nom et le prénom sont encore verrouillés.');
    const birth=$("asBirth")?.value||null, gender=$("asGender")?.value||'', phone=normalizePhone($("asPhone")?.value||'',phoneMeta()), newEmail=$("asEmail")?.value.trim()||'', oldEmail=state.user?.email||p.email||'';
    if(!first||!last||!birth||!gender||!phone||!phoneMeta().test.test(phone)||!newEmail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return toast('Remplissez correctement toutes les informations obligatoires.');
    try {
      if(newEmail.toLowerCase()!==oldEmail.toLowerCase()){ const er=await sb.auth.updateUser({email:newEmail}); if(er.error) throw new Error(er.error.message); }
      const patch={first_name:first,last_name:last,birth,gender,phone,phone_code:phoneMeta().code,email:newEmail,country:phoneMeta().name};
      if(changed) patch.name_changed_at=new Date().toISOString();
      const r=await sb.from('profiles').update(patch).eq('id',state.user.id); if(r.error)throw new Error(r.error.message);
      closeModal(); await loadProfile(); await settingsPage(); toast(newEmail.toLowerCase()!==oldEmail.toLowerCase()?'E-mail mis à jour. Vérifiez votre nouvelle adresse si Supabase demande une confirmation.':'Informations du compte enregistrées.');
    } catch(e){toast(e.message)}
  }

  async function saveProfile() {
    const p = state.profile || {};
    const patch = {
      country: phoneMeta().name,
      city_current: $('pfCityCurrent')?.value.trim() || "",
      city_origin: $('pfCityOrigin')?.value.trim() || "",
      bio: $('pfBio')?.value.trim() || "",
      location: $('pfCityCurrent')?.value.trim() || "",
    };
    const currentInput=$("pfCityCurrent"), originInput=$("pfCityOrigin");
    if (!patch.city_current || currentInput?.dataset.placeValid !== "true") return toast('Recherchez puis sélectionnez une ville actuelle réelle dans la liste.');
    if (!patch.city_origin || originInput?.dataset.placeValid !== "true") return toast('Recherchez puis sélectionnez une ville d’origine réelle dans la liste.');
    const btn=document.querySelector('[data-action="save-profile"]');
    setLoading(btn,true,'Enregistrer');
    try {
      for (const [file,key] of [[$('pfAvatar')?.files?.[0],"avatar_url"],[$('pfCover')?.files?.[0],"cover_url"]]) {
        if (!file) continue;
        if (!file.type.startsWith('image/')) throw new Error('Choisissez uniquement une image.');
        if (file.size > 8*1024*1024) throw new Error('Image trop volumineuse (maximum 8 Mo).');
        const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
        const path=`${state.user.id}/${key.replace('_url','')}-${crypto.randomUUID()}.${ext}`;
        const up=await sb.storage.from('profile-media').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'});
        if(up.error) throw new Error('Upload : '+up.error.message);
        patch[key]=sb.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
      }
      const r=await sb.from('profiles').update(patch).eq('id',state.user.id);
      if(r.error) throw new Error(r.error.message);
      const verify=await sb.from('profiles').select('bio,city_current,city_origin,avatar_url,cover_url').eq('id',state.user.id).maybeSingle();
      if(verify.error) throw new Error('Vérification : '+verify.error.message);
      if(!verify.data) throw new Error('Le profil n’a pas pu être vérifié après l’enregistrement.');
      setLoading(btn,false,'Enregistrer');
      closeModal();
      await loadProfile();
      toast('Profil mis à jour avec succès');
      if (state.route === "profile") await profilePage(state.profileTab);
    } catch(e) {
      setLoading(btn,false,'Enregistrer');
      toast(e?.message || 'Impossible d’enregistrer le profil.');
    }
  }

  async function genericListPage(route) {
    const token = state.renderToken;
    if (route === "reels") {
      const wanted = ["reel","video"];
      const rows = state.posts.filter(p => wanted.includes(p.media_type));
      if (token !== state.renderToken || state.route !== route) return;
      $("content").innerHTML = `<div class="card"><div class="page-header"><h2>Reels</h2><span class="muted">Découvrir</span></div>${rows.length?rows.map(p=>`<article class="post"><div class="post-head">${profileLink(p.author, avatarHTML(p.author), "profile-link profile-avatar-link")}<div class="meta">${profileLink(p.author, `<span class="post-author-name">${esc(nameOf(p.author))}</span>`, "profile-link profile-meta-link")}<span class="post-time"><small>${timeAgo(p.created_at)}</small></span></div></div>${p.content?`<div class="post-body">${esc(p.content)}</div>`:""}<video class="post-media" src="${esc(p.media_url)}" controls></video></article>`).join(""):`<div class="empty">Aucun Reel pour le moment.</div>`}</div>`;
      return;
    }
    if (route === "pages") {
      const { data, error } = await sb.from("pages").select("*").order("created_at",{ascending:false}).limit(50);
      if (token !== state.renderToken || state.route !== route) return;
      if (error) return simplePage("Pages", `<div class="empty-block"><b>Impossible de charger les Pages.</b><small>${esc(error.message)}</small><button class="primary big" data-action="retry-route" data-route-target="pages">Réessayer</button></div>`);
      const rows=data||[], ids=rows.map(x=>x.id);
      let followers=[];
      if(ids.length){ const f=await sb.from("page_followers").select("page_id,user_id").in("page_id",ids); if(!f.error) followers=f.data||[]; }
      const counts=new Map(); followers.forEach(x=>counts.set(x.page_id,(counts.get(x.page_id)||0)+1));
      const mine=new Set(rows.filter(x=>x.owner_id===state.user.id).map(x=>x.id));
      return simplePage("Pages", `<section class="entity-hub premium-entity-hub"><div class="entity-hero premium-hero"><div class="entity-hero-mark">▣</div><div class="grow"><span class="eyebrow">TAFAß • PAGES</span><h3>Pages</h3><p class="page-subtitle">Découvrez les Pages et ouvrez chaque espace directement.</p></div></div><div class="page-header-actions"><button class="primary premium-create-button" data-action="create-page">＋ Créer une Page</button></div><div class="entity-grid">${rows.map(x=>`<article class="entity-card premium-entity-card"><button class="entity-card-main" type="button" data-action="page-open" data-id="${esc(x.id)}"><div class="entity-cover" ${x.cover_url?`style="background-image:url('${esc(x.cover_url)}')"`:''}></div><div class="entity-body">${entityAvatarHTML(x,"page")}<h3>${esc(x.name)}</h3><p>${esc(x.bio||"Aucune présentation.")}</p><div class="entity-meta"><span>${esc(x.category||"Autre")}</span><span>${counts.get(x.id)||0} abonné${(counts.get(x.id)||0)>1?"s":""}</span></div></div></button><div class="entity-actions"><button class="primary" data-action="page-open" data-id="${esc(x.id)}">${mine.has(x.id)?"Gérer la Page":"Ouvrir"}</button></div></article>`).join("") || `<div class="empty entity-empty">Aucune Page disponible pour le moment.</div>`}</div></section>`);
    }
    if (route === "groups") {
      const { data, error } = await sb.from("groups").select("*").order("created_at",{ascending:false}).limit(50);
      if (token !== state.renderToken || state.route !== route) return;
      if (error) return simplePage("Groupes", `<div class="empty-block"><b>Impossible de charger les Groupes.</b><small>${esc(error.message)}</small><button class="primary big" data-action="retry-route" data-route-target="groups">Réessayer</button></div>`);
      const rows=data||[], ids=rows.map(x=>x.id);
      let members=[];
      if(ids.length){ const r=await sb.from("group_members").select("group_id,user_id").in("group_id",ids); if(!r.error) members=r.data||[]; }
      const counts=new Map(); members.forEach(x=>counts.set(x.group_id,(counts.get(x.group_id)||0)+1));
      const mineIds=new Set(members.filter(x=>x.user_id===state.user.id).map(x=>x.group_id));
      return simplePage("Groupes", `<section class="entity-hub premium-entity-hub"><div class="entity-hero premium-hero"><div class="entity-hero-mark">◎</div><div class="grow"><span class="eyebrow">TAFAß • GROUPES</span><h3>Groupes</h3><p class="page-subtitle">Découvrez les communautés et ouvrez chaque groupe directement.</p></div></div><div class="page-header-actions"><button class="primary premium-create-button" data-action="create-group">＋ Créer un groupe</button></div><div class="entity-grid">${rows.map(x=>`<article class="entity-card premium-entity-card"><button class="entity-card-main" type="button" data-action="group-open" data-id="${esc(x.id)}"><div class="entity-cover" ${x.cover_url?`style="background-image:url('${esc(x.cover_url)}')"`:''}></div><div class="entity-body">${entityAvatarHTML(x,"group")}<h3>${esc(x.name)}</h3><p>${esc(x.description||"Aucune description.")}</p><div class="entity-meta"><span>${esc(x.privacy||"public")}</span><span>${counts.get(x.id)||0} membre${(counts.get(x.id)||0)>1?"s":""}</span></div></div></button><div class="entity-actions"><button class="primary" data-action="group-open" data-id="${esc(x.id)}">${mineIds.has(x.id)?"Ouvrir":"Voir le groupe"}</button></div></article>`).join("") || `<div class="empty entity-empty">Aucun groupe disponible pour le moment.</div>`}</div></section>`);
    }
    if (route === "saved") {
      const { data } = await sb.from("saved_posts").select("post_id").eq("user_id", state.user.id);
      if (token !== state.renderToken || state.route !== route) return;
      const ids = (data||[]).map(x=>x.post_id), saved = state.posts.filter(p=>ids.includes(p.id));
      return simplePage("Enregistrements", saved.length ? saved.map(p=>`<div class="list-row">${avatarHTML(p.author)}<div class="grow"><b>${esc(nameOf(p.author))}</b><small>${esc(p.content||"Publication enregistrée")}</small></div></div>`).join("") : `<div class="empty">Vos publications enregistrées apparaîtront ici.</div>`);
    }
  }

  async function tafabPage() {
    const token = state.renderToken;
    const [listR, adsR] = await Promise.all([
      sb.from("tafab_listings").select("*").eq("status","active").order("created_at",{ascending:false}).limit(30),
      sb.from("tafab_ads").select("*").eq("status","active").order("created_at",{ascending:false}).limit(20)
    ]);
    if (listR.error) return simplePage("Tafaß", `<div class="empty">${esc(listR.error.message)}</div>`);
    if (token !== state.renderToken) return;
    const listings=listR.data||[], ads=adsR.data||[];
    simplePage("Tafaß", `
      <div class="tafab-hero premium-hero clean-tafab-hero">
        <div class="tafab-brand-mark">T</div><div class="grow"><span class="eyebrow">TAFAß • MARCHÉ</span><h3>Vente & échanges</h3><p class="page-subtitle">Des offres publiées par les membres, synchronisées en temps réel.</p></div>
      </div>
      <div class="page-header-actions"><button class="primary" data-action="create-tafab-listing">＋ Publier une offre</button><button class="ghost-action" data-action="create-tafab-ad">＋ Publier une publicité</button></div>
      <div class="tafab-grid">
        ${listings.map(x=>`<article class="tafab-card tafab-ad"><div class="tafab-ad-label">OFFRE RÉELLE • TAFAß</div><h3>${esc(x.title)}</h3><p>${esc(x.description||"")}</p><div class="tafab-meta-line">${esc(x.location||"")} ${x.location&&x.price!=null?'• ':''}${x.price!=null?esc(x.price)+" "+esc(x.currency||"MGA"):""}</div><div class="tafab-actions"><button class="primary" data-action="tafab-contact" data-id="${esc(x.id)}">Contacter</button><button class="ghost-action" data-action="tafab-info" data-id="${esc(x.id)}">Détails</button></div></article>`).join("")}
        ${ads.map(a=>`<article class="tafab-card tafab-discussion"><div class="tafab-card-head"><span class="tafab-icon">📢</span><div><b>${esc(a.title)}</b><small>Publicité Tafaß</small></div></div><p>${esc(a.description||"")}</p>${a.image_url?`<img class="post-media" src="${esc(a.image_url)}" alt="Publicité">`:""}<button class="primary big" data-action="tafab-ad" data-id="${esc(a.id)}">Voir la publicité</button></article>`).join("")}
        ${!listings.length&&!ads.length?`<div class="empty tafab-empty" style="grid-column:1/-1"><b>Aucune offre ni publicité pour le moment.</b><small>Les contenus apparaîtront ici dès qu'un membre en publiera un.</small></div>`:""}
      </div>`);
  }

  function menuIcon(type) {
    const paths = {
      profile:'<circle cx="12" cy="8" r="3"/><path d="M5 20c.7-4 2.9-6 7-6s6.3 2 7 6"/>',
      friends:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.6-3.5 2.6-5.5 5.5-5.5s4.9 2 5.5 5.5M14.5 15c3.2-.2 5.2 1.4 6 4.5"/>',
      groups:'<circle cx="12" cy="8" r="3"/><path d="M4 20c.8-3.7 3.5-5.5 8-5.5s7.2 1.8 8 5.5"/>',
      pages:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/>',
      saved:'<path d="M6 4h12v17l-6-3.5L6 21z"/>',
      videos:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
      reels:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 4 3 4m2-4 3 4M4 9h16M10 12l5 3-5 3z"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.5V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.5h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V4h2.5v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.5h-.2a1.7 1.7 0 0 0-1.6 1z"/>',
      search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
      history:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l3 2"/>',
      help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 1 1 4.2 2.2c-1.1.7-1.7 1.2-1.7 2.6M12 17h.01"/>',
      privacy:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      payment:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
      logout:'<path d="M10 5H5v14h5M14 8l5 4-5 4M19 12H9"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type] || paths.settings}</svg>`;
  }

  function menuPage() {
    state.backOverride = null;
    const p = state.profile || {};
    const items = [
      ["profile","profile","Profil","Voir votre profil"],
      ["friends","friends","Amis","Votre réseau"],
      ["messages","messages","Messages","Vos conversations"],
      ["notifications","history","Alertes","Vos notifications"],
      ["groups","groups","Groupes","Communautés"],
      ["pages","pages","Pages","Pages et gestion"],
      ["reels","reels","Reels","Formats courts"],
      ["saved","saved","Enregistrements","Vos contenus sauvegardés"],
      ["search","search","Rechercher","Trouver un compte ou contenu"],
      ["settings","settings","Para & Conf","Compte et confidentialité"]
    ];
    const actions = [
      ["history","history","Historique d'activité","Vos actions enregistrées", "activity"],
      ["payment","payment","Paiement","Vos paiements et transactions", "payment"],
      ["help","help","Aide","Assistance et signalement", "help"]
    ];
    const card = x => `<button type="button" class="menu-card premium-menu-card" ${x[4] ? `data-action="menu-service" data-name="${esc(x[2])}" data-service="${esc(x[4])}"` : `data-action="menu-route" data-route-target="${esc(x[0])}"`} aria-label="${esc(x[2])}"><span class="menu-icon">${menuIcon(x[1])}</span><span class="menu-card-copy"><b>${esc(x[2])}</b><small title="${esc(x[3])}">${esc(x[3])}</small></span><span class="menu-arrow">›</span></button>`;
    simplePage("Menu", `<div class="menu-profile premium-menu-profile" data-route="profile"><button class="profile-link menu-profile-avatar" data-action="view-profile" data-id="${esc(p.id || "")}">${avatarHTML(p)}</button><div class="grow"><b>${esc(nameOf(p))}</b><small title="${esc(p.email || state.user?.email || "")}">${esc(p.email || state.user?.email || "")}</small></div><button class="small-action" data-route="profile">Profil</button></div><div class="menu-section-title">Raccourcis</div><div class="menu-grid premium-menu-grid">${items.map(card).join("")}</div><div class="menu-section-title">Services</div><div class="menu-grid premium-menu-grid">${actions.map(card).join("")}</div><div class="menu-section-title">Compte</div><div class="menu-grid premium-menu-grid"><button class="menu-card premium-menu-card danger-card" data-action="logout"><span class="menu-icon">${menuIcon("logout")}</span><span class="menu-card-copy"><b>Déconnexion</b><small>Quitter ce compte en toute sécurité</small></span><span class="menu-arrow">›</span></button></div>`);
  }

  async function servicePage(service) {
    state.backOverride = "menu";
    if(service === "activity") {
      const [activityR, searchR] = await Promise.all([
        sb.from("activity_history").select("*").eq("user_id",state.user.id).order("created_at",{ascending:false}).limit(100),
        sb.from("search_history").select("*").eq("user_id",state.user.id).order("created_at",{ascending:false}).limit(100)
      ]);
      const activityRows=(activityR.data||[]).map(x=>`<div class="list-row history-row"><div class="grow"><b>${esc(x.description||x.action_type||"Activité")}</b><small>${esc(x.entity_type||"")} · ${timeAgo(x.created_at)}</small></div></div>`).join("") || `<div class="empty">Aucune activité enregistrée.</div>`;
      const searchRows=(searchR.data||[]).map(x=>`<div class="list-row history-row"><div class="history-search-icon">⌕</div><div class="grow"><b>${esc(x.search_text||"")}</b><small>Recherche · ${timeAgo(x.created_at)}</small></div><button class="ghost-action history-delete-btn" data-action="delete-search-history" data-id="${esc(x.id)}" aria-label="Supprimer cette recherche">Supprimer</button></div>`).join("") || `<div class="empty">Aucune recherche enregistrée.</div>`;
      return simplePage("Historique d'activité", `<div class="history-table-head"><div><h3 class="menu-section-title">Historique de recherche</h3><p>Vos recherches sont conservées ici, séparément de la page Rechercher.</p></div><button class="ghost-action danger-history-action" data-action="clear-search-history">Tout effacer</button></div><div class="clean-list history-search-list">${searchRows}</div><div class="history-table-head activity-head"><div><h3 class="menu-section-title">Activité récente</h3><p>Les actions enregistrées sur votre compte.</p></div></div><div class="clean-list">${activityRows}</div>`);
    }
    if(service === "privacy") return settingsPage();
    if(service === "help") return simplePage("Aide", `<div class="clean-section"><h3 class="menu-section-title">Centre d'aide</h3><div class="settings-grid"><button class="setting-card" data-action="help-item" data-name="Compte"><span><b>Compte</b><small>Connexion, profil et paramètres</small></span><span>›</span></button><button class="setting-card" data-action="help-item" data-name="Sécurité"><span><b>Sécurité</b><small>Accès et protection du compte</small></span><span>›</span></button><button class="setting-card" data-action="help-item" data-name="Signalement"><span><b>Signalement</b><small>Signaler un compte ou une publication</small></span><span>›</span></button></div></div>`);
    if(service === "payment") {
      const r=await sb.from("payment_transactions").select("*").eq("user_id",state.user.id).order("created_at",{ascending:false}).limit(50);
      if(r.error) return simplePage("Paiement", `<section class="payment-page-premium"><div class="premium-hero payment-hero"><span class="eyebrow">TAFAß • PAIEMENT</span><h3>Paiement sécurisé</h3><p class="page-subtitle">Les demandes sont enregistrées dans Tafaß et traitées après vérification. Aucun paiement fictif n’est affiché comme réussi.</p></div><div class="payment-method-card"><div><b>Airtel Money / Yas Money</b><small>Choisissez un moyen et créez une seule demande vérifiable.</small></div><button class="primary" data-action="payment-request" data-method="Airtel Money">Créer une demande</button></div><div class="clean-section"><h3 class="menu-section-title">Historique</h3><div class="clean-list"><div class="empty">Le service de paiement n’est pas encore configuré côté Supabase. Exécutez TAFASS_PAYMENT_SETUP.sql.</div></div></div></section>`);
      const rows=(r.data||[]);
      const unique=[]; const seen=new Set();
      for(const x of rows){ const key=`${x.id||''}|${x.method||''}|${x.amount||''}|${x.created_at||''}`; if(!seen.has(key)){seen.add(key);unique.push(x);} }
      return simplePage("Paiement", `<section class="payment-page-premium"><div class="premium-hero payment-hero"><span class="eyebrow">TAFAß • PAIEMENT</span><h3>Paiement sécurisé</h3><p class="page-subtitle">Une seule interface de paiement. Les demandes restent en attente jusqu’à validation réelle.</p></div><div class="payment-method-card"><div><b>Airtel Money / Yas Money</b><small>Créer une demande de paiement réelle enregistrée dans votre compte.</small></div><button class="primary" data-action="payment-request" data-method="Airtel Money">Nouvelle demande</button></div><div class="clean-section"><h3 class="menu-section-title">Historique</h3><div class="clean-list">${unique.map(x=>`<div class="list-row payment-history-row"><div class="grow"><b>${esc(x.method||"Paiement")}</b><small>${esc(x.status||"pending")} · ${esc(String(x.amount||0))} ${esc(x.currency||"MGA")} · ${timeAgo(x.created_at)}</small></div></div>`).join("")||`<div class="empty">Aucune transaction.</div>`}</div></div></section>`);
    }
  }
  async function createPaymentRequest(method) {
    const amount=prompt(`Montant en MGA pour ${method} :`, ""); if(amount===null)return; const n=Number(amount); if(!Number.isFinite(n)||n<=0)return toast("Montant invalide.");
    const existing=await sb.from("payment_transactions").select("id,status").eq("user_id",state.user.id).eq("method",method).eq("amount",n).eq("status","pending").limit(1);
    if(existing.error) return toast("Le service de paiement n’est pas configuré. Exécutez TAFASS_PAYMENT_SETUP.sql.");
    if((existing.data||[]).length) return toast("Une demande identique est déjà en attente.");
    const r=await sb.from("payment_transactions").insert({user_id:state.user.id,method,amount:n,currency:"MGA",status:"pending"});
    if(r.error)return toast(r.error.message); await logActivity("payment_request_created",`Demande de paiement ${method}`,"payment"); toast("Demande enregistrée et en attente de validation"); return servicePage("payment");
  }

  async function settingsPage() {
    const token = state.renderToken;
    let cfg = state.user ? (await sb.from("user_settings").select("*").eq("user_id", state.user.id).maybeSingle()).data : null;
    if (!cfg && state.user) {
      const r = await sb.from("user_settings").insert({ user_id: state.user.id }).select().single();
      cfg = r.data || {};
    }
    const dark = state.theme === "dark";
    if (token !== state.renderToken || state.route !== "settings") return;
    const toggleLabel = (value) => value ? "Activé" : "Désactivé";
    simplePage("Para & Conf", `<p class="page-subtitle">Tous les réglages réels de votre compte, de votre sécurité, de votre confidentialité et de vos notifications.</p>
      <div class="settings-section-title">Compte</div><div class="settings-grid settings-grid-complete">
        <button class="setting-card" data-action="account-settings"><span><b>Informations du compte</b><small>Nom, prénom, e-mail, numéro, naissance et genre</small></span><span>›</span></button>
        <button class="setting-card" data-action="security-settings"><span><b>Sécurité et connexion</b><small>Accès, session et protection du compte</small></span><span>›</span></button>
        <button class="setting-card" data-action="menu-service" data-service="payment" data-name="Paiement"><span><b>Paiement</b><small>Moyens et historique des transactions</small></span><span>›</span></button>
        <button class="setting-card" data-action="menu-service" data-service="activity" data-name="Historique d'activité"><span><b>Historique d'activité</b><small>Vos actions enregistrées</small></span><span>›</span></button>
      </div>
      <div class="settings-section-title">Confidentialité</div><div class="settings-grid settings-grid-complete">
        <button class="setting-card" data-action="privacy-settings"><span><b>Confidentialité du profil</b><small>Visibilité : ${esc(cfg?.profile_visibility || "public")}</small></span><span>›</span></button>
        <button class="setting-card" data-action="friend-settings"><span><b>Demandes d’amis</b><small>${toggleLabel(cfg?.allow_friend_requests !== false)}</small></span><span>›</span></button>
        <button class="setting-card" data-action="message-settings"><span><b>Messages</b><small>${toggleLabel(cfg?.allow_messages !== false)}</small></span><span>›</span></button>
        <button class="setting-card" data-action="search-privacy-settings"><span><b>Recherche</b><small>Téléphone : ${toggleLabel(cfg?.allow_search_by_phone !== false)} · E-mail : ${toggleLabel(cfg?.allow_search_by_email !== false)}</small></span><span>›</span></button>
      </div>
      <div class="settings-section-title">Notifications</div><div class="settings-grid settings-grid-complete">
        <button class="setting-card" data-action="notifications-settings"><span><b>Notifications générales</b><small>${toggleLabel(cfg?.notifications_enabled !== false)}</small></span><span>›</span></button>
        <button class="setting-card" data-action="message-notification-settings"><span><b>Messages</b><small>${toggleLabel(cfg?.message_notifications !== false)}</small></span><span>›</span></button>
        <button class="setting-card" data-action="friend-notification-settings"><span><b>Amis</b><small>${toggleLabel(cfg?.friend_notifications !== false)}</small></span><span>›</span></button>
        <button class="setting-card" data-action="reaction-notification-settings"><span><b>Réactions</b><small>${toggleLabel(cfg?.reaction_notifications !== false)}</small></span><span>›</span></button>
        <button class="setting-card" data-action="comment-notification-settings"><span><b>Commentaires</b><small>${toggleLabel(cfg?.comment_notifications !== false)}</small></span><span>›</span></button>
      </div>
      <div class="settings-section-title">Préférences</div><div class="settings-grid settings-grid-complete">
        <button class="setting-card" data-action="theme"><span><b>Mode sombre</b><small>${dark ? "Activé" : "Désactivé"}</small></span><span class="toggle ${dark?"on":""}"><i></i></span></button>
        <button class="setting-card" data-action="language-settings"><span><b>Langue</b><small>Français</small></span><span>›</span></button>
        <button class="setting-card" data-action="menu-service" data-service="help" data-name="Aide"><span><b>Aide et assistance</b><small>Centre d'aide Tafaß</small></span><span>›</span></button>
      </div>`);
  }
  async function openSettingControl(action) {
    const cfg = (await sb.from("user_settings").select("*").eq("user_id", state.user.id).maybeSingle()).data || {};
    const labels = {
      "friend-settings":["Demandes d’amis","allow_friend_requests","Autoriser les autres membres à vous envoyer des demandes d’ami"],
      "message-settings":["Messages","allow_messages","Autoriser les autres membres à vous envoyer des messages"],
      "search-privacy-settings":["Recherche","search_privacy","Autoriser la recherche de votre compte par téléphone ou e-mail"],
      "language-settings":["Langue","language","Langue de l’interface"],
      "message-notification-settings":["Notifications de messages","message_notifications","Recevoir les alertes de messages"],
      "friend-notification-settings":["Notifications d’amis","friend_notifications","Recevoir les alertes liées aux demandes et relations"],
      "reaction-notification-settings":["Notifications de réactions","reaction_notifications","Recevoir les alertes de réactions"],
      "comment-notification-settings":["Notifications de commentaires","comment_notifications","Recevoir les alertes de commentaires"]
    };
    const [title,key,desc] = labels[action];
    if (key === "search_privacy") {
      return openModal(`<div class="modal-box settings-modal"><button class="modal-close" data-action="close-modal">×</button><h3>${esc(title)}</h3><label><input id="allowSearchPhone" type="checkbox" ${cfg.allow_search_by_phone !== false ? "checked" : ""}> Recherche par téléphone</label><label><input id="allowSearchEmail" type="checkbox" ${cfg.allow_search_by_email !== false ? "checked" : ""}> Recherche par e-mail</label><button class="primary big" data-action="save-search-privacy">Enregistrer</button></div>`);
    }
    if (key === "language") return openModal(`<div class="modal-box settings-modal"><button class="modal-close" data-action="close-modal">×</button><h3>Langue</h3><label>Langue<select id="languageSelect"><option value="fr" ${cfg.language === "fr" || !cfg.language ? "selected" : ""}>Français</option><option value="mg" ${cfg.language === "mg" ? "selected" : ""}>Malagasy</option></select></label><button class="primary big" data-action="save-language">Enregistrer</button></div>`);
    const current = cfg[key] !== false;
    return openModal(`<div class="modal-box settings-modal"><button class="modal-close" data-action="close-modal">×</button><h3>${esc(title)}</h3><p class="muted">${esc(desc)}</p><label class="setting-switch-line"><input id="settingToggle" type="checkbox" ${current ? "checked" : ""}><span>${current ? "Activé" : "Désactivé"}</span></label><button class="primary big" data-action="save-setting-toggle" data-setting-key="${esc(key)}">Enregistrer</button></div>`);
  }

  async function saveUserSetting(patch) {
    const { error } = await sb.from("user_settings").upsert({ user_id: state.user.id, ...patch }, { onConflict:"user_id" });
    if (error) return toast(error.message);
    toast("Paramètre enregistré");
    await settingsPage();
  }

  function securitySettings() {
    openModal(`<div class="modal-box settings-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • SÉCURITÉ</span><h3>Sécurité et connexion</h3><p class="muted">Compte connecté : ${esc(state.user?.email || "Compte Tafaß")}</p><div class="form-stack"><label>Nouveau mot de passe<input id="newPassword" type="password" minlength="6" autocomplete="new-password" placeholder="Au moins 6 caractères"></label><label>Confirmer le mot de passe<input id="confirmPassword" type="password" minlength="6" autocomplete="new-password" placeholder="Répétez le mot de passe"></label><button class="primary big" data-action="change-password">Modifier le mot de passe</button><button class="ghost-action big" data-action="logout">Se déconnecter</button></div></div>`);
  }
  async function changePassword() {
    const password=$("newPassword")?.value || "", confirm=$("confirmPassword")?.value || "";
    if(password.length < 6) return toast("Le mot de passe doit contenir au moins 6 caractères.");
    if(password !== confirm) return toast("Les mots de passe ne correspondent pas.");
    const r=await sb.auth.updateUser({password});
    if(r.error)return toast(r.error.message);
    closeModal(); toast("Mot de passe modifié"); await logActivity("password_changed","Mot de passe modifié","security");
  }

  function settingInfo(name) {
    const bodies = {
      "Compte":"Modifiez vos informations personnelles depuis votre Profil.",
      "Sécurité et connexion":"Votre session Tafaß est protégée par l’authentification Supabase. Utilisez la déconnexion pour fermer immédiatement cette session.",
      "Paiement":"Les informations de paiement seront conservées dans les fonctions de paiement activées par Tafaß.",
      "Aide":"Utilisez cette section pour consulter l’aide et l’assistance Tafaß.",
      "Politique de confidentialité":"Gérez qui peut voir votre profil et comment les autres membres peuvent vous contacter.",
      "Historique d'activité":"Les actions enregistrées par Tafaß peuvent être consultées dans votre historique.",
      "Recherche":"Les recherches effectuées peuvent être enregistrées dans votre historique de recherche."
    };
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>${esc(name)}</h3><p class="muted" style="font-size:12px;line-height:1.65">${esc(bodies[name] || "Cette section est disponible dans les paramètres de votre compte.")}</p><button class="primary big" data-action="close-modal">Fermer</button></div>`);
  }

  async function logActivity(action_type, description, entity_type = "", entity_id = null) {
    if (!state.user) return;
    await sb.from("activity_history").insert({ user_id: state.user.id, action_type, description, entity_type, entity_id });
  }

  function createTafabListing() {
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • OFFRE</span><h3>Publier une offre</h3><div class="form-stack"><label>Titre<input id="listingTitle" placeholder="Ex. Eau potable disponible" required></label><label>Description<textarea id="listingDesc" placeholder="Décrivez l'offre, la quantité et la livraison"></textarea></label><div class="grid2"><label>Prix<input id="listingPrice" type="number" min="0" placeholder="Prix"></label><label>Devise<select id="listingCurrency"><option value="MGA">MGA</option><option value="EUR">EUR</option><option value="USD">USD</option></select></label></div><label>Lieu<input id="listingLocation" placeholder="Ville / zone"></label><label>Téléphone<input id="listingPhone" type="tel" placeholder="Numéro de contact"></label><button class="primary big" data-action="save-tafab-listing">Publier</button></div></div>`);
  }

  async function saveTafabListing() {
    const title=$("listingTitle")?.value.trim();
    if (!title) return toast("Ajoutez un titre.");
    const r=await sb.from("tafab_listings").insert({ seller_id:state.user.id, title, description:$("listingDesc")?.value.trim()||"", category:"eau", price:$("listingPrice")?.value?Number($("listingPrice").value):null, currency:$("listingCurrency")?.value||"MGA", location:$("listingLocation")?.value.trim()||null, phone:$("listingPhone")?.value.trim()||null, status:"active" }).select().single();
    if(r.error) return toast(r.error.message);
    await logActivity("tafab_listing_created", "Offre Tafaß publiée", "tafab_listing", r.data.id);
    closeModal(); toast("Offre publiée"); await tafabPage();
  }

  function createTafabAd() {
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • PUBLICITÉ</span><h3>Publier une publicité</h3><div class="form-stack"><label>Titre<input id="adTitle" placeholder="Titre de la publicité" required></label><label>Description<textarea id="adDesc" placeholder="Votre message publicitaire"></textarea></label><label>Image URL <span class="muted-inline">(optionnel)</span><input id="adImage" type="url" placeholder="https://..."></label><label>Lien <span class="muted-inline">(optionnel)</span><input id="adUrl" type="url" placeholder="https://..."></label><button class="primary big" data-action="save-tafab-ad">Publier</button></div></div>`);
  }

  async function saveTafabAd() {
    const title=$("adTitle")?.value.trim();
    if(!title) return toast("Ajoutez un titre.");
    const r=await sb.from("tafab_ads").insert({ owner_id:state.user.id, title, description:$("adDesc")?.value.trim()||"", image_url:$("adImage")?.value.trim()||null, target_url:$("adUrl")?.value.trim()||null, status:"active" }).select().single();
    if(r.error) return toast(r.error.message);
    await logActivity("tafab_ad_created", "Publicité Tafaß publiée", "tafab_ad", r.data.id);
    closeModal(); toast("Publicité publiée"); await tafabPage();
  }

  async function contactTafabListing(id) {
    const {data:x,error}=await sb.from("tafab_listings").select("*").eq("id",id).maybeSingle();
    if(error||!x) return toast(error?.message||"Offre introuvable");
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • CONTACT</span><h3>${esc(x.title)}</h3><p class="muted">${esc(x.description||"")}</p><div class="form-stack"><label>Votre message<textarea id="listingMessage" placeholder="Bonjour, je souhaite connaître la disponibilité et les conditions..."></textarea></label><button class="primary big" data-action="send-tafab-message" data-id="${esc(x.id)}">Envoyer</button>${x.phone?`<small class="muted">Contact vendeur : ${esc(x.phone)}</small>`:""}</div></div>`);
  }

  async function sendTafabMessage(id) {
    const message=$("listingMessage")?.value.trim(); if(!message)return toast("Écrivez un message.");
    const r=await sb.from("tafab_listing_messages").insert({listing_id:id,sender_id:state.user.id,message});
    if(r.error)return toast(r.error.message);
    await logActivity("tafab_message_sent", "Message envoyé sur une offre Tafaß", "tafab_listing", id);
    closeModal(); toast("Message envoyé en temps réel");
  }

  const PAGE_ICONS = {
    home:"home", friends:"friends", messages:"messages", notifications:"history", profile:"profile",
    reels:"reels", pages:"pages", groups:"groups", saved:"saved", menu:"settings", tafab:"tafab",
    settings:"settings", search:"search", activity:"history", payment:"payment", help:"help"
  };
  function pageTitleIcon(routeOrTitle) {
    const type = PAGE_ICONS[routeOrTitle] || (String(routeOrTitle).toLowerCase().includes("message") ? "messages" : String(routeOrTitle).toLowerCase().includes("ami") ? "friends" : "settings");
    return menuIcon(type);
  }
  function decoratePageHeader(route = state.route) {
    const root = $("content")?.firstElementChild;
    if (!root || route === "home") return;
    const header = root.querySelector(".page-header");
    if (!header) return;
    const h = header.querySelector("h1,h2,h3");
    if (h && !h.querySelector(".page-title-logo")) h.insertAdjacentHTML("afterbegin", `<span class="page-title-logo" aria-hidden="true">${pageTitleIcon(route)}</span>`);
    if (!header.querySelector('[data-action="page-back"]') && !header.querySelector("[data-page-back]")) {
      const back = document.createElement("button");
      back.type = "button"; back.className = "page-back"; back.dataset.action = "page-back";
      back.setAttribute("aria-label", "Retour"); back.innerHTML = `<span aria-hidden="true">‹</span><small>Retour</small>`;
      header.insertBefore(back, header.firstChild);
    }
  }
  function goBack() {
    if (state.backOverride) {
      const target = state.backOverride; state.backOverride = null;
      state.renderToken++; state.route = target; state.selectedConversation = null;
      state.navStack = [...state.navStack.filter(r => r !== target), target];
      history.replaceState(null, "", "#" + target);
      return render();
    }
    if (state.navStack.length > 1) {
      state.navStack.pop();
      const previous = state.navStack[state.navStack.length - 1] || "home";
      state.renderToken++; state.route = previous; state.selectedConversation = null;
      history.replaceState(null, "", "#" + previous);
      return render();
    }
    return navigate("home", { replaceStack: true });
  }
  function simplePage(title, body) {
    const clean = ["Amis","Messages","Alertes","Tafaß","Menu","Rechercher","Pages","Groupes","Reels","Enregistrements","Para & Conf","Profil","Aide","Paiement","Historique d'activité"].includes(title);
    $("content").innerHTML = clean
      ? `<section class="clean-page clean-page-shell"><div class="page-header clean-page-header"><div><h2>${esc(title)}</h2></div></div>${body}</section>`
      : `<div class="card"><div class="page-header"><h2>${esc(title)}</h2></div>${body}</div>`;
    decoratePageHeader(state.route);
  }
  function openModal(html) { $("modal").className = "modal"; $("modal").innerHTML = html; document.body.classList.add("modal-open"); }
  function closeModal() { $("modal").className = "modal hidden"; $("modal").innerHTML = ""; document.body.classList.remove("modal-open"); }

  function ensurePageLoader() {
    let el = document.getElementById("pageLoader");
    if (!el) { el = document.createElement("div"); el.id = "pageLoader"; el.className = "page-loader"; el.innerHTML = '<span></span>'; document.body.appendChild(el); }
    return el;
  }
  let pageLoading = false;
  function beginPageLoading() {
    pageLoading = true;
    ensurePageLoader().classList.add("active");
    document.body.classList.add("page-loading");
  }
  function endPageLoading() {
    const el = ensurePageLoader();
    el.classList.add("done");
    setTimeout(() => { el.classList.remove("active","done"); document.body.classList.remove("page-loading"); pageLoading = false; }, 220);
  }

  async function render() {
    if (!state.user) return;
    const token = ++state.renderToken;
    const route = routes.includes(state.route) ? state.route : "home";
    state.route = route;
    beginPageLoading();
    document.querySelectorAll("[data-route]").forEach(el => el.classList.toggle("active", el.dataset.route === route));
    window.scrollTo({ top: 0, behavior: "auto" });
    try {
      if (route === "home") await renderFeed();
      else if (route === "friends") await friendsPage();
      else if (route === "search") await searchPage("");
      else if (route === "messages") await messagesPage();
      else if (route === "notifications") await notificationsPage();
      else if (route === "profile") await profilePage(state.profileTab);
      else if (["reels","pages","groups","saved"].includes(route)) await genericListPage(route);
      else if (route === "menu") menuPage();
      else if (route === "tafab") await tafabPage();
      else if (route === "settings") await settingsPage();
      if (token !== state.renderToken || route !== state.route) return;
      decoratePageHeader(route);
      const pageRoot = $("content")?.firstElementChild;
      if (pageRoot) pageRoot.dataset.pageRoute = route;
      document.querySelectorAll("[data-route]").forEach(el => el.classList.toggle("active", el.dataset.route === state.route));
      updateBadges();
    } catch (err) {
      console.error("Tafaß render:", err);
      if (token === state.renderToken && state.route === route) {
        $("content").innerHTML = `<section class="clean-page clean-page-shell error-page"><div class="page-header clean-page-header"><h2>${esc(route === "profile" ? "Profil" : route === "settings" ? "Para & Conf" : "Tafaß")}</h2></div><div class="empty-block"><b>Impossible d’afficher cette section.</b><small>${esc(err?.message || "Une erreur est survenue.")}</small><button class="primary big" data-route="home">Retour à l’accueil</button></div></section>`;
      }
    } finally {
      endPageLoading();
    }
  }

  function navigate(route, options = {}) {
    if (!routes.includes(route)) route = "home";
    if (state.route === route && document.querySelector(`#content [data-page-route="${route}"]`)) {
      if (pageLoading) return;
      return;
    }
    if (!options.replaceStack && state.route !== route) {
      const last = state.navStack[state.navStack.length - 1];
      if (last !== route) state.navStack.push(route);
    }
    if (options.replaceStack) state.navStack = [route];
    state.renderToken++;
    state.route = route;
    if (route === "profile") state.viewingProfileId = null;
    state.selectedConversation = route === "messages" ? state.selectedConversation : null;
    history.replaceState(null, "", "#" + route);
    render().catch(err => {
      if (state.route === route) console.error("Tafaß navigation:", err);
    });
  }

  function syncThemeButton() {
    const btn = $("themeBtn");
    if (!btn) return;
    btn.innerHTML = state.theme === "dark"
      ? '<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>'
      : '<svg class="action-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    btn.setAttribute("aria-label", state.theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre");
  }

  async function toggleTheme() {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.body.classList.toggle("light", state.theme === "light");
    syncThemeButton();
    if (state.user) await sb.from("user_settings").upsert({user_id:state.user.id,theme:state.theme},{onConflict:"user_id"});
    if (state.user && state.route === "settings") settingsPage();
  }

  function logout() {
    openModal(`<div class="modal-box logout-modal premium-logout-modal">
      <div class="logout-visual"><span class="logout-shield" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M24 5l15 6v10c0 10.2-6.3 18.1-15 22-8.7-3.9-15-11.8-15-22V11l15-6z"/><path d="M16 24l5 5 11-12"/></svg></span></div>
      <span class="eyebrow">TAFAß • COMPTE</span>
      <h3>Déconnexion</h3>
      <p class="logout-question">Voulez-vous vraiment vous déconnecter de votre compte ?</p>
      <div class="logout-choice"><div><b>Rester dans l’application</b><small>Votre session reste ouverte.</small></div><button class="ghost-action" data-action="close-modal">Rester</button></div>
      <div class="logout-choice danger-choice"><div><b>Se déconnecter</b><small>Vous devrez vous reconnecter pour accéder au compte.</small></div><button class="danger-button" data-action="confirm-logout">Déconnexion</button></div>
    </div>`);
  }
  async function confirmLogout() {
    const button = document.querySelector('[data-action="confirm-logout"]');
    if (button) { button.disabled = true; button.textContent = "Déconnexion…"; }
    const { error } = await sb.auth.signOut({ scope: "global" });
    if (error) { if (button) { button.disabled = false; button.textContent = "Se déconnecter"; } return toast(error.message); }
    if (state.channel) { try { await sb.removeChannel(state.channel); } catch (_) {} state.channel = null; }
    state.user=null; state.profile=null; state.selectedConversation=null; state.viewingProfileId=null;
    closeModal();
    $("app").classList.add("hidden");
    showLogin();
  }

  async function setupRealtime() {
    if (state.channel) await sb.removeChannel(state.channel);
    state.channel = sb.channel("tafa-live-ui")
      .on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, () => { loadProfile(); if (state.route==="search") searchPage($("searchInput")?.value||""); if (state.viewingProfileId && state.route==="profile") openUserProfile(state.viewingProfileId); })
      .on("postgres_changes", { event:"*", schema:"public", table:"posts" }, async () => { await loadPosts(); if (["home","profile","reels","saved"].includes(state.route)) render(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"comments" }, async () => { await loadPosts(); if (["home","profile"].includes(state.route)) render(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"comment_likes" }, async () => { if (["home","profile"].includes(state.route)) render(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"post_reactions" }, async () => { await loadPosts(); if (["home","profile"].includes(state.route)) render(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"post_shares" }, async () => { await loadPosts(); if (["home","profile"].includes(state.route)) render(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"notifications" }, () => { updateBadges(); if (state.route==="notifications") notificationsPage(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"messages" }, payload => { updateBadges(); if (state.route==="messages") state.selectedConversation ? openConversation(state.selectedConversation) : messagesPage(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"friend_requests" }, () => { updateBadges(); if (state.route==="friends") friendsPage(); if (state.viewingProfileId && state.route==="profile") openUserProfile(state.viewingProfileId); })
      .on("postgres_changes", { event:"*", schema:"public", table:"friendships" }, () => { if (state.route==="friends") friendsPage(); if (state.viewingProfileId && state.route==="profile") openUserProfile(state.viewingProfileId); })
      .on("postgres_changes", { event:"*", schema:"public", table:"follows" }, () => { if (state.route==="profile") state.viewingProfileId ? openUserProfile(state.viewingProfileId) : profilePage(state.profileTab); })
      .on("postgres_changes", { event:"*", schema:"public", table:"groups" }, () => { if (state.route==="groups") genericListPage("groups"); })
      .on("postgres_changes", { event:"*", schema:"public", table:"group_members" }, () => { if (state.route==="groups") genericListPage("groups"); })
      .on("postgres_changes", { event:"*", schema:"public", table:"pages" }, () => { if (state.route==="pages") genericListPage("pages"); })
      .on("postgres_changes", { event:"*", schema:"public", table:"page_followers" }, () => { if (state.route==="pages") genericListPage("pages"); })
      .on("postgres_changes", { event:"*", schema:"public", table:"saved_posts" }, () => { if (state.route==="saved") genericListPage("saved"); })
      .on("postgres_changes", { event:"*", schema:"public", table:"user_settings" }, () => { if (state.route==="settings") settingsPage(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"search_history" }, () => { if (state.route==="search") searchPage($("searchInput")?.value||""); })
      .on("postgres_changes", { event:"*", schema:"public", table:"activity_history" }, () => { if (state.route==="menu") menuPage(); })
      .on("postgres_changes", { event:"*", schema:"public", table:"blocked_profiles" }, () => { if (state.viewingProfileId && state.route==="profile") openUserProfile(state.viewingProfileId); })
      .on("postgres_changes", { event:"*", schema:"public", table:"profile_reports" }, () => {})
      .on("postgres_changes", { event:"*", schema:"public", table:"payment_transactions" }, () => { if (state.route==="settings") servicePage("payment"); })
      .subscribe(status => { if(status==="SUBSCRIBED") console.info("Tafaß Realtime: connecté"); });
  }

  async function profileIsComplete() {
    if (!state.user) return false;
    await loadProfile();
    const p = state.profile || {};
    return Boolean(
      String(state.user.email || p.email || '').trim() &&
      String(p.first_name || '').trim() &&
      String(p.last_name || '').trim() &&
      p.birth &&
      String(p.gender || '').trim() &&
      String(p.phone || '').trim() &&
      String(p.country || '').trim() &&
      String(p.city_current || '').trim() &&
      String(p.city_origin || '').trim()
    );
  }

  function showOAuthOnboarding() {
    state.detectedCountry = detectCountry();
    const p = state.profile || {};
    // OAuth onboarding is a dedicated locked auth view, never a modal.
    // This prevents the old form from remaining underneath and appearing duplicated.
    closeModal();
    document.querySelectorAll('#oauthOnboardingView, .onboarding-modal-v23, .onboarding-modal-v24').forEach(el => el.remove());
    ["loginView","signupView","forgotPasswordView","resetPasswordView"].forEach(id => $(id)?.classList.add("hidden"));
    const shell = document.querySelector(".auth-shell");
    if (!shell) return;
    let view = $("oauthOnboardingView");
    if (!view) {
      view = document.createElement("div");
      view.id = "oauthOnboardingView";
      view.className = "auth-view oauth-onboarding-view-v24";
      shell.appendChild(view);
    }
    view.innerHTML = `<button type="button" class="page-back auth-onboarding-back" data-action="auth-onboarding-back"><span aria-hidden="true">‹</span><small>Connexion</small></button><div class="oauth-onboarding-head-v24">
      <span class="eyebrow">TAFAß • PREMIÈRE CONNEXION</span>
      <h1>Complétez votre compte</h1>
      <p class="muted">Votre connexion Google/Apple est réussie. Complétez les informations obligatoires pour déverrouiller Tafaß.</p>
    </div>
    <div class="onboarding-grid-v24">
      <label>Prénom<input id="onFirst" value="${esc(p.first_name||state.user?.user_metadata?.first_name||'')}" autocomplete="given-name" required></label>
      <label>Nom<input id="onLast" value="${esc(p.last_name||state.user?.user_metadata?.last_name||'')}" autocomplete="family-name" required></label>
      <label>Date de naissance<input id="onBirth" type="date" value="${esc(p.birth||'')}" required></label>
      <label>Genre<select id="onGender" required><option value="">Choisir</option><option value="Homme" ${p.gender==='Homme'?'selected':''}>Homme</option><option value="Femme" ${p.gender==='Femme'?'selected':''}>Femme</option><option value="Autre" ${p.gender==='Autre'?'selected':''}>Autre</option></select></label>
      <label class="wide">E-mail<input value="${esc(state.user?.email||p.email||'')}" type="email" readonly disabled></label>
      <label>Téléphone<div class="phone-row phone-row-auto-v3"><span class="phone-prefix-v3">${esc(phoneMeta().code)}</span><input id="onPhone" value="${esc(normalizePhone(p.phone||"",phoneMeta()))}" type="tel" inputmode="numeric" maxlength="${phoneMeta().digits}" autocomplete="tel-national" placeholder="${phoneMeta().placeholder}" required></div><small class="phone-auto-note-v3">Pays détecté automatiquement : ${esc(phoneMeta().name)}. Entrez uniquement le numéro national.</small></label>
      <label>Pays actuel<input id="onCountry" value="${esc(phoneMeta().name)}" readonly disabled required></label>
      <label>Ville actuelle<input id="onCityCurrent" list="onMgCities" value="${esc(p.city_current||'')}" placeholder="Rechercher une ville…" autocomplete="off" required></label>
      <label>Ville d’origine / Province<input id="onCityOrigin" list="onMgProvinces" value="${esc(p.city_origin||'')}" placeholder="Rechercher une province…" autocomplete="off" required></label>
      ${cityListHTML('onMgCities',MG_CITIES)}${cityListHTML('onMgProvinces',MG_PROVINCES)}
    </div>
    <button class="primary big onboarding-submit-v24" data-action="complete-onboarding">Déverrouiller Tafaß</button>
    <p class="onboarding-lock-note-v24">🔒 Cette étape est obligatoire. L’application reste verrouillée tant que les informations ne sont pas validées.</p>`;
    view.classList.remove("hidden");
    $("auth")?.classList.remove("hidden");
    shell.scrollTop = 0;
  }

  async function completeOnboarding() {
    const first=$('onFirst')?.value.trim()||'', last=$('onLast')?.value.trim()||'', birth=$('onBirth')?.value||'', gender=$('onGender')?.value||'', phone=normalizePhone($('onPhone')?.value||'',phoneMeta()), country=phoneMeta().name, current=$('onCityCurrent')?.value.trim()||'', origin=$('onCityOrigin')?.value.trim()||'';
    if(!first||!last||!birth||!gender||!phone||!country||!current||!origin) return toast('Remplissez toutes les informations obligatoires.');
    if(!phoneMeta().test.test(phone)) return toast(`Numéro invalide pour ${phoneMeta().name}. Entrez uniquement les chiffres sans ${phoneMeta().code}.`);
    if(!validCity(current)) return toast('Sélectionnez une ville actuelle réelle dans la liste.');
    if(!validProvince(origin)) return toast('Sélectionnez une province réelle de Madagascar dans la liste.');
    const d=new Date(birth+'T00:00:00'), now=new Date();
    const age=now.getFullYear()-d.getFullYear()-((now.getMonth()<d.getMonth()||(now.getMonth()===d.getMonth()&&now.getDate()<d.getDate()))?1:0);
    if(age<13) return toast('Vous devez avoir au moins 13 ans.');
    const btn=document.querySelector('[data-action="complete-onboarding"]'); setLoading(btn,true,'Déverrouiller Tafaß');
    const row={id:state.user.id,first_name:first,last_name:last,email:state.user.email||'',birth,gender,phone,phone_code:phoneMeta().code,country,city_current:current,city_origin:origin,location:current,updated_at:new Date().toISOString()};
    try {
      const savePromise=(async()=>{
        const u=await sb.from('profiles').update(row).eq('id',state.user.id);
        if(!u.error && (u.data || u.count !== 0)) return u;
        const i=await sb.from('profiles').insert(row);
        return i;
      })();
      const result=await Promise.race([
        savePromise,
        new Promise(resolve=>setTimeout(()=>resolve({error:{message:'Supabase ne répond pas. Vérifiez votre connexion puis réessayez.'}}),10000))
      ]);
      if(result?.error){ setLoading(btn,false,'Déverrouiller Tafaß'); return toast('Impossible d’enregistrer le profil : '+result.error.message); }
      await loadProfile();
      const complete=Boolean(state.profile&&String(state.user.email||state.profile.email||'').trim()&&String(state.profile.first_name||'').trim()&&String(state.profile.last_name||'').trim()&&state.profile.birth&&String(state.profile.gender||'').trim()&&String(state.profile.phone||'').trim()&&String(state.profile.country||'').trim()&&String(state.profile.city_current||'').trim()&&String(state.profile.city_origin||'').trim());
      if(!complete){ setLoading(btn,false,'Déverrouiller Tafaß'); return toast('Le profil n’a pas été enregistré complètement. Réessayez.'); }
      $('oauthOnboardingView')?.remove(); $('auth')?.classList.add('hidden'); $('app')?.classList.remove('hidden'); state.entering=false;
      await loadPosts(); await setupRealtime(); await render(); toast('Compte complété. Bienvenue sur Tafaß.');
    } catch(e){ setLoading(btn,false,'Déverrouiller Tafaß'); toast(e?.message||'Impossible de valider le compte.'); }
  }

  async function enterApp() {
    if (state.entering) return;
    state.entering = true;
    $("app").classList.add("hidden");
    $("auth").classList.remove("hidden");
    document.body.classList.toggle("light", state.theme === "light");
    syncThemeButton();
    await loadProfile();
    if (!(await profileIsComplete())) {
      state.entering = false;
      showOAuthOnboarding();
      return;
    }
    await splashReady;
    $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
    await loadPosts(); await setupRealtime();
    state.entering = false;
    await render();
  }
  async function signInWithProvider(provider) {
    const allowed = ["google", "apple"];
    // Supabase must have automatic identity linking enabled. When a verified
    // Google/Apple e-mail already belongs to a confirmed account, Supabase
    // then reuses that account instead of creating a second profile.

    if (!allowed.includes(provider)) return;
    const btn = document.querySelector(`[data-oauth="${provider}"]`);
    if (btn) { btn.disabled = true; btn.classList.add("loading"); }
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo, queryParams: provider === "google" ? { access_type: "offline", prompt: "select_account" } : undefined }
      });
      if (error) throw error;
    } catch (e) {
      if (btn) { btn.disabled = false; btn.classList.remove("loading"); }
      const msg = String(e?.message || e || "Connexion impossible.");
      if ($("authMsg")) $("authMsg").textContent = msg.includes("provider") || msg.includes("not enabled")
        ? `La connexion ${provider === "google" ? "Google" : "Apple"} n’est pas encore activée dans Supabase.`
        : msg;
    }
  }

  function syncAuthBack() {
    const b = document.querySelector("[data-auth-back]");
    const loginVisible = !$("loginView")?.classList.contains("hidden");
    if (b) b.classList.toggle("hidden", loginVisible);
  }
  function showLogin() { ["signupView","forgotPasswordView","resetPasswordView"].forEach(id => $(id)?.classList.add("hidden")); $("loginView").classList.remove("hidden"); $("auth").classList.remove("hidden"); syncAuthBack(); }
  state.detectedCountry = detectCountry();
  let signupStep = 1;
  function setSignupStep(step) {
    signupStep = Math.max(1, Math.min(5, Number(step) || 1));
    document.querySelectorAll("[data-signup-step]").forEach(el => el.classList.toggle("active", Number(el.dataset.signupStep) === signupStep));
    document.querySelectorAll(".auth-step-indicator span").forEach((el, i) => el.classList.toggle("active", i < signupStep));
    const subtitles = {1:"Commençons par votre identité",2:"Ajoutez vos coordonnées",3:"Sécurisez votre compte",4:"Complétez votre profil",5:"Une dernière confirmation avant de créer votre compte"};
    if ($("signupStepSubtitle")) $("signupStepSubtitle").textContent = subtitles[signupStep];
    $("signupView")?.scrollIntoView({block:"start",behavior:"smooth"});
    const shell = document.querySelector(".auth-shell"); if (shell) shell.scrollTop = 0;
  }
  function validateSignupStep(step) {
    if (step === 1) {
      const first=$("firstName").value.trim(), last=$("lastName").value.trim();
      if(first.length < 2 || last.length < 2){ toast("Indiquez votre prénom et votre nom."); return false; }
    }
    if (step === 2) {
      const email=$("signupEmail").value.trim();
      if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast("Entrez une adresse e-mail valide."); return false; }
    }
    if (step === 3) {
      const password=$("signupPassword").value, confirm=$("signupPasswordConfirm").value;
      if(password.length < 8){ toast("Le mot de passe doit contenir au moins 8 caractères."); return false; }
      if(password !== confirm){ toast("Les deux mots de passe ne correspondent pas."); return false; }
    }
    if (step === 4 && $("birth")?.value) {
      const d=new Date($("birth").value+"T00:00:00");
      const now=new Date(); const age=now.getFullYear()-d.getFullYear()-((now.getMonth()<d.getMonth() || (now.getMonth()===d.getMonth() && now.getDate()<d.getDate()))?1:0);
      if(age<13){ toast("Vous devez avoir au moins 13 ans pour créer un compte."); return false; }
    }
    return true;
  }
  function showSignup() {
    ["loginView","forgotPasswordView","resetPasswordView"].forEach(id => $(id)?.classList.add("hidden"));
    $("signupView").classList.remove("hidden"); $("auth").classList.remove("hidden");
    syncAuthBack(); setSignupStep(1);
    $("signupMsg").textContent="";
    $("firstName")?.focus();
  }
  function showForgotPassword() {
    ["loginView","signupView","resetPasswordView"].forEach(id => $(id)?.classList.add("hidden"));
    $("forgotPasswordView")?.classList.remove("hidden");
    $("auth")?.classList.remove("hidden"); syncAuthBack();
    if ($("forgotEmail") && $("loginEmail")?.value.includes("@")) $("forgotEmail").value = $("loginEmail").value.trim();
    $("forgotEmail")?.focus();
  }
  function showResetPassword(message="") {
    ["loginView","signupView","forgotPasswordView"].forEach(id => $(id)?.classList.add("hidden"));
    $("resetPasswordView")?.classList.remove("hidden");
    $("auth")?.classList.remove("hidden"); syncAuthBack();
    if ($("resetMsg")) $("resetMsg").textContent = message;
  }
  function resetRedirectUrl() {
    return `${window.location.origin}${window.location.pathname}?reset=1`;
  }
  async function sendPasswordReset(e) {
    if (e) e.preventDefault();
    const email = $("forgotEmail")?.value.trim() || "";
    if (!email || !email.includes("@")) {
      if ($("forgotMsg")) $("forgotMsg").textContent = "Entrez une adresse e-mail valide.";
      $("forgotEmail")?.focus();
      return;
    }
    const btn=$("forgotPasswordSubmit");
    if(btn){ btn.disabled=true; btn.textContent="Envoi en cours…"; }
    if ($("forgotMsg")) $("forgotMsg").textContent="";
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: resetRedirectUrl() });
    if(btn){ btn.disabled=false; btn.textContent="Envoyer le lien de récupération"; }
    if(error) { if ($("forgotMsg")) $("forgotMsg").textContent = error.message; return; }
    if($("forgotMsg")) $("forgotMsg").textContent="Lien envoyé. Vérifiez votre boîte e-mail et vos spams, puis ouvrez le lien Tafaß pour définir votre nouveau mot de passe.";
  }
  async function saveResetPassword(e) {
    e.preventDefault();
    const password=$("resetPassword")?.value || "", confirm=$("resetPasswordConfirm")?.value || "";
    if(password.length < 6) return toast("Le mot de passe doit contenir au moins 6 caractères.");
    if(password !== confirm) return toast("Les deux mots de passe ne correspondent pas.");
    const btn=$("resetPasswordSubmit");
    if(btn){ btn.disabled=true; btn.textContent="Enregistrement…"; }
    const { error } = await sb.auth.updateUser({ password });
    if(error){ if(btn){btn.disabled=false;btn.textContent="Enregistrer le nouveau mot de passe";} return toast(error.message); }
    if($("resetMsg")) $("resetMsg").textContent="Mot de passe modifié avec succès. Ouverture de votre compte…";
    toast("Mot de passe modifié avec succès.");
    $("resetPassword").value=""; $("resetPasswordConfirm").value="";
    // La session de récupération reste valide : aucune reconnexion manuelle n'est nécessaire.
    history.replaceState(null, "", window.location.pathname);
    $("auth")?.classList.add("hidden");
    $("app")?.classList.remove("hidden");
    state.user = (await sb.auth.getUser()).data.user || state.user;
    await enterApp();
  }

  document.addEventListener("click", async e => {
    const actionEl = e.target.closest("[data-action]");
    if (actionEl) {
      e.preventDefault();
      if (pageLoading && !["close-modal","confirm-logout"].includes(actionEl.dataset.action)) return;
    } else {
      const routeEl = e.target.closest("[data-route]");
      if (routeEl) { e.preventDefault(); if (pageLoading) return; navigate(routeEl.dataset.route); return; }
      return;
    }
    const action = actionEl.dataset.action, id = actionEl.dataset.id;
    const notificationId = actionEl.dataset.notification;
    if (notificationId && action !== "mark-read") { await sb.from("notifications").update({is_read:true}).eq("id",notificationId).eq("user_id",state.user.id); updateBadges(); }
    if (action === "react") return showReactions(id);
    if (action === "comment") { $("comment-"+id)?.focus(); return; }
    if (action === "send-comment") return addComment(id);
    if (action === "reply-comment") { const box = $("reply-"+id); if (box) { box.innerHTML = `<div class="reply-form"><input id="reply-input-${esc(id)}" placeholder="Votre réponse..."><button data-action="send-reply" data-id="${esc(id)}">Envoyer</button></div>`; $("reply-input-"+id)?.focus(); } return; }
    if (action === "send-reply") { const c = await sb.from("comments").select("post_id").eq("id",id).maybeSingle(); if(c.error || !c.data) return toast("Commentaire introuvable"); return addComment(c.data.post_id,id); }
    if (action === "delete-comment") return deleteComment(id);
    if (action === "share") return sharePost(id);
    if (action === "post-menu") {
      let post = state.posts.find(x => x.id === id);
      if (!post) post = (await sb.from("posts").select("*").eq("id", id).maybeSingle()).data;
      const owner = post?.user_id === state.user.id;
      return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">PUBLICATION</span><h3>Actions</h3><div class="menu-grid"><button class="menu-card" data-action="save-post" data-id="${esc(id)}"><span class="menu-icon">♡</span><span><b>Enregistrer</b><small>Disponible pour tous</small></span></button>${owner ? `<button class="menu-card" data-action="edit-post" data-id="${esc(id)}"><span class="menu-icon">✎</span><span><b>Modifier</b><small>Uniquement votre publication</small></span></button><button class="menu-card danger-card" data-action="delete-post" data-id="${esc(id)}"><span class="menu-icon">⌫</span><span><b>Supprimer</b><small>Vous êtes le propriétaire</small></span></button>` : `<button class="menu-card" data-action="report-post" data-id="${esc(id)}"><span class="menu-icon">⚑</span><span><b>Signaler</b><small>Signaler cette publication</small></span></button>`}</div></div>`);
    }
    if (action === "delete-search-history") {
      const r=await sb.from("search_history").delete().eq("id",id).eq("user_id",state.user.id);
      if(r.error) return toast(r.error.message);
      toast("Recherche supprimée");
      return servicePage("activity");
    }
    if (action === "clear-search-history") {
      const r=await sb.from("search_history").delete().eq("user_id",state.user.id);
      if(r.error) return toast(r.error.message);
      toast("Historique de recherche effacé");
      return servicePage("activity");
    }
    if (action === "page-back") return goBack();
    if (action === "auth-onboarding-back") { state.entering=false; state.user=null; sb.auth.signOut().catch(()=>{}); return showLogin(); }
    if (action === "menu-route") { const target = actionEl.dataset.routeTarget; if (target) navigate(target); return; }
    if (action === "retry-route") { const target = actionEl.dataset.routeTarget; if (target) { state.renderToken++; state.route=target; await render(); } return; }
    if (action === "menu-info") { settingInfo(actionEl.dataset.name || "Menu"); return; }
    if (action === "menu-service") return servicePage(actionEl.dataset.service);
    if (action === "help-item") return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>${esc(actionEl.dataset.name||"Aide")}</h3><p class="muted">Consultez les réglages de Tafaß ou utilisez les boutons de signalement disponibles sur les profils et publications.</p><button class="primary big" data-action="close-modal">Fermer</button></div>`);
    if (action === "payment-request") return createPaymentRequest(actionEl.dataset.method);
    if (action === "save-post") { const r=await sb.from("saved_posts").upsert({user_id:state.user.id,post_id:id},{onConflict:"user_id,post_id"}); toast(r.error?r.error.message:"Publication enregistrée"); closeModal(); return; }
    if (action === "edit-post") return editPost(id);
    if (action === "save-post-edit") return savePostEdit(id);
    if (action === "delete-post") return deletePost(id);
    if (action === "report-post") return reportPost(id);
    if (action === "add-friend") return addFriend(id);
    if (action === "accept-friend") return handleFriend(id,"accepted");
    if (action === "decline-friend") return handleFriend(id,"declined");
    if (action === "friends-tab") return friendsPage(actionEl.dataset.tab);
    if (action === "view-profile") {
      return openUserProfile(id);
    }
    if (action === "open-notification-post") return openNotificationPost(notificationId || id);
    if (action === "notification-read") return notificationRead(id);
    if (action === "search-post") {
      const p=(await sb.from("posts").select("*").eq("id",id).maybeSingle()).data;
      if(!p)return toast("Publication introuvable");
      const ids=[p.user_id].filter(Boolean); const pp=ids.length?await sb.from("profiles").select("*").in("id",ids):{data:[]}; const author=(pp.data||[])[0]||state.profile;
      return openModal(`<div class="modal-box post-preview-modal"><button class="modal-close" data-action="close-modal">×</button>${await postHTML({...p,author})}</div>`);
    }
    if (action === "profile-tab") return profilePage(actionEl.dataset.tab);
    if (action === "public-profile-tab") return openUserProfileTab(id, actionEl.dataset.tab);
    if (action === "edit-profile") return editProfile();
    if (action === "account-settings") return accountSettings();
    if (action === "save-account-settings") return saveAccountSettings();
    if (action === "complete-onboarding") return completeOnboarding();
    if (action === "save-profile") return saveProfile();
    if (action === "profile-more") return profileMore(id);
    if (action === "message-user") return startConversation(id);
    if (action === "remove-friend") return removeFriend(id);
    if (action === "report-profile") return reportProfile(id);
    if (action === "block-profile") return blockProfile(id);
    if (action === "unblock-profile") return unblockProfile(id);
    if (action === "new-message") return newMessage();
    if (action === "start-conversation") return startConversation(id);
    if (action === "open-conversation") return openConversation(id);
    if (action === "mark-read") return markRead();
    if (action === "theme") return toggleTheme();
    if (action === "create-tafab-listing") return createTafabListing();
    if (action === "save-tafab-listing") return saveTafabListing();
    if (action === "create-tafab-ad") return createTafabAd();
    if (action === "save-tafab-ad") return saveTafabAd();
    if (action === "tafab-message") return contactTafabListing(id);
    if (action === "tafab-contact") return contactTafabListing(id);
    if (action === "send-tafab-message") return sendTafabMessage(id);
    if (action === "tafab-info") { const x=(await sb.from("tafab_listings").select("*").eq("id",id).maybeSingle()).data; if(!x)return toast("Offre introuvable"); return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">OFFRE TAFAß</span><h3>${esc(x.title)}</h3><p>${esc(x.description||"")}</p><p class="muted">${esc(x.location||"")} ${x.price!=null?"• "+esc(x.price)+" "+esc(x.currency||"MGA"):""}</p><button class="primary big" data-action="tafab-contact" data-id="${esc(x.id)}">Contacter le vendeur</button></div>`); }
    if (action === "security-settings") return securitySettings();
    if (action === "setting") return settingInfo(actionEl.dataset.name);
    if (action === "notifications-settings") {
      const cfg = (await sb.from("user_settings").select("notifications_enabled").eq("user_id",state.user.id).maybeSingle()).data;
      return saveUserSetting({ notifications_enabled: !(cfg?.notifications_enabled !== false) });
    }
    if (action === "privacy-settings") return openPrivacySettings();
    if (action === "save-privacy") return saveUserSetting({ profile_visibility: $("privacyVisibility").value });
    if (action === "save-setting-toggle") { const key=actionEl.dataset.settingKey; return saveUserSetting({ [key]: !!$("settingToggle")?.checked }); }
    if (action === "save-search-privacy") return saveUserSetting({ allow_search_by_phone: !!$("allowSearchPhone")?.checked, allow_search_by_email: !!$("allowSearchEmail")?.checked });
    if (action === "save-language") return saveUserSetting({ language: $("languageSelect")?.value || "fr" });
    if (["friend-settings","message-settings","search-privacy-settings","language-settings","message-notification-settings","friend-notification-settings","reaction-notification-settings","comment-notification-settings"].includes(action)) return openSettingControl(action);
    if (action === "create-group") return openModal(`<div class="modal-box entity-create-modal-v2"><button class="modal-close" data-action="close-modal">×</button><div class="create-hero-v2 group"><span class="create-icon-v2 group-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M2.8 20c.6-4 2.5-6 5.2-6s4.6 2 5.2 6M13.5 15c3-.2 5 1.5 5.7 5"/></svg></span><div><span class="eyebrow">TAFAß • GROUPES</span><h3>Créer un groupe</h3><p>Créez votre espace communautaire avec une identité claire.</p></div></div><div class="create-grid-v2"><label class="create-field-v2 wide"><span>Nom du groupe</span><input id="newGroupName" maxlength="80" placeholder="Ex. Passion Madagascar"></label><label class="create-field-v2 wide"><span>Description</span><textarea id="newGroupDesc" maxlength="500" placeholder="Présentez votre groupe…"></textarea></label><label class="create-upload-v2"><span>Avatar du groupe</span><input id="newGroupAvatar" type="file" accept="image/jpeg,image/png,image/webp"><small>Optionnel • avatar par défaut automatique</small></label><label class="create-upload-v2"><span>Photo de couverture</span><input id="newGroupCover" type="file" accept="image/jpeg,image/png,image/webp"><small>Optionnel</small></label></div><button class="primary big create-submit-v2" data-action="save-group"><span>＋</span> Créer le groupe</button></div>`);
    if (action === "save-group") {
      const name=$("newGroupName")?.value.trim(); if(!name)return toast("Entrez un nom.");
      const r=await sb.from("groups").insert({owner_id:state.user.id,name,description:$("newGroupDesc")?.value.trim()||"",privacy:"public"}).select().single();
      if(r.error)return toast(r.error.message);
      const g=r.data;
      await sb.from("group_members").insert({group_id:g.id,user_id:state.user.id,role:"admin"});
      const patch={};
      for(const [input,key] of [["newGroupAvatar","avatar_url"],["newGroupCover","cover_url"]]){ const file=$(input)?.files?.[0]; if(!file) continue; const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); const path=`${state.user.id}/group-${g.id}-${key}-${crypto.randomUUID()}.${ext}`; const up=await sb.storage.from('profile-media').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'}); if(up.error){ toast('Groupe créé. Image non envoyée : '+up.error.message); break; } patch[key]=sb.storage.from('profile-media').getPublicUrl(path).data.publicUrl; }
      if(Object.keys(patch).length) await sb.from('groups').update(patch).eq('id',g.id).eq('owner_id',state.user.id);
      closeModal(); toast("Groupe créé"); return genericListPage("groups");
    }
    if (action === "create-page") return openModal(`<div class="modal-box entity-create-modal-v2"><button class="modal-close" data-action="close-modal">×</button><div class="create-hero-v2 page"><span class="create-icon-v2 page-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg></span><div><span class="eyebrow">TAFAß • PAGES</span><h3>Créer une Page</h3><p>Donnez à votre Page une identité professionnelle et claire.</p></div></div><div class="create-grid-v2"><label class="create-field-v2 wide"><span>Nom de la Page</span><input id="newPageName" maxlength="80" placeholder="Nom de la Page"></label><label class="create-field-v2"><span>Catégorie</span><select id="newPageCategory" aria-label="Catégorie de la Page"><option value="" selected disabled>Choisir une catégorie</option>${pageCategoryOptions()}</select><small class="create-select-hint">Plus de 50 catégories disponibles • choisissez une catégorie.</small></label><label class="create-upload-v2"><span>Avatar de la Page</span><input id="newPageAvatar" type="file" accept="image/jpeg,image/png,image/webp"><small>Optionnel • avatar par défaut automatique</small></label><label class="create-field-v2 wide"><span>Présentation</span><textarea id="newPageBio" maxlength="500" placeholder="Présentez votre Page…"></textarea></label><label class="create-upload-v2 wide"><span>Photo de couverture</span><input id="newPageCover" type="file" accept="image/jpeg,image/png,image/webp"><small>Optionnel</small></label></div><button class="primary big create-submit-v2" data-action="save-page"><span>＋</span> Créer la Page</button></div>`);
    if (action === "save-page") {
      const name=$("newPageName")?.value.trim(); if(!name)return toast("Entrez un nom.");
      const r=await sb.from("pages").insert({owner_id:state.user.id,name,category:$("newPageCategory")?.value.trim()||"Autre",bio:$("newPageBio")?.value.trim()||""}).select().single();
      if(r.error)return toast(r.error.message);
      const pg=r.data; const patch={};
      for(const [input,key] of [["newPageAvatar","logo_url"],["newPageCover","cover_url"]]){ const file=$(input)?.files?.[0]; if(!file) continue; const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); const path=`${state.user.id}/page-${pg.id}-${key}-${crypto.randomUUID()}.${ext}`; const up=await sb.storage.from('profile-media').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'}); if(up.error){ toast('Page créée. Image non envoyée : '+up.error.message); break; } patch[key]=sb.storage.from('profile-media').getPublicUrl(path).data.publicUrl; }
      if(Object.keys(patch).length) await sb.from('pages').update(patch).eq('id',pg.id).eq('owner_id',state.user.id);
      closeModal(); toast("Page créée"); return genericListPage("pages");
    }
    if (action === "page-open") {
      const x=(await sb.from("pages").select("*").eq("id",id).maybeSingle()).data;
      if(!x)return toast("Page introuvable");
      const [f,c]=await Promise.all([
        sb.from("page_followers").select("id").eq("page_id",id).eq("user_id",state.user.id).maybeSingle(),
        sb.from("page_followers").select("id",{count:"exact",head:true}).eq("page_id",id)
      ]);
      const owner=x.owner_id===state.user.id;
      return openModal(`<div class="modal-box entity-detail-modal">
        <button class="modal-close" data-action="close-modal">×</button>
        <div class="detail-cover" ${x.cover_url?`style="background-image:url('${esc(x.cover_url)}')"`:""}></div>
        ${entityAvatarHTML(x,"page","detail-logo")}
        <span class="eyebrow">TAFAß • PAGE</span><h3>${esc(x.name)}</h3><p>${esc(x.bio||"Aucune présentation.")}</p>
        <div class="detail-stats"><span><b>${c.count||0}</b> abonnés</span><span>${esc(x.category||"Autre")}</span></div>
        <div class="detail-actions">${owner?`<button class="ghost-action" data-action="edit-page" data-id="${esc(id)}">Modifier</button>`:""}<button class="primary big" data-action="toggle-page-follow" data-id="${esc(id)}">${f.data?"Ne plus suivre":"Suivre la Page"}</button></div>
      </div>`);
    }
    if (action === "group-open") {
      const x=(await sb.from("groups").select("*").eq("id",id).maybeSingle()).data;
      if(!x)return toast("Groupe introuvable");
      const [m,c]=await Promise.all([
        sb.from("group_members").select("id").eq("group_id",id).eq("user_id",state.user.id).maybeSingle(),
        sb.from("group_members").select("id",{count:"exact",head:true}).eq("group_id",id)
      ]);
      const owner=x.owner_id===state.user.id;
      return openModal(`<div class="modal-box entity-detail-modal">
        <button class="modal-close" data-action="close-modal">×</button>
        <div class="detail-cover" ${x.cover_url?`style="background-image:url('${esc(x.cover_url)}')"`:""}></div>
        ${entityAvatarHTML(x,"group","detail-logo")}<span class="eyebrow">TAFAß • GROUPE</span><h3>${esc(x.name)}</h3>
        <p>${esc(x.description||"Aucune description.")}</p>
        <div class="detail-stats"><span><b>${c.count||0}</b> membres</span><span>${esc(x.privacy||"public")}</span></div>
        <div class="detail-actions">${owner?`<button class="ghost-action" data-action="edit-group" data-id="${esc(id)}">Modifier</button>`:""}<button class="primary big" data-action="toggle-group-member" data-id="${esc(id)}">${m.data?"Quitter le groupe":"Rejoindre le groupe"}</button></div>
      </div>`);
    }
    if (action === "edit-page") {
      const x=(await sb.from("pages").select("*").eq("id",id).maybeSingle()).data;
      if(!x || x.owner_id!==state.user.id) return toast("Action non autorisée.");
      return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • PAGE</span><h3>Modifier la Page</h3><label>Nom<input id="editPageName" value="${esc(x.name)}"></label><label>Catégorie<select id="editPageCategory">${pageCategoryOptions(x.category||"Autre")}</select></label><label>Présentation<textarea id="editPageBio">${esc(x.bio||"")}</textarea></label><button class="primary big" data-action="save-page-edit" data-id="${esc(id)}">Enregistrer</button></div>`);
    }
    if (action === "save-page-edit") {
      const r=await sb.from("pages").update({name:$("editPageName")?.value.trim(),category:$("editPageCategory")?.value.trim()||"Autre",bio:$("editPageBio")?.value.trim()||"",updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",state.user.id);
      if(r.error)return toast(r.error.message); closeModal(); toast("Page mise à jour"); return genericListPage("pages");
    }
    if (action === "edit-group") {
      const x=(await sb.from("groups").select("*").eq("id",id).maybeSingle()).data;
      if(!x || x.owner_id!==state.user.id) return toast("Action non autorisée.");
      return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • GROUPE</span><h3>Modifier le groupe</h3><label>Nom<input id="editGroupName" value="${esc(x.name)}"></label><label>Description<textarea id="editGroupDesc">${esc(x.description||"")}</textarea></label><label>Confidentialité<select id="editGroupPrivacy"><option value="public" ${x.privacy==="public"?"selected":""}>Public</option><option value="private" ${x.privacy==="private"?"selected":""}>Privé</option></select></label><button class="primary big" data-action="save-group-edit" data-id="${esc(id)}">Enregistrer</button></div>`);
    }
    if (action === "save-group-edit") {
      const r=await sb.from("groups").update({name:$("editGroupName")?.value.trim(),description:$("editGroupDesc")?.value.trim()||"",privacy:$("editGroupPrivacy")?.value||"public",updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",state.user.id);
      if(r.error)return toast(r.error.message); closeModal(); toast("Groupe mis à jour"); return genericListPage("groups");
    }
    if (action === "toggle-page-follow") { const f=(await sb.from("page_followers").select("id").eq("page_id",id).eq("user_id",state.user.id).maybeSingle()).data; const r=f?await sb.from("page_followers").delete().eq("id",f.id):await sb.from("page_followers").insert({page_id:id,user_id:state.user.id}); if(r.error)return toast(r.error.message); closeModal(); toast(f?"Page retirée de vos suivis":"Page suivie"); if(state.route==="pages") await genericListPage("pages"); return; }
    if (action === "toggle-group-member") { const m=(await sb.from("group_members").select("id").eq("group_id",id).eq("user_id",state.user.id).maybeSingle()).data; const r=m?await sb.from("group_members").delete().eq("id",m.id):await sb.from("group_members").insert({group_id:id,user_id:state.user.id,role:"member"}); if(r.error)return toast(r.error.message); closeModal(); toast(m?"Vous avez quitté le groupe":"Vous avez rejoint le groupe"); if(state.route==="groups") await genericListPage("groups"); return; }
    if (action === "tafab-ad") {
      const a=(await sb.from("tafab_ads").select("*").eq("id",id).maybeSingle()).data;
      if(!a)return toast("Publication introuvable");
      return openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>${esc(a.title)}</h3><p class="muted">${esc(a.description||"")}</p><button class="primary big" data-action="close-modal">Fermer</button></div>`);
    }
    if (action === "change-password") return changePassword();
    if (action === "logout") return logout();
    if (action === "confirm-logout") return confirmLogout();
    if (action === "close-modal") return closeModal();
  });

  document.querySelectorAll("[data-password-toggle]").forEach(btn => btn.addEventListener("click", () => {
    const input = $(btn.dataset.passwordToggle); if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  }));
  $("showSignup").addEventListener("click", showSignup);
  document.querySelector("[data-auth-back]")?.addEventListener("click", showLogin);
  $("showLogin").addEventListener("click", showLogin);
  $("forgotPassword")?.addEventListener("click", showForgotPassword);
  $("forgotBackLogin")?.addEventListener("click", showLogin);
  $("forgotPasswordForm")?.addEventListener("submit", sendPasswordReset);
  $("resetPasswordForm")?.addEventListener("submit", saveResetPassword);
  document.querySelectorAll(".signup-next").forEach(btn => btn.addEventListener("click", () => {
    if (validateSignupStep(signupStep)) setSignupStep(Number(btn.dataset.nextStep));
  }));
  document.querySelectorAll(".signup-prev").forEach(btn => btn.addEventListener("click", () => setSignupStep(Number(btn.dataset.prevStep))));
  $("loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const value = $("loginEmail").value.trim(), password = $("loginPassword").value;
    $("authMsg").textContent = "Connexion…";
    let email = value;
    if (!value.includes("@")) {
      const r = await sb.rpc("tafa_lookup_email_by_phone", { p_phone: value });
      email = r.data || "";
    }
    if (!email) { $("authMsg").textContent = "Compte introuvable."; return; }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    $("authMsg").textContent = error ? error.message : "";
  });
  $("signupForm").addEventListener("submit", async e => {
    e.preventDefault();
    const first=$("firstName").value.trim(), last=$("lastName").value.trim(), email=$("signupEmail").value.trim(), password=$("signupPassword").value, confirm=$("signupPasswordConfirm")?.value || "";
    if (!validateSignupStep(1) || !validateSignupStep(2) || !validateSignupStep(3) || !validateSignupStep(4)) return;
    if ($("birth")?.value) { const d=new Date($("birth").value+"T00:00:00"); const age=new Date().getFullYear()-d.getFullYear()-((new Date().getMonth()<d.getMonth() || (new Date().getMonth()===d.getMonth() && new Date().getDate()<d.getDate()))?1:0); if(age<13) return toast("Vous devez avoir au moins 13 ans pour créer un compte."); }
    if (!$("terms").checked) return toast("Acceptez les conditions pour continuer.");
    $("signupMsg").textContent = "Création du compte…";
    const signupPhone=normalizePhone($("phone").value,COUNTRY_META.MG); if(!COUNTRY_META.MG.test.test(signupPhone)) return toast('Numéro malgache invalide. Exemple : 330000000.'); const meta = { first_name:first, last_name:last, phone:signupPhone, phone_code:'+261', country:'Madagascar', birth:$("birth").value||null };
    const { data, error } = await sb.auth.signUp({ email, password, data: meta });
    if (error) { $("signupMsg").textContent = error.message; return; }
    if (data.session) {
      const patch = { first_name:first,last_name:last,email,phone:signupPhone,phone_code:'+261',country:'Madagascar',birth:$("birth").value||null,updated_at:new Date().toISOString() };
      const profileResult = await sb.from("profiles").upsert(patch, { onConflict:"id" });
      if (profileResult.error) {
        console.error("Tafaß profile creation:", profileResult.error);
        $("signupMsg").textContent = "Compte créé, mais le profil n'a pas pu être finalisé. Reconnectez-vous pour terminer la configuration.";
        return;
      }
      $("signupMsg").textContent="Compte créé.";
    } else $("signupMsg").textContent="Compte créé. Vérifiez votre e-mail si la confirmation est activée.";
  });
  document.querySelectorAll("[data-oauth]").forEach(btn => btn.addEventListener("click", () => signInWithProvider(btn.dataset.oauth)));
  $("themeBtn").addEventListener("click", toggleTheme);
  syncThemeButton();
  $("modal").addEventListener("click", e => { if (e.target.id === "modal") closeModal(); });
  $("globalSearch").addEventListener("keydown", e => { if (e.key === "Enter") { const q=e.target.value; navigate("search"); setTimeout(()=>{ const input=$("searchInput"); if(input){input.value=q; searchPage(q);} },0); } });
  window.addEventListener("hashchange", () => { const r=location.hash.slice(1); if(routes.includes(r) && r !== state.route) navigate(r); });
  const initialRoute = routes.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  state.route = initialRoute; state.navStack = [initialRoute];

  document.body.classList.toggle("light", state.theme === "light");

  // Splash stable : animation courte, puis sortie dès que l'initialisation est prête.
  const splashStartedAt = Date.now();
  const SPLASH_MIN_MS = 1200;
  const SPLASH_MAX_MS = 3200;
  let splashFinished = false;
  let splashResolve;
  const splashReady = new Promise(resolve => { splashResolve = resolve; });
  let splashTimer = null;
  const finishSplash = () => {
    if (splashFinished) return;
    const elapsed = Date.now() - splashStartedAt;
    const wait = Math.max(0, SPLASH_MIN_MS - elapsed);
    clearTimeout(splashTimer);
    splashTimer = setTimeout(() => {
      if (splashFinished) return;
      splashFinished = true;
      splashResolve?.(true);
      document.documentElement.classList.remove("app-boot");
      const splash = $("splash");
      if (!splash) return;
      splash.classList.add("splash-hide");
      setTimeout(() => splash.remove(), 420);
    }, wait);
  };
  const splashFallback = setTimeout(finishSplash, SPLASH_MAX_MS);

  sb.auth.onAuthStateChange((event, session) => {
    state.user = session?.user || null;
    if (event === "PASSWORD_RECOVERY") {
      setTimeout(() => showResetPassword(), 0);
      return;
    }
    setTimeout(() => {
      if (state.user) enterApp().catch(err => { console.error("Tafaß auth:", err); state.entering=false; showLogin(); });
      else { $("app").classList.add("hidden"); showLogin(); }
    }, 0);
  });

  (async () => {
    try {
      const { data } = await sb.auth.getSession();
      state.user = data.session?.user || null;
      if (state.user && location.search.includes("reset=1")) showResetPassword();
      else if (state.user) await enterApp(); else showLogin();
    } catch (err) {
      console.error("Tafaß initialisation:", err);
      showLogin();
    } finally {
      clearTimeout(splashFallback);
      finishSplash();
    }
  })();

  // Empêche la copie du contenu de l'application, tout en laissant les champs
  // de formulaire utilisables normalement.
  const isFormField = el => !!el?.closest?.("input, textarea, select, [contenteditable=\"true\"]");
  document.addEventListener("contextmenu", e => {
    if (!isFormField(e.target)) e.preventDefault();
  });
  document.addEventListener("copy", e => {
    if (!isFormField(e.target)) e.preventDefault();
  });
  document.addEventListener("cut", e => {
    if (!isFormField(e.target)) e.preventDefault();
  });
  document.addEventListener("dragstart", e => e.preventDefault());
  document.addEventListener("keydown", e => {
    if (isFormField(e.target)) return;
    const key = String(e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ["c", "x", "a", "u", "s"].includes(key)) {
      e.preventDefault();
    }
  });
})();
