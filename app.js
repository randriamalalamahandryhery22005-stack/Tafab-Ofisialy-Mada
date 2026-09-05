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
    channel: null, theme: "dark", entering: false, loggingOut: false, composerOpen: false, composerBackground: "plain", composerLocation: "",
    composerDraftText: "", composerFile: null, composerVisibility: "public", composerMeta: {},
    liveFeedChannel: null, conversationChannel: null, activeLive: null,
    profileTab: "posts", reactionSettingsCache:new Map(), locationWatchId:null, friendsTab: "suggestions", pagesTab: "mine", groupsTab: "mine", groupSort: "recent", selectedConversation: null, viewingProfileId: null, renderToken: 0, activePage: null, entityBackRoute: null
  };

  // Production network/realtime guard: keeps the UI honest when connectivity changes.
  const realtimeRuntime = { retryTimer:null, retryCount:0, lastStatus:"", reconnecting:false };
  function networkBanner(message, mode="") {
    const el=$("networkStatus"); if(!el)return;
    if(!message){ el.hidden=true; el.className="network-status"; el.textContent=""; return; }
    el.hidden=false; el.className=`network-status ${mode}`; el.textContent=message;
  }
  function scheduleRealtimeReconnect(){
    if(!state.user || realtimeRuntime.retryTimer)return;
    const delay=Math.min(30000,1000*Math.pow(2,Math.min(realtimeRuntime.retryCount,5)));
    realtimeRuntime.retryCount++; realtimeRuntime.reconnecting=true;
    networkBanner("Connexion temps réel…", "reconnecting");
    realtimeRuntime.retryTimer=setTimeout(async()=>{
      realtimeRuntime.retryTimer=null;
      try{ await setupRealtime(); realtimeRuntime.retryCount=0; realtimeRuntime.reconnecting=false; networkBanner(""); }
      catch(e){ console.warn("Tafaß realtime reconnect:",e); realtimeRuntime.reconnecting=false; scheduleRealtimeReconnect(); }
    },delay);
  }
  function handleConnectivity(){
    if(!navigator.onLine){ networkBanner("Hors connexion — vos données seront resynchronisées au retour du réseau.","offline"); return; }
    if(state.user){ scheduleRealtimeReconnect(); } else networkBanner("");
  }
  window.addEventListener("offline",handleConnectivity);
  window.addEventListener("online",()=>{ networkBanner("Réseau retrouvé — synchronisation…","reconnecting"); realtimeRuntime.retryCount=0; realtimeRuntime.reconnecting=false; if(state.user) setupRealtime().finally(()=>setTimeout(()=>networkBanner(""),700)); else networkBanner(""); });

  const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%232d7cff'/%3E%3Cstop offset='.55' stop-color='%23745cff'/%3E%3Cstop offset='1' stop-color='%2310b8a6'/%3E%3C/linearGradient%3E%3ClinearGradient id='h' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23ffffff' stop-opacity='.9'/%3E%3Cstop offset='1' stop-color='%23dce8ff' stop-opacity='.7'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='256' height='256' rx='128' fill='url(%23g)'/%3E%3Ccircle cx='128' cy='101' r='47' fill='url(%23h)'/%3E%3Cpath d='M52 218c10-47 38-70 76-70s66 23 76 70' fill='url(%23h)'/%3E%3Ccircle cx='128' cy='128' r='112' fill='none' stroke='%23ffffff' stroke-opacity='.22' stroke-width='5'/%3E%3C/svg%3E";
  function avatarHTML(p, cls = "avatar") {
    const url = p?.avatar_url || DEFAULT_AVATAR;
    return `<span class="${cls} default-avatar-image"><img src="${esc(url)}" alt="Avatar"></span>`;
  }
  function entityAvatarHTML(entity, type = "page", cls = "entity-logo") {
    const url = entity?.logo_url || entity?.avatar_url || entity?.cover_url || DEFAULT_AVATAR;
    return `<div class="${cls} entity-default-avatar-image ${type}"><img src="${esc(url)}" alt="Avatar"></div>`;
  }

  const PAGE_CATEGORIES = [
    "Agriculture et élevage","Alimentation et boissons","Animaux","Art et culture","Automobile","Beauté et soins","Blog personnel","Commerce","Communauté","Conseil et services","Cuisine et gastronomie","Éducation","Électronique","Entreprise","Événementiel","Finance","Fitness et sport","Formation professionnelle","Hôtellerie","Immobilier","Informatique","Internet et technologie","Jeux vidéo","Juridique","Maison et décoration","Mode et vêtements","Médias et actualités","Musique","Organisation","Photographie","Politique et société","Produits locaux","Publicité et marketing","Restaurant","Santé et bien-être","Sciences","Services professionnels","Shopping","Tourisme et voyage","Transport","Vente au détail","Vidéos et créateurs","Association","Artisanat","Banque et assurance","Cinéma","Club","Cosmétiques","Développement personnel","Éditions et livres","Environnement","Famille et parentalité","Industrie","Journalisme","Librairie","Logistique","Marché et marketplace","Musée","Non lucratif","Parc et loisirs","Podcast","Radio","Recherche","Réseaux sociaux","Sécurité","Télécommunications","Université","Autre"
  ];
  function pageCategoryOptions(selected = "") {
    return PAGE_CATEGORIES.map(c => `<option value="${esc(c)}" ${String(selected||"") === c ? "selected" : ""}>${esc(c)}</option>`).join("");
  }

  function nameOf(p) { return [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Membre Tafaß"; }
  const blockedCache={ids:new Set(),loadedAt:0,promise:null};
  async function getBlockedIds(force=false){
    if(!state.user)return new Set();
    if(!force&&blockedCache.promise)return blockedCache.promise;
    if(!force&&Date.now()-blockedCache.loadedAt<15000)return blockedCache.ids;
    blockedCache.promise=(async()=>{const q=await sb.from("blocked_profiles").select("blocker_id,blocked_id").or(`blocker_id.eq.${state.user.id},blocked_id.eq.${state.user.id}`);const ids=new Set();(q.data||[]).forEach(x=>{if(x.blocker_id===state.user.id)ids.add(x.blocked_id);else if(x.blocked_id===state.user.id)ids.add(x.blocker_id)});blockedCache.ids=ids;blockedCache.loadedAt=Date.now();blockedCache.promise=null;return ids})().catch(()=>{blockedCache.promise=null;return blockedCache.ids});
    return blockedCache.promise;
  }
  async function isBlockedBetween(id){if(!state.user||!id||id===state.user.id)return false;return (await getBlockedIds()).has(id)}
  async function denyIfBlocked(id,msg="Cette personne est bloquée. Les interactions sont indisponibles."){if(await isBlockedBetween(id)){toast(msg);return true}return false}
  const filterBlocked=(rows,field="user_id")=>(rows||[]).filter(x=>!blockedCache.ids.has(x?.[field]));
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
      page_follow_invite: "vous invite à suivre une Page.",
      group_join: "a rejoint votre groupe.",
      comment_like: "a réagi à votre commentaire."
    };
    return map[n?.type] || n?.message || "a effectué une nouvelle activité.";
  }
  function notificationTarget(n, actor) {
    if (n?.type === "message" && n?.entity_id) return { action:"open-conversation", id:n.entity_id };
    if (["page_follow","page_follow_invite"].includes(n?.type) && n?.entity_id) return { action:"page-open", id:n.entity_id };
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
    // Tafaß uses the dark premium interface as the single supported theme.
    state.theme = "dark";
    if (state.user) await sb.from("user_settings").upsert({user_id:state.user.id,theme:"dark"},{onConflict:"user_id"});
    const sideName = $("sideName"); if (sideName) sideName.textContent = nameOf(state.profile);
    const sideAvatar = $("sideAvatar"); if (sideAvatar) { sideAvatar.outerHTML = avatarHTML(state.profile, "avatar").replace("<span ", '<span id="sideAvatar" '); }
  }

  async function loadPosts() {
    if (!state.user) return;
    await getBlockedIds();
    const { data, error } = await sb.from("posts").select("*").order("created_at", { ascending: false }).limit(60);
    state.posts = error ? [] : filterBlocked(data || [],"user_id");
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

  function pageModeActive(){ return !!state.activePage?.id; }
  function pageModeLabel(){ return pageModeActive() ? (state.activePage.name || "Page Tafaß") : "Mon compte"; }
  function syncIdentityUI(){
    document.body.classList.toggle("page-mode-active", pageModeActive());
    const p = pageModeActive() ? state.activePage : state.profile;
    const nameEl = $("sideName"), avatarEl = $("sideAvatar");
    if(nameEl) nameEl.textContent = pageModeActive() ? p.name : nameOf(p);
    if(avatarEl) avatarEl.outerHTML = entityAvatarHTML(p, "page", "avatar").replace("<div ", '<span id="sideAvatar" ').replace("</div>", "</span>");
    const logo = document.querySelector(".logo-button strong"); if(logo) logo.textContent = pageModeActive() ? p.name : "Tafaß";
    const logoMark = document.querySelector(".logo-button .mini-logo"); if(logoMark) logoMark.textContent = pageModeActive() ? "▣" : "T";
    const left=document.querySelector(".left-sidebar"), bottom=document.querySelector(".bottom-nav");
    if(left && pageModeActive()) left.innerHTML=`<button data-route="home" class="profile-shortcut page-nav-identity">${entityAvatarHTML(p,"page","avatar")}<span><b>${esc(p.name)}</b><small>Mode Page actif</small></span></button><button data-route="home"><span class="nav-ico">${menuIcon("home")}</span>Actualités</button><button data-route="messages"><span class="nav-ico">${menuIcon("messages")}</span>Messages</button><button data-route="search"><span class="nav-ico">${menuIcon("search")}</span>Rechercher</button><button data-route="notifications"><span class="nav-ico">${menuIcon("history")}</span>Alertes</button><button data-route="groups"><span class="nav-ico">${menuIcon("groups")}</span>Groupes</button><button data-route="pages"><span class="nav-ico">${menuIcon("pages")}</span>Pages</button><button data-route="menu"><span class="nav-ico">${menuIcon("settings")}</span>Menu</button>`;
    if(bottom && pageModeActive()) bottom.innerHTML=`<button data-route="home"><span class="nav-svg">${menuIcon("home")}</span><small>Actualités</small></button><button data-route="messages"><span class="nav-svg">${menuIcon("messages")}</span><small>Messages</small></button><button data-route="notifications"><span class="nav-svg">${menuIcon("history")}</span><small>Alertes</small></button><button data-route="menu"><span class="nav-svg">${menuIcon("settings")}</span><small>Menu</small></button>`;
  }
  function restoreAccountNavigation(){
    const left=document.querySelector(".left-sidebar"), bottom=document.querySelector(".bottom-nav");
    if(left) left.innerHTML=`<button data-route="profile" class="profile-shortcut"><span id="sideAvatar" class="avatar">T</span><span><b id="sideName">Mon profil</b><small>Voir mon profil</small></span></button><button data-route="home"><span class="nav-ico">${menuIcon("home")}</span>Actualités</button><button data-route="friends"><span class="nav-ico">${menuIcon("friends")}</span>Amis</button><button data-route="messages"><span class="nav-ico">${menuIcon("messages")}</span>Messages</button><button data-route="notifications"><span class="nav-ico">${menuIcon("notifications")}</span>Notifications</button><button data-route="pages"><span class="nav-ico">${menuIcon("pages")}</span>Pages</button><button data-route="groups"><span class="nav-ico">${menuIcon("groups")}</span>Groupes</button><button data-route="reels"><span class="nav-ico">${menuIcon("reels")}</span>Reels</button><button data-route="tafab"><span class="nav-ico">${menuIcon("tafab")}</span>Tafaß</button><button data-route="saved"><span class="nav-ico">${menuIcon("saved")}</span>Enregistrements</button><button data-route="menu"><span class="nav-ico">${menuIcon("settings")}</span>Menu</button>`;
    if(bottom) bottom.innerHTML=`<button data-route="home"><span class="nav-svg">${menuIcon("home")}</span><small>Actualités</small></button><button data-route="friends"><span class="nav-svg">${menuIcon("friends")}</span><small>Amis</small></button><button data-route="messages"><span class="nav-svg">${menuIcon("messages")}</span><small>Messages</small></button><button data-route="pages"><span class="nav-svg">${menuIcon("pages")}</span><small>Pages</small></button><button data-route="groups"><span class="nav-svg">${menuIcon("groups")}</span><small>Groupes</small></button><button data-route="tafab"><span class="nav-svg">${menuIcon("tafab")}</span><small>Tafaß</small></button>`;
    const nameEl=$("sideName"), avatarEl=$("sideAvatar"); if(nameEl) nameEl.textContent=nameOf(state.profile); if(avatarEl) avatarEl.outerHTML=avatarHTML(state.profile,"avatar").replace("<span ", '<span id="sideAvatar" ');
  }
  function pageContextBanner(){
    if(!pageModeActive()) return "";
    return `<div class="page-context-banner"><div class="page-context-identity">${entityAvatarHTML(state.activePage,"page","page-context-avatar")}<div><span>MODE PAGE</span><b>${esc(state.activePage.name)}</b></div></div><button class="page-context-exit" data-action="page-exit-mode">↩ Compte</button></div>`;
  }
  async function renderPageFeed(){
    const pg=state.activePage; if(!pg) return renderFeed();
    const token=state.renderToken;
    const [postsR, followersR, membersR]=await Promise.all([
      sb.from("page_posts").select("*").eq("page_id",pg.id).order("created_at",{ascending:false}).limit(50),
      sb.from("page_followers").select("id",{count:"exact",head:true}).eq("page_id",pg.id),
      sb.from("page_members").select("user_id,role").eq("page_id",pg.id)
    ]);
    if(token!==state.renderToken || state.route!=="home") return;
    if(postsR.error) return simplePage("Actualités", pageContextBanner()+`<div class="empty-block"><b>Impossible de charger les actualités de la Page.</b><small>${esc(postsR.error.message)}</small></div>`);
    const posts=postsR.data||[], ownerMe=pg.owner_id===state.user.id;
    const role=(membersR.data||[]).find(m=>m.user_id===state.user.id)?.role||null;
    const canManage=ownerMe||['owner','admin'].includes(role);
    const followerCount=followersR.count||0;
    const mediaCount=posts.filter(p=>p.media_url).length;
    const recent=posts.slice(0,3);
    const quick=(action,title,sub,icon)=>`<button class="page-quick-card" data-action="${action}" data-id="${esc(pg.id)}"><span class="page-quick-icon">${icon}</span><span><b>${title}</b><small>${sub}</small></span><strong>›</strong></button>`;
    let html=pageContextBanner()+`<section class="page-mode-feed page-mode-feed-premium">
      <div class="page-feed-hero-premium">
        <div class="page-feed-cover" ${pg.cover_url?`style="background-image:url('${esc(pg.cover_url)}')"`:''}><div class="page-feed-cover-shade"></div></div>
        <div class="page-feed-identity">${entityAvatarHTML(pg,"page","page-feed-avatar")}<div class="grow"><span class="eyebrow">MODE PAGE • ACTUALITÉS</span><h2>${esc(pg.name)}</h2><p>${esc(pg.bio||"Votre espace professionnel Tafaß.")}</p></div><button class="page-profile-mini" data-action="page-open" data-id="${esc(pg.id)}">Profil</button></div>
        <div class="page-feed-stats"><div><b>${followerCount}</b><small>Abonnés</small></div><div><b>${posts.length}</b><small>Publications</small></div><div><b>${mediaCount}</b><small>Médias</small></div><div><b>${canManage?'Gestion':'Lecture'}</b><small>Accès</small></div></div>
      </div>
      <div class="page-quick-grid">${quick('page-open','Profil de la Page','Voir la Page comme un visiteur',menuIcon('pages'))}${quick('page-invite-friends','Inviter des amis','Inviter vos amis à suivre',menuIcon('friends'))}${quick('page-more','Outils de la Page','Partage, équipe et options',menuIcon('help'))}${canManage?quick('page-settings','Paramètres','Configurer toute la Page',menuIcon('settings')):quick('page-share','Partager','Partager cette Page',menuIcon('share'))}</div>
      ${ownerMe?`<div class="composer composer-clean page-mode-composer page-mode-composer-premium"><div class="composer-top">${entityAvatarHTML(pg,"page","avatar")}<div><b>Publier au nom de ${esc(pg.name)}</b><small>Votre publication sera publiée comme une Page</small></div></div><textarea id="pageModePostText" maxlength="5000" placeholder="Quoi de neuf sur votre Page ?"></textarea><div class="composer-actions"><button type="button" class="primary" data-action="page-mode-publish" data-id="${esc(pg.id)}">Publier</button></div></div>`:""}
      <div class="page-feed-section-head"><div><span class="eyebrow">TAFAß • PAGE</span><h3>Publications récentes</h3></div><span>${posts.length} au total</span></div>`;
    if(!posts.length) html+=`<div class="page-feed-empty-premium"><div>✦</div><b>Aucune publication pour le moment</b><span>Les actualités de ${esc(pg.name)} apparaîtront ici.</span>${ownerMe?`<button class="primary" data-action="page-mode-focus">Créer la première publication</button>`:''}</div>`;
    else for(const p of posts){ html+=`<article class="post page-mode-post page-mode-post-premium"><div class="post-head">${entityAvatarHTML(pg,"page","avatar")}<div class="meta"><b class="post-author-name">${esc(pg.name)}</b><span class="post-time"><small>${timeAgo(p.created_at)} · Page</small></span></div>${ownerMe?`<button class="post-menu" data-action="delete-page-post" data-id="${esc(p.id)}" data-entity-id="${esc(pg.id)}">⋯</button>`:""}</div>${p.content?`<div class="post-body">${esc(p.content)}</div>`:""}${p.media_url?(String(p.media_type||"").startsWith("video")?`<video class="post-media" src="${esc(p.media_url)}" controls playsinline preload="metadata"></video>`:`<img class="post-media" src="${esc(p.media_url)}" alt="${esc(pg.name)}" loading="lazy">`):""}<div class="page-mode-post-footer"><span>Publication officielle</span><span>${timeAgo(p.created_at)}</span></div></article>`; }
    if(recent.length>1) html+=`<div class="page-feed-bottom-note">✓ Votre fil Page est synchronisé avec les publications de ${esc(pg.name)}.</div>`;
    html+=`</section>`;
    $("content").innerHTML=html;
  }

  async function loadActiveStories() {
    if (!state.user) return [];
    const now = new Date().toISOString();
    const r = await sb.from("stories")
      .select("id,user_id,media_url,media_type,text_overlay,visibility,expires_at,created_at")
      .or(`visibility.eq.public,user_id.eq.${state.user.id}`)
      .gt("expires_at", now)
      .order("created_at",{ascending:false})
      .limit(40);
    if (r.error) { console.warn("Tafaß stories:", r.error.message); return []; }
    await getBlockedIds();
    const visibleStories=filterBlocked(r.data||[],"user_id");
    const ids=[...new Set(visibleStories.map(x=>x.user_id).filter(Boolean))];
    const profiles=ids.length ? (await sb.from("profiles").select("id,first_name,last_name,avatar_url").in("id",ids)).data||[] : [];
    const pm=new Map(profiles.map(p=>[p.id,p]));
    return visibleStories.map(s=>({...s,author:pm.get(s.user_id)||state.profile}));
  }

async function createStory() {
    const file=$("storyFile")?.files?.[0];
    const text=$("storyText")?.value.trim()||"";
    if(!file && !text) return toast("Ajoutez une photo, une vidéo ou un texte à votre story.");
    let media_url=null, media_type="text";
    if(file){
      const ext=(file.name.split(".").pop()||"bin").toLowerCase();
      const path=`${state.user.id}/story-${crypto.randomUUID()}.${ext}`;
      const up=await sb.storage.from("posts").upload(path,file,{upsert:false,contentType:file.type||undefined});
      if(up.error) return toast("Upload : "+up.error.message);
      media_url=sb.storage.from("posts").getPublicUrl(path).data.publicUrl;
      media_type=file.type.startsWith("video/")?"video":"image";
    }
    const r=await sb.from("stories").insert({
      user_id:state.user.id, media_url:media_url||"data:text/plain;charset=utf-8,story",
      media_type, text_overlay:text, visibility:"public"
    }).select().single();
    if(r.error) return toast(r.error.message);
    closeModal(); toast("Story publiée pendant 24 h."); await render();
}

async function storyComposer() {
    openModal(`<div class="modal-box story-create-modal">
      <button class="modal-close" data-action="close-modal">×</button>
      <span class="eyebrow">TAFAß • STORIES</span><h3>Créer une story</h3>
      <p class="muted">Partagez une photo, une vidéo ou un texte. La story expire automatiquement après 24 heures.</p>
      <textarea id="storyText" maxlength="500" placeholder="Écrivez quelque chose…"></textarea>
      <label class="story-upload"><span>${menuIcon("pages")}</span><b>Photo ou vidéo</b><small>Choisir un fichier</small><input id="storyFile" type="file" accept="image/*,video/*" hidden></label>
      <button class="primary big" data-action="create-story">Publier la story</button>
    </div>`);
}

function openMoodComposer(){openModal(`<div class="modal-box composer-modal-premium mood-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • HUMEUR</span><h3>Comment vous sentez-vous ?</h3><p class="muted">Ajoutez une humeur ou une activité à votre publication.</p><div class="mood-grid">${[["😊","Heureux / Heureuse"],["😍","Amoureux / Amoureuse"],["🥳","En fête"],["😎","Détendu(e)"],["🤩","Enthousiaste"],["😌","Serein(e)"],["💪","Motivé(e)"],["😢","Triste"],["😡","En colère"],["🤔","En réflexion"],["❤️","Avec mes proches"],["🙏","Reconnaissant(e)"]].map(([e,l])=>`<button class="mood-choice" data-action="select-mood" data-mood-value="${esc(e+' '+l)}"><span>${e}</span><b>${esc(l)}</b></button>`).join('')}</div><label class="mood-extra">Message complémentaire<textarea id="moodExtra" maxlength="500" placeholder="Ajoutez un message…"></textarea></label><button class="primary big" data-action="apply-mood">Ajouter à ma publication</button></div>`)}
function openMoreComposer(){openModal(`<div class="modal-box composer-modal-premium more-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • PLUS</span><h3>Enrichir votre publication</h3><p class="muted">Ajoutez des éléments à votre publication.</p><div class="more-composer-grid"><button data-action="more-question"><span>❓</span><div><b>Question</b><small>Posez une question à votre communauté.</small></div></button><button data-action="more-location"><span>📍</span><div><b>Lieu</b><small>Ajoutez un lieu réel à votre texte.</small></div></button><button data-action="more-file"><span>📎</span><div><b>Média</b><small>Ajouter une photo ou une vidéo.</small></div></button><button data-action="more-style"><span>✨</span><div><b>Style premium</b><small>Préparez votre texte pour un affichage premium.</small></div></button></div></div>`)}
async function renderFeed() {
    const token = state.renderToken;
    const stories=await loadActiveStories();
    const liveR=await sb.from("live_sessions").select("id,user_id,title,started_at,profiles(first_name,last_name,username,avatar_url)").eq("status","live").order("started_at",{ascending:false}).limit(12);
    const activeLives=liveR.error ? [] : (liveR.data||[]);
    if (token !== state.renderToken || state.route !== "home") return;
    const storyGroups=[];
    const seen=new Set();
    for(const s of stories){ if(seen.has(s.user_id)) continue; seen.add(s.user_id); storyGroups.push(s); }

    let html=`<section class="news-feed">
      <div class="news-topbar"><div><h2>Actualités</h2><small>Publications et stories des membres Tafaß</small></div></div>
      <section class="stories-card">
        <div class="stories-head"><div><b>Stories</b><small>Contenus disponibles pendant 24 h</small></div><button class="small-action" data-action="story-create">＋ Créer</button></div>
        <div class="stories">
          <button class="story story-create-tile" data-action="story-create"><span class="story-add">${menuIcon("profile")}</span><small>Votre story</small></button>
          ${storyGroups.map(s=>`<button class="story" data-action="open-story" data-id="${esc(s.id)}"><span class="story-ring">${s.media_type==="video"?`<video src="${esc(s.media_url)}" muted playsinline></video>`:s.media_type==="text"?`<span class="story-text-preview">${esc(s.text_overlay||"Texte")}</span>`:`<img src="${esc(s.media_url)}" alt="Story">`}</span><small>${esc(s.user_id===state.user.id?"Vous":nameOf(s.author))}</small></button>`).join("")}
        </div>
      </section>
      ${activeLives.length ? `<section class="live-strip">
        <div class="live-strip-head"><div><b>En direct maintenant</b><small>Regardez les directs des membres Tafaß</small></div><span class="live-pulse">● LIVE</span></div>
        <div class="live-strip-list">${activeLives.map(l=>`<button class="live-card" data-action="watch-live" data-id="${esc(l.id)}"><span class="live-card-avatar">${avatarHTML(l.profiles||{})}</span><span><b>${esc(l.profiles ? nameOf(l.profiles) : "Membre Tafaß")}</b><small>${esc(l.title||"Direct Tafaß")}</small></span><strong>Regarder</strong></button>`).join("")}</div>
      </section>` : ""}

      <section class="composer composer-news composer-launcher">
        <div class="composer-launcher-row">
          <button class="composer-launcher-button" type="button" data-action="open-publisher" aria-label="Créer une publication">
            <span class="composer-launcher-avatar">${avatarHTML(state.profile)}</span>
            <span class="composer-launcher-input">À quoi pensez-vous ?</span>
          </button>
          <button class="composer-launcher-photo" type="button" data-action="quick-publisher-photo" aria-label="Publier une photo ou une vidéo">
            <span class="composer-photo-icon" aria-hidden="true">▣</span>
            <small>Photo</small>
          </button>
        </div>
        <input id="quickPostFile" class="quick-post-file" type="file" accept="image/*,video/*" hidden>
      </section>`;

    if(!state.posts.length) html+=`<div class="card empty">Aucune publication pour le moment.<br><span>Publiez la première sur Tafaß.</span></div>`;
    for(const p of state.posts){ if(token!==state.renderToken||state.route!=="home")return; html+=await postHTML(p); }
    if(token!==state.renderToken||state.route!=="home")return;
    $("content").innerHTML=html;
  }

function publisherBackgrounds(){
    return [
      ["plain","", "Classique"],
      ["snow","linear-gradient(135deg,#ffffff,#eef3ff)","Blanc"],
      ["violet","linear-gradient(135deg,#7c3aed,#ec4899)","Violet"],
      ["blue","linear-gradient(135deg,#2563eb,#06b6d4)","Bleu"],
      ["sunset","linear-gradient(135deg,#f97316,#ef4444,#ec4899)","Sunset"],
      ["mint","linear-gradient(135deg,#10b981,#14b8a6)","Menthe"],
      ["night","linear-gradient(135deg,#111827,#374151)","Nuit"],
      ["pink","linear-gradient(135deg,#db2777,#9333ea)","Rose"]
    ];
  }
  function savePublisherDraft(){
    if(!$("postText")) return;
    state.composerDraftText=$("postText").value||"";
    state.composerBackground=state.composerBackground||"plain";
    state.composerLocation=state.composerLocation||"";
    state.composerFile=$("postFile")?.files?.[0]||state.composerFile||null;
    state.composerVisibility=state.composerVisibility||"public";
    state.composerMeta=state.composerMeta||{};
  }
  function openPublisher(){
    const restoring=!!state.composerOpen;
    if(!restoring){
      state.composerBackground="plain";
      state.composerLocation="";
      state.composerDraftText="";
      state.composerFile=null;
      state.composerVisibility="public";
      state.composerMeta={};
    }
    state.composerOpen=true;
    openModal(`<div class="publisher-modal publisher-modal-v2">
      <header class="publisher-header">
        <button class="publisher-back" data-action="close-publisher" aria-label="Retour">←</button>
        <div class="publisher-brand">
          <img src="assets/tafass-logo-premium.svg" alt="Tafaß" class="publisher-logo">
          <div><span class="eyebrow">TAFAß</span><h2>Créer une publication</h2></div>
        </div>
        <button class="publisher-top-publish" data-action="publish-post-news">PUBLIER</button>
      </header>

      <div class="publisher-scroll">
        <div class="publisher-author">
          ${avatarHTML(state.profile,"avatar publisher-avatar")}
          <div class="publisher-author-copy"><b>${esc(nameOf(state.profile))}</b>
            <button class="publisher-audience" type="button" data-action="publisher-audience"><span aria-hidden="true">◉</span> ${esc(state.composerVisibility==="friends"?"Amis":state.composerVisibility==="private"?"Moi uniquement":"Public")} <span>⌄</span></button>
          </div>
        </div>

        <div class="publisher-editor-wrap">
          <textarea id="postText" class="publisher-editor" maxlength="5000" placeholder="Quoi de neuf pour vous ?" aria-label="Texte de la publication">${esc(state.composerDraftText||"")}</textarea>
          <div class="publisher-style-head"><span>Style du texte</span><small>Choisissez un fond</small></div>
          <div class="publisher-backgrounds" role="listbox" aria-label="Fonds de publication">
            ${publisherBackgrounds().map(([id,bg,label])=>`<button class="publisher-bg ${id==="plain"?"selected":""}" data-action="select-publisher-bg" data-bg="${id}" title="${esc(label)}" aria-label="${esc(label)}" style="${bg?`background:${bg};`:""}">${id==="plain"?"Aa":""}</button>`).join("")}
          </div>
        </div>

        <div class="publisher-media-preview" id="publisherMediaPreview"></div>

        <div class="publisher-tools">
          <button data-action="publisher-photo"><span class="publisher-tool-icon photos">▣</span><span><b>Photos/Vidéos</b><small>Ajouter depuis votre appareil</small></span></button>
          <button data-action="publisher-music"><span class="publisher-tool-icon music">♫</span><span><b>Musique</b><small>Ajouter une musique</small></span></button>
          <button data-action="publisher-tag"><span class="publisher-tool-icon tag">♙</span><span><b>Identifier des personnes</b><small>Ajouter des personnes</small></span></button>
          <button data-action="publisher-location"><span class="publisher-tool-icon location">⌖</span><span><b>Ajouter un lieu</b><small>Indiquer où vous êtes</small></span></button>
          <button data-action="publisher-mood"><span class="publisher-tool-icon mood">☺</span><span><b>Humeur/Activité</b><small>Partager votre humeur</small></span></button>
          <button data-action="publisher-message"><span class="publisher-tool-icon message">✦</span><span><b>Recevoir des messages</b><small>Autoriser les réponses</small></span></button>
          <button data-action="publisher-event"><span class="publisher-tool-icon event">▦</span><span><b>Créer un évènement</b><small>Ajouter un évènement</small></span></button>
          <button data-action="publisher-live"><span class="publisher-tool-icon live">●</span><span><b>Lancer un direct</b><small>Démarrer un direct</small></span></button>
        </div>
      </div>

      <input id="postFile" type="file" accept="image/*,video/*" hidden>
      <div class="publisher-bottom">
        <span id="composerFileName">Aucun média sélectionné</span>
        <button class="primary big" data-action="publish-post-news">PUBLIER</button>
      </div>
    </div>`);
    const pf=$("postFile");
    if(pf && state.composerFile){
      try{
        const dt=new DataTransfer();
        dt.items.add(state.composerFile);
        pf.files=dt.files;
      }catch(_){}
    }
    const preview=()=>{
      const f=pf?.files?.[0], box=$("publisherMediaPreview");
      if(!box)return;
      if(!f){box.innerHTML=""; $("composerFileName") && ($("composerFileName").textContent="Aucun média sélectionné"); return;}
      $("composerFileName") && ($("composerFileName").textContent=f.name);
      const url=URL.createObjectURL(f);
      box.innerHTML=f.type.startsWith("video/")
        ? `<div class="publisher-preview-frame"><video src="${url}" controls playsinline></video><button class="publisher-preview-remove" data-action="publisher-clear-media" aria-label="Retirer le média">×</button></div>`
        : `<div class="publisher-preview-frame"><img src="${url}" alt="Aperçu de la publication"><button class="publisher-preview-remove" data-action="publisher-clear-media" aria-label="Retirer le média">×</button></div>`;
    };
    pf?.addEventListener("change",()=>{state.composerFile=pf.files?.[0]||null;preview();});
    $("postText")?.addEventListener("input",()=>{state.composerDraftText=$("postText").value;});
    preview();
    setTimeout(()=>$("postText")?.focus(),80);
  }

  function openPublisherAudience() {
    savePublisherDraft();
    const current=state.composerVisibility||"public";
    openModal(`<div class="modal-box composer-audience-modal">
      <button class="modal-close" data-action="close-publisher-field">×</button>
      <div class="composer-field-brand"><img src="assets/tafass-logo-premium.svg" alt="Tafaß"></div>
      <span class="eyebrow">TAFAß • AUDIENCE</span>
      <h3>Qui peut voir votre publication ?</h3>
      <p class="muted">Choisissez l’audience avant de publier.</p>
      <div class="audience-options">
        ${[
          ["public","Public","Tout le monde peut voir cette publication.","◉"],
          ["friends","Amis","Vos amis sur Tafaß.","👥"],
          ["private","Moi uniquement","Visible uniquement par vous.","🔒"]
        ].map(([v,t,s,ic])=>`<button class="audience-option ${current===v?"selected":""}" data-action="set-publisher-audience" data-audience="${v}"><span class="audience-option-icon">${ic}</span><span><b>${t}</b><small>${s}</small></span><i>${current===v?"✓":""}</i></button>`).join("")}
      </div>
    </div>`);
  }

  function publisherMusicCatalog(){
    const styles=["Lo-fi Night","Afro Pulse","Tropical Flow","Piano Glow","Urban Wave","Sunset Drive","Acoustic Air","Future Pop","Ocean Dream","Cinematic Rise","Chill Focus","Island Beat"];
    const moods=["Calme","Énergique","Romantique","Positif","Solaire","Nocturne","Élégant","Épique","Doux","Focus"];
    const out=[];
    for(let i=1;i<=120;i++) out.push({id:`ai-${i}`,title:`Tafaß Music ${String(i).padStart(3,'0')}`,style:styles[(i-1)%styles.length],mood:moods[(i*7-1)%moods.length],bpm:72+((i*11)%72),seed:i});
    return out;
  }
  let musicAudioContext=null, musicNodes=[], currentMusicId=null, musicTimer=null;
  function stopPublisherMusic(){
    if(musicTimer)clearTimeout(musicTimer); musicTimer=null;
    musicNodes.forEach(n=>{try{n.stop?.();n.disconnect?.();}catch(_){}}); musicNodes=[]; currentMusicId=null;
  }
  function playGeneratedMusic(track){
    if(!track)return;
    stopPublisherMusic();
    try{
      musicAudioContext ||= new (window.AudioContext||window.webkitAudioContext)();
      const ctx=musicAudioContext; if(ctx.state==='suspended')ctx.resume().catch(()=>{});
      const master=ctx.createGain(); master.gain.value=.055; master.connect(ctx.destination);
      const scale=[220,247,277,330,370,440,494,554];
      let step=0; currentMusicId=track.id;
      const tick=()=>{
        if(currentMusicId!==track.id)return;
        const osc=ctx.createOscillator(), gain=ctx.createGain();
        const freq=scale[(step*3+track.seed)%scale.length]*(step%8===7?.5:1);
        osc.type=track.style.includes('Piano')?'sine':track.style.includes('Afro')?'triangle':'sine'; osc.frequency.value=freq;
        gain.gain.setValueAtTime(.0001,ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.7,ctx.currentTime+.025); gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.24);
        osc.connect(gain);gain.connect(master);osc.start();osc.stop(ctx.currentTime+.26);musicNodes.push(osc);step=(step+1)%16;
        musicTimer=setTimeout(tick,Math.max(180,60000/track.bpm/2));
      }; tick();
    }catch(e){toast('Lecture audio indisponible sur cet appareil.');}
  }
  function openPublisherMusic(){
    savePublisherDraft();
    const tracks=publisherMusicCatalog();
    openModal(`<div class="modal-box composer-field-modal publisher-music-modal">
      <button class="modal-close" data-action="close-publisher-field" aria-label="Fermer">×</button>
      <div class="composer-field-brand"><img src="assets/tafass-logo-premium.svg" alt="Tafaß"></div>
      <span class="eyebrow">TAFAß • MUSIC LAB</span><h3>Choisir une musique</h3>
      <p class="muted">120 pistes générées automatiquement. Une seule musique peut être attachée à la publication.</p>
      <div class="music-search-row"><input id="publisherMusicSearch" class="premium-input" placeholder="Rechercher une piste, un style ou une ambiance…"><span class="music-count">120</span></div>
      <div id="publisherMusicList" class="publisher-music-list">${tracks.map(t=>`<button type="button" class="publisher-music-item" data-action="select-publisher-music" data-music-id="${t.id}"><span class="music-cover">♫</span><span><b>${esc(t.title)}</b><small>${esc(t.style)} · ${esc(t.mood)} · ${t.bpm} BPM</small></span><span class="music-play">▶</span></button>`).join('')}</div>
    </div>`);
    const list=$('publisherMusicList'), search=$('publisherMusicSearch');
    search?.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();[...list.children].forEach(el=>el.classList.toggle('hidden',q&&!el.textContent.toLowerCase().includes(q)));});
  }
  async function openPublisherTag(){
    savePublisherDraft();
    const {data:rows}=await sb.from('friendships').select('user_id,friend_id').or(`user_id.eq.${state.user.id},friend_id.eq.${state.user.id}`).limit(200);
    const ids=[...new Set((rows||[]).map(r=>r.user_id===state.user.id?r.friend_id:r.user_id).filter(Boolean))];
    const {data:friends}=ids.length?await sb.from('profiles').select('id,first_name,last_name,username,avatar_url').in('id',ids).order('first_name'):{data:[]};
    openModal(`<div class="modal-box composer-field-modal publisher-tag-modal"><button class="modal-close" data-action="close-publisher-field">×</button><div class="composer-field-brand"><img src="assets/tafass-logo-premium.svg" alt="Tafaß"></div><span class="eyebrow">TAFAß • AMIS</span><h3>Identifier des personnes</h3><p class="muted">Choisissez uniquement parmi vos amis Tafaß.</p><input id="publisherTagSearch" class="premium-input" placeholder="Rechercher un ami…"><div id="publisherTagList" class="publisher-tag-list">${(friends||[]).map(f=>`<button class="publisher-tag-person" type="button" data-action="select-publisher-tag" data-id="${esc(f.id)}" data-name="${esc(nameOf(f))}">${avatarHTML(f,'avatar tiny-avatar')}<span><b>${esc(nameOf(f))}</b><small>@${esc(f.username||'membre')}</small></span><i>＋</i></button>`).join('')||'<div class="empty">Vous n’avez pas encore d’amis à identifier.</div>'}</div><button class="primary big" data-action="close-publisher-field">Terminer</button></div>`);
    $('publisherTagSearch')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.publisher-tag-person').forEach(x=>x.classList.toggle('hidden',q&&!x.textContent.toLowerCase().includes(q)));});
  }
  function openPublisherLocation(){
    savePublisherDraft();
    openModal(`<div class="modal-box composer-field-modal publisher-location-modal"><button class="modal-close" data-action="close-publisher-field">×</button><div class="composer-field-brand"><img src="assets/tafass-logo-premium.svg" alt="Tafaß"></div><span class="eyebrow">TAFAß • LOCALISATION</span><h3>Ajouter un lieu</h3><p class="muted">Recherchez un lieu réel. Sélectionnez un résultat vérifié par la recherche géographique.</p><div class="place-search-wrap-v4"><input id="publisherPlaceInput" class="premium-input" placeholder="Rechercher un lieu, une rue, une ville…" autocomplete="off"><div id="publisherPlaceResults" class="place-results-v4"></div></div><button class="primary big" data-action="publisher-location-apply">Ajouter le lieu</button></div>`);
    installPlaceSearch('publisherPlaceInput','publisherPlaceResults');
  }
  function openPublisherField(field){
    const config={
      music:{eyebrow:"MUSIQUE",title:"Ajouter une musique",label:"Nom de la musique",placeholder:"Ex. Ma chanson préférée",action:"publisher-field-apply",button:"Ajouter"},
      tag:{eyebrow:"PERSONNES",title:"Identifier des personnes",label:"Nom de la personne",placeholder:"Rechercher ou saisir un nom",action:"publisher-field-apply",button:"Identifier"},
      location:{eyebrow:"LIEU",title:"Ajouter un lieu",label:"Lieu de la publication",placeholder:"Ex. Antananarivo, Madagascar",action:"publisher-field-apply",button:"Ajouter le lieu"},
      event:{eyebrow:"ÉVÈNEMENT",title:"Créer un évènement",label:"Nom de l’évènement",placeholder:"Ex. Rencontre Tafaß",action:"publisher-field-apply",button:"Ajouter l’évènement"},
      question:{eyebrow:"QUESTION",title:"Poser une question",label:"Votre question",placeholder:"Écrivez votre question…",action:"publisher-field-apply",button:"Ajouter la question"}
    }[field] || null;
    if(!config)return;
    savePublisherDraft();
    openModal(`<div class="modal-box composer-field-modal">
      <button class="modal-close" data-action="close-publisher-field" aria-label="Fermer">×</button>
      <div class="composer-field-brand"><img src="assets/tafass-logo-premium.svg" alt="Tafaß"></div>
      <span class="eyebrow">TAFAß • ${config.eyebrow}</span>
      <h3>${config.title}</h3>
      <p class="muted">Ajoutez cet élément à votre publication sans quitter l’éditeur.</p>
      <label class="composer-field-label">${config.label}<input id="publisherFieldInput" maxlength="500" autocomplete="off" placeholder="${config.placeholder}"></label>
      <div class="composer-field-actions"><button class="secondary-action" data-action="close-publisher-field">Annuler</button><button class="primary" data-action="${config.action}" data-field="${field}">${config.button}</button></div>
    </div>`);
    setTimeout(()=>$("publisherFieldInput")?.focus(),60);
  }

  function openLiveSetup(){
    savePublisherDraft();
    openModal(`<div class="modal-box live-setup-modal">
      <button class="modal-close" data-action="close-publisher-field">×</button>
      <div class="composer-field-brand"><img src="assets/tafass-logo-premium.svg" alt="Tafaß"></div>
      <span class="eyebrow">TAFAß • DIRECT</span>
      <h3>Lancer un direct</h3>
      <p class="muted">Votre caméra et votre microphone seront utilisés pendant le direct.</p>
      <label class="composer-field-label">Titre du direct<input id="liveTitleInput" maxlength="120" placeholder="Ex. Direct Tafaß"></label>
      <div class="live-permission-note">● Caméra · ● Microphone · Temps réel</div>
      <button class="primary big" data-action="confirm-live-start">Lancer le direct</button>
    </div>`);
    setTimeout(()=>$("liveTitleInput")?.focus(),50);
  }

  const livePeers = new Map();
  let liveStream = null;
  let liveChannel = null;
  let liveSessionId = null;
  let liveRole = null;
  let liveViewerPc = null;
  let liveViewerId = null;
  let liveCommentsChannel = null;
  let liveCommentRows = [];

  // WebRTC: STUN is the safe default. A production TURN server can be supplied
  // through window.TAFASS_TURN_SERVERS without hard-coding credentials in the app.
  function liveIceServers(){
    const configured = Array.isArray(window.TAFASS_TURN_SERVERS) ? window.TAFASS_TURN_SERVERS : [];
    return [{urls:"stun:stun.l.google.com:19302"}, ...configured].filter(x => x && x.urls);
  }
  function createLivePeer(){
    return new RTCPeerConnection({iceServers:liveIceServers(), bundlePolicy:"max-bundle", rtcpMuxPolicy:"require"});
  }
  function liveChannelName(id){ return `tafass-live:${id}`; }
  async function loadLiveComments(sessionId){
    const r=await sb.from('live_comments').select('id,user_id,content,created_at,profiles(first_name,last_name,username,avatar_url)').eq('live_session_id',sessionId).order('created_at',{ascending:true}).limit(150);
    liveCommentRows=r.error?[]:(r.data||[]); renderLiveComments();
  }
  function renderLiveComments(){
    const box=$('liveCommentsList'); if(!box)return;
    box.innerHTML=liveCommentRows.slice(-80).map(c=>`<div class="live-comment-row">${avatarHTML(c.profiles||{},'avatar live-comment-avatar')}<div><b>${esc(nameOf(c.profiles||{}))}</b><span>${esc(c.content||'')}</span></div></div>`).join('') || `<div class="live-comments-empty">Les commentaires du direct apparaîtront ici.</div>`;
    box.scrollTop=box.scrollHeight;
  }
  async function setupLiveComments(sessionId){
    if(liveCommentsChannel){try{await sb.removeChannel(liveCommentsChannel);}catch(_){} liveCommentsChannel=null;}
    await loadLiveComments(sessionId);
    liveCommentsChannel=sb.channel(`tafass-live-comments:${sessionId}`)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'live_comments',filter:`live_session_id=eq.${sessionId}`},async payload=>{
        const c=payload.new;
        const p=(await sb.from('profiles').select('first_name,last_name,username,avatar_url').eq('id',c.user_id).maybeSingle()).data||{};
        if(!liveCommentRows.some(x=>x.id===c.id)){liveCommentRows.push({...c,profiles:p});renderLiveComments();}
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'live_sessions',filter:`id=eq.${sessionId}`},async payload=>{
        if(payload.new?.status==='ended' && liveRole==='viewer'){
          try{liveViewerPc?.close();}catch(_){}
          if(liveChannel){try{await sb.removeChannel(liveChannel);}catch(_){}}
          liveViewerPc=null;liveChannel=null;liveSessionId=null;liveRole=null;liveViewerId=null;
          if(liveCommentsChannel){try{await sb.removeChannel(liveCommentsChannel);}catch(_){} liveCommentsChannel=null;}
          closeModal(); toast('Le direct est terminé.'); if(state.route==='home') renderFeed();
        }
      }).subscribe();
  }
  async function sendLiveComment(){
    const input=$('liveCommentInput'), text=input?.value.trim()||'';
    if(!text||!liveSessionId)return;
    const r=await sb.from('live_comments').insert({live_session_id:liveSessionId,user_id:state.user.id,content:text.slice(0,500)});
    if(r.error)return toast('Commentaire du direct impossible : '+r.error.message);
    if(input)input.value='';
  }
  function liveCommentsMarkup(){
    return `<section class="live-comments-panel"><div class="live-comments-head"><div><b>Commentaires en direct</b><small>Les messages sont visibles par le diffuseur et les spectateurs.</small></div><span>● LIVE</span></div><div id="liveCommentsList" class="live-comments-list"></div><form id="liveCommentForm" class="live-comment-form"><input id="liveCommentInput" maxlength="500" placeholder="Écrire un commentaire…" autocomplete="off"><button type="submit" aria-label="Envoyer">➤</button></form></section>`;
  }

  async function startLiveFromPublisher(){
    savePublisherDraft();
    let stream;
    try {
      if(!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:720}},audio:true});
    } catch(e) {
      return toast("Autorisez la caméra et le microphone pour lancer un direct.");
    }
    const title = (state.composerMeta?.live_title || "Direct Tafaß").trim().slice(0,120);
    const {data:session,error} = await sb.from("live_sessions").insert({user_id:state.user.id,title,status:"live",started_at:new Date().toISOString()}).select().single();
    if(error){ stream.getTracks().forEach(t=>t.stop()); return toast("Impossible de lancer le direct : "+error.message); }
    liveStream=stream; liveSessionId=session.id; liveRole="broadcaster"; state.activeLive=session;
    closeModal(); await openBroadcasterLive(session,stream);
    if(state.route==="home") renderFeed();
  }

  async function openBroadcasterLive(session,stream){
    liveChannel=sb.channel(liveChannelName(session.id),{config:{broadcast:{self:false}}});
    liveChannel.on("broadcast",{event:"viewer-offer"},async ({payload})=>{
      if(liveRole!=="broadcaster" || !payload?.viewerId || !payload?.offer) return;
      const viewerId=payload.viewerId;
      const old=livePeers.get(viewerId); if(old) old.close();
      const pc=createLivePeer();
      livePeers.set(viewerId,pc);
      stream.getTracks().forEach(track=>pc.addTrack(track,stream));
      pc.onicecandidate=e=>{if(e.candidate) liveChannel?.send({type:"broadcast",event:"broadcaster-ice",payload:{viewerId,candidate:e.candidate}});};
      pc.onconnectionstatechange=()=>{if(["failed","closed"].includes(pc.connectionState)){pc.close();livePeers.delete(viewerId);}};
      try{
        await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
        const answer=await pc.createAnswer(); await pc.setLocalDescription(answer);
        await liveChannel.send({type:"broadcast",event:"broadcaster-answer",payload:{viewerId,answer:pc.localDescription}});
      }catch(err){console.error("Tafaß live answer:",err);}
    });
    liveChannel.on("broadcast",{event:"viewer-ice"},async ({payload})=>{
      const pc=livePeers.get(payload?.viewerId);
      if(pc && payload?.candidate) try{await pc.addIceCandidate(payload.candidate);}catch(_){}
    });
    await liveChannel.subscribe();
    openModal(`<div class="modal-box live-modal live-broadcast-modal" data-live-broadcaster="true">
      <div class="live-lock-badge">🔒 DIRECT ACTIF · Terminez le direct pour quitter</div>
      <div class="live-modal-head"><div><span class="eyebrow">TAFAß • DIRECT</span><h3>Vous êtes en direct</h3></div><span class="live-pulse">● LIVE</span></div>
      <video id="liveLocalVideo" class="live-video" autoplay muted playsinline></video>
      <div class="live-status"><span>●</span><b>Diffusion en temps réel</b><small>Audio + vidéo en direct. Les spectateurs peuvent commenter et vous répondez en direct.</small></div>
      ${liveCommentsMarkup()}
      <button class="danger-action live-end-button" data-action="end-live">Terminer le direct</button>
    </div>`);
    const v=$("liveLocalVideo"); if(v){v.srcObject=stream;await v.play().catch(()=>{});}
    await setupLiveComments(session.id);
    $("liveCommentForm")?.addEventListener("submit",e=>{e.preventDefault();sendLiveComment();});
  }

  async function watchLive(id){
    const {data:session,error}=await sb.from("live_sessions").select("id,user_id,title,status,started_at,profiles(first_name,last_name,username,avatar_url)").eq("id",id).maybeSingle();
    if(error || !session || session.status!=="live") return toast("Ce direct est terminé.");
    if(session.user_id===state.user.id) return toast("Vous êtes déjà le diffuseur de ce direct.");
    liveRole="viewer"; liveSessionId=id; liveViewerId=crypto.randomUUID();
    liveChannel=sb.channel(liveChannelName(id),{config:{broadcast:{self:false}}});
    liveViewerPc=createLivePeer();
    liveViewerPc.ontrack=e=>{const v=$("liveRemoteVideo");if(v)v.srcObject=e.streams[0];};
    liveViewerPc.onicecandidate=e=>{if(e.candidate) liveChannel?.send({type:"broadcast",event:"viewer-ice",payload:{viewerId:liveViewerId,candidate:e.candidate}});};
    liveChannel.on("broadcast",{event:"broadcaster-answer"},async ({payload})=>{
      if(payload?.viewerId!==liveViewerId || !payload.answer)return;
      try{await liveViewerPc.setRemoteDescription(new RTCSessionDescription(payload.answer));}catch(_){}
    });
    liveChannel.on("broadcast",{event:"broadcaster-ice"},async ({payload})=>{
      if(payload?.viewerId!==liveViewerId || !payload.candidate)return;
      try{await liveViewerPc.addIceCandidate(payload.candidate);}catch(_){}
    });
    await liveChannel.subscribe();
    const offer=await liveViewerPc.createOffer(); await liveViewerPc.setLocalDescription(offer);
    await liveChannel.send({type:"broadcast",event:"viewer-offer",payload:{viewerId:liveViewerId,offer:liveViewerPc.localDescription}});
    openModal(`<div class="modal-box live-modal live-viewer-modal">
      <button class="modal-close" data-action="close-live-viewer">×</button>
      <div class="live-modal-head"><div><span class="eyebrow">TAFAß • EN DIRECT</span><h3>${esc(session.title||"Direct Tafaß")}</h3><small>${esc(nameOf(session.profiles||{}))}</small></div><span class="live-pulse">● LIVE</span></div>
      <video id="liveRemoteVideo" class="live-video" autoplay playsinline controls></video>
      <div class="live-status"><span>●</span><b>Direct en temps réel</b><small>Vous entendez l’audio du diffuseur. Vos commentaires sont transmis en temps réel.</small></div>
      ${liveCommentsMarkup()}
    </div>`);
    await setupLiveComments(id);
    $("liveCommentForm")?.addEventListener("submit",e=>{e.preventDefault();sendLiveComment();});
  }

  async function endLive(){
    if(!liveSessionId)return;
    const id=liveSessionId;
    try{await sb.from("live_sessions").update({status:"ended",ended_at:new Date().toISOString()}).eq("id",id).eq("user_id",state.user.id);}catch(_){}
    livePeers.forEach(pc=>pc.close()); livePeers.clear();
    if(liveStream) liveStream.getTracks().forEach(t=>t.stop());
    liveViewerPc?.close();
    if(liveChannel){try{await sb.removeChannel(liveChannel);}catch(_){}}
    if(liveCommentsChannel){try{await sb.removeChannel(liveCommentsChannel);}catch(_){} liveCommentsChannel=null;}
    stopPublisherMusic();
    liveStream=null;liveViewerPc=null;liveChannel=null;liveSessionId=null;liveRole=null;liveViewerId=null;liveCommentRows=[];state.activeLive=null;
    closeModal(); if(state.route==="home") await renderFeed();
  }

  async function publishPostNews(){
    const text=$("postText")?.value.trim()||"";
    const pf=$("postFile"), vf=$("postVideoFile"), file=pf?.files?.[0]||vf?.files?.[0];
    if(!text&&!file)return toast("Écrivez quelque chose ou choisissez un média.");
    const buttons=[...document.querySelectorAll('[data-action="publish-post-news"]')], btn=buttons[buttons.length-1];
    setLoading(btn,true,"Publier");
    try{
      let media_url=null,media_type=null;
      if(file){
        const ext=(file.name.split(".").pop()||"bin").toLowerCase();
        const path=`${state.user.id}/${crypto.randomUUID()}.${ext}`;
        const up=await sb.storage.from("posts").upload(path,file,{upsert:false,contentType:file.type||undefined});
        if(up.error)throw new Error("Upload : "+up.error.message);
        media_url=sb.storage.from("posts").getPublicUrl(path).data.publicUrl;
        media_type=file.type.startsWith("video/")?"video":"image";
      }
      const payload={user_id:state.user.id,content:text,media_url,media_type,visibility:state.composerVisibility||"public",location:state.composerLocation||null,background_style:state.composerBackground||"plain",publication_meta:state.composerMeta||{}};
      let r=await sb.from("posts").insert(payload).select().single();
      if(r.error && String(r.error.code)==="42703"){
        delete payload.background_style;
        delete payload.publication_meta;
        r=await sb.from("posts").insert(payload).select().single();
      }
      if(r.error)throw new Error(r.error.message);
      await logActivity("post_created","Publication créée","post",r.data?.id||null);
      state.composerOpen=false; state.composerDraftText=""; state.composerFile=null; state.composerBackground="plain"; state.composerLocation=""; state.composerVisibility="public"; state.composerMeta={};
      closeModal(); toast("Publication publiée"); await loadPosts(); await render();
    }catch(e){toast(e?.message||"Publication impossible.");}
    finally{setLoading(btn,false,"Publier");}
  }
  function appendPublisherText(prefix){
    const t=$("postText"); if(!t)return;
    t.value=(prefix+(t.value.trim()?`\n${t.value.trim()}`:"")).slice(0,5000);
    t.focus();
  }


  async function reactionCountsVisibleFor(ownerId) {
    if (!ownerId || ownerId === state.user.id) return true;
    if (state.reactionSettingsCache.has(ownerId)) return state.reactionSettingsCache.get(ownerId);
    const r = await sb.from("reaction_settings").select("show_reaction_counts").eq("user_id",ownerId).maybeSingle();
    const visible = r.error ? true : r.data?.show_reaction_counts !== false;
    state.reactionSettingsCache.set(ownerId, visible);
    return visible;
  }

  function captionHTML(text, limit = 280) {
    const value = String(text || "");
    if (value.length <= limit) return `<div class="post-caption">${esc(value)}</div>`;
    const short = value.slice(0, limit).replace(/\s+\S*$/, "").trimEnd();
    return `<div class="post-caption post-caption-collapsed" data-caption-state="collapsed">
      <span class="caption-short">${esc(short)}…</span>
      <span class="caption-full" hidden>${esc(value)}</span>
      <button type="button" class="caption-toggle" data-action="toggle-caption">Voir plus</button>
    </div>`;
  }
  function toggleCaption(btn) {
    const box = btn?.closest(".post-caption");
    if (!box) return;
    const full = box.querySelector(".caption-full"), short = box.querySelector(".caption-short");
    const collapsed = box.dataset.captionState !== "expanded";
    if (full) full.hidden = !collapsed;
    if (short) short.hidden = collapsed;
    box.dataset.captionState = collapsed ? "expanded" : "collapsed";
    btn.textContent = collapsed ? "Voir moins" : "Voir plus";
  }

  async function postHTML(p) {
    const [rs, cs, sh, showReactionCounts] = await Promise.all([reactionsFor(p.id), commentsFor(p.id), sharersFor(p.id), reactionCountsVisibleFor(p.user_id)]);
    const counts = {}; rs.forEach(r => counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1);
    const mine = rs.find(r => r.user_id === state.user.id)?.reaction_type;
    const totalReactions = Object.values(counts).reduce((a,b) => a+b, 0);
    const reactionVisual = showReactionCounts ? Object.entries(counts).map(([k,v]) => `<span class="reaction-chip"><i>${reactionMeta[k]?.[1] || "👍"}</i><b>${v}</b></span>`).join("") : `<span class="reaction-hidden-badge">🔒 Réactions masquées</span>`;
    const media = p.media_url
      ? (p.media_type === "video" || p.media_type === "reel"
        ? `<video class="post-media protected-media" src="${esc(p.media_url)}" controls preload="metadata"></video>`
        : `<img class="post-media protected-media" src="${esc(p.media_url)}" alt="Publication">`)
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
    return `<article class="post post-premium" id="post-${esc(p.id)}" data-post-id="${esc(p.id)}" data-post-bg="${esc(p.background_style || "plain")}">
      <div class="post-head">${profileLink(p.author, avatarHTML(p.author), "profile-link profile-avatar-link")}<div class="meta">${profileLink(p.author, `<span class="post-author-name">${esc(nameOf(p.author))}</span>`, "profile-link profile-meta-link")}<span class="post-time"><small>${timeAgo(p.created_at)} · ${esc(p.visibility || "public")}</small></span></div><button class="post-menu" data-action="post-menu" data-id="${esc(p.id)}">⋯</button></div>
      ${p.content ? `<div class="post-body ${p.background_style && p.background_style !== "plain" ? "post-body-has-bg" : ""}">${captionHTML(p.content)}</div>` : ""}${media}
      ${p.publication_meta && typeof p.publication_meta === "object" ? (()=>{const m=p.publication_meta||{};const chips=[];if(m.music)chips.push(`<button type="button" class="post-music-chip" data-action="play-post-music" data-music-id="${esc(m.music_id||'ai-1')}" data-music-seed="${esc(m.music_seed||1)}">♫ ${esc(m.music)} · Écouter</button>`);if(m.tag)chips.push(`<span>👥 ${esc(m.tag)}</span>`);if(m.location)chips.push(`<span>📍 ${esc(m.location)}</span>`);if(m.event)chips.push(`<span>📅 ${esc(m.event)}</span>`);if(m.mood)chips.push(`<span>☺ ${esc(m.mood)}</span>`);return chips.length?`<div class="post-meta-chips">${chips.join('')}</div>`:''})() : ""}
      ${p.publication_meta?.receive_messages && p.user_id !== state.user.id ? `<div class="post-message-cta"><div><b>Messages ouverts</b><small>Envoyez un message privé directement à ${esc(nameOf(p.author||{}))}.</small></div><button type="button" data-action="post-receive-message" data-owner-id="${esc(p.user_id)}">💬 Message</button></div>` : ""}
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
    const target=state.posts.find(x=>String(x.id)===String(postId));
    if(target?.user_id && await denyIfBlocked(target.user_id,"Réaction impossible : ce compte est bloqué."))return;
    // Instant UI: reflect the selected reaction immediately, then sync Supabase.
    const picker = $("reaction-" + postId);
    const button = document.querySelector(`[data-action="react"][data-id="${CSS.escape(String(postId))}"]`);
    const meta = reactionMeta[reaction] || ["J’aime", "👍"];
    if (button) { button.innerHTML = `${meta[1]} ${esc(meta[0])}`; button.classList.add("is-reacted"); }
    if (picker) picker.innerHTML = "";
    const { error } = await sb.rpc("tafa_set_post_reaction", { p_post_id: postId, p_reaction_type: reaction });
    if (error) {
      if (button) { button.classList.remove("is-reacted"); button.textContent = "👍 J’aime"; }
      return toast(error.message);
    }
    toast("Réaction enregistrée");
    loadPosts().then(()=>{ if (state.route === "profile") profilePage(state.profileTab); });
  }
  async function addComment(postId, parentId = null) {
    const target=state.posts.find(x=>String(x.id)===String(postId));
    if(target?.user_id && await denyIfBlocked(target.user_id,"Commentaire impossible : ce compte est bloqué."))return;
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
    const target=state.posts.find(x=>String(x.id)===String(id));
    if(target?.user_id && await denyIfBlocked(target.user_id,"Partage impossible : ce compte est bloqué."))return;
    const { error } = await sb.rpc("tafa_share_post", { p_post_id: id, p_share_message: "" });
    if (error) return toast(error.message);
    await logActivity("post_shared", "Publication partagée", "post", id);
    toast("Publication partagée"); await loadPosts();
    if (state.route === "profile") await profilePage(state.profileTab);
  }

  async function deleteComment(id) {
    const row = document.querySelector(`[data-comment-id="${CSS.escape(String(id))}"]`);
    const snapshot = row?.outerHTML || "";
    row?.remove();
    toast("Commentaire supprimé");
    const { error } = await sb.rpc("tafa_delete_comment", { p_comment_id: id });
    if (error) { toast(error.message); await loadPosts(); return; }
    loadPosts().then(()=>{ if (state.route === "profile") profilePage(state.profileTab); });
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
    const row = document.querySelector(`[data-post-id="${CSS.escape(String(id))}"]`) || document.querySelector(`article.post:has([data-action="post-menu"][data-id="${CSS.escape(String(id))}"])`);
    row?.remove();
    state.posts = state.posts.filter(p => String(p.id) !== String(id));
    closeModal(); toast("Publication supprimée");
    const { error } = await sb.rpc("tafa_delete_post", { p_post_id: id });
    if (error) { toast(error.message); await loadPosts(); return; }
    loadPosts().then(()=>{ if (state.route === "profile") profilePage(state.profileTab); });
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
    await getBlockedIds();
    const { data: peopleRaw, error } = await sb.from("profiles").select("*").neq("id", state.user.id).order("created_at", { ascending:false }).limit(100);
    const people=filterBlocked(peopleRaw||[],"id");
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
    if(await denyIfBlocked(id,"Demande impossible : ce compte est bloqué."))return;
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
    if(await denyIfBlocked(id,"Cette relation est bloquée."))return;
    const { error } = await sb.from("friend_requests").update({ status }).eq("sender_id", id).eq("receiver_id", state.user.id).eq("status", "pending");
    if (error) return toast(error.message);
    if (status === "accepted") {
      await sb.from("friendships").upsert([{ user_id: state.user.id, friend_id: id }, { user_id: id, friend_id: state.user.id }], { onConflict: "user_id,friend_id" });
    }
    toast(status === "accepted" ? "Ami ajouté" : "Demande supprimée");
    if (state.route === "friends") await friendsPage();
  }

  let searchTimer = null;
  let searchCategory = "accounts";
  async function searchPage(q = "", category = searchCategory) {
    searchCategory = category || searchCategory;
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
        sb.from("pages").select(PAGE_FIELDS).or(`name.ilike.%${safe}%,category.ilike.%${safe}%,bio.ilike.%${safe}%`).limit(20),
        sb.from("groups").select(GROUP_FIELDS).or(`name.ilike.%${safe}%,description.ilike.%${safe}%`).limit(20)
      ]);
      await getBlockedIds(); people=filterBlocked(pr.data||[],"id"); posts=filterBlocked(por.data||[],"user_id"); pages=pgr.data||[]; groups=gr.data||[];
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

    const categories = [
      ["accounts","Comptes","people",people.length],
      ["posts","Publications","post",posts.length],
      ["pages","Pages","page",pages.length],
      ["groups","Groupes","group",groups.length]
    ];
    const categoryTabs = term ? `<div class="search-category-bar" role="tablist" aria-label="Types de résultats">${categories.map(([key,label,icon,count])=>`<button type="button" class="search-category-tab ${searchCategory===key?"active":""}" data-action="search-category" data-category="${key}" role="tab" aria-selected="${searchCategory===key}"><span class="search-tab-icon">${icon === "people" ? "♙" : icon === "post" ? "▤" : icon === "page" ? "▣" : "◎"}</span><span>${label}</span><b>${count}</b></button>`).join("")}</div>` : "";
    let activeResults = "";
    if (term) {
      const map = {accounts: ["Comptes", peopleHtml], posts: ["Publications", postHtml], pages: ["Pages", pageHtml], groups: ["Groupes", groupHtml]};
      const [label, html] = map[searchCategory] || map.accounts;
      activeResults = `<div class="search-active-result"><div class="search-result-heading"><div><span class="eyebrow">TAFAß • RECHERCHE</span><h3>${label}</h3><p>${html.includes("Aucun") ? "Aucun résultat pour cette catégorie." : "Résultats correspondant à votre recherche."}</p></div><span class="search-result-count">${categories.find(x=>x[0]===searchCategory)?.[3] || 0}</span></div><div class="clean-list search-results-list">${html}</div></div>`;
    } else {
      activeResults = `<div class="search-idle-card search-idle-card-v2"><div class="search-idle-icon">⌕</div><span class="eyebrow">TAFAß • EXPLORER</span><h3>Recherchez ce que vous voulez</h3><p>Entrez un nom, une publication, une Page ou un groupe. Les résultats sont chargés uniquement après votre recherche.</p><button class="ghost-action" data-action="menu-service" data-service="activity" data-name="Historique de recherche">Voir l’historique</button></div>`;
    }

    $("content").innerHTML = `<section class="clean-page search-page-premium"><div class="page-header clean-page-header"><div><span class="eyebrow">TAFAß • EXPLORER</span><h2>Rechercher</h2><p class="page-kicker">Une recherche rapide, claire et privée.</p></div></div><div class="clean-search searchbox premium-searchbox"><span class="icon">⌕</span><input id="searchInput" value="${esc(term)}" placeholder="Rechercher un compte, une publication, une Page ou un groupe…" autocomplete="off"></div>${categoryTabs}${activeResults}</section>`;
    $("searchInput")?.addEventListener("input", e=>{ clearTimeout(searchTimer); searchTimer=setTimeout(()=>searchPage(e.target.value, searchCategory),220); });
  }

  async function pageMessagesHub(){
    const pg=state.activePage, token=state.renderToken;
    const {data:msgs,error}=await sb.from("page_messages").select("id,sender_id,message,is_read,created_at,profiles(first_name,last_name,username,avatar_url)").eq("page_id",pg.id).order("created_at",{ascending:false}).limit(100);
    if(token!==state.renderToken || state.route!=="messages") return;
    if(error) return simplePage("Messages",pageContextBanner()+`<div class="empty-block"><b>Impossible de charger les messages de la Page.</b><small>${esc(error.message)}</small></div>`);
    const rows=(msgs||[]).map(m=>`<div class="list-row page-message-hub-row">${avatarHTML(m.profiles||{})}<div class="grow"><b>${esc(m.profiles?nameOf(m.profiles):"Visiteur")}</b><small>${esc(m.message||"")} · ${timeAgo(m.created_at)}</small></div></div>`).join("")||`<div class="empty">Aucun message reçu par ${esc(pg.name)}.</div>`;
    $("content").innerHTML=`<section class="clean-page messages-page page-mode-section">${pageContextBanner()}<div class="page-header clean-page-header"><div><span class="eyebrow">MESSAGERIE DE LA PAGE</span><h2>${esc(pg.name)}</h2><p class="page-kicker">Messages envoyés à votre Page.</p></div></div><div class="clean-list">${rows}</div></section>`;
  }

  async function messagesPage() {
    if(state.conversationChannel){ try{ await sb.removeChannel(state.conversationChannel); }catch(_){} state.conversationChannel=null; }
    state.selectedConversation=null;
    if(pageModeActive()) return pageMessagesHub();
    const token = state.renderToken;
    const { data: memberships, error } = await sb.from("conversation_members")
      .select("conversation_id")
      .eq("user_id", state.user.id);

    if (token !== state.renderToken || state.route !== "messages") return;
    if (error) return simplePage("Messages", `<div class="empty">${esc(error.message)}</div>`);

    await getBlockedIds();
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
      if(person && blockedCache.ids.has(person.id)) continue;
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
    await getBlockedIds();
    const { data: rawPeople } = await sb.from("profiles").select("*").neq("id", state.user.id).limit(50);
    const people=filterBlocked(rawPeople||[],"id");
    openModal(`<div class="modal-box"><button class="modal-close" data-action="close-modal">×</button><h3>Nouvelle conversation</h3><div>${(people||[]).map(p=>`<button class="list-row" style="width:100%;text-align:left" data-action="start-conversation" data-id="${esc(p.id)}">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b></div><span>›</span></button>`).join("")}</div></div>`);
  }
  async function startConversation(otherId) {
    if(!otherId || otherId===state.user.id)return;
    if(await denyIfBlocked(otherId,"Conversation impossible : ce compte est bloqué."))return;
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
    const otherIdCheck=(await sb.from("conversation_members").select("user_id").eq("conversation_id",id).neq("user_id",state.user.id).maybeSingle()).data?.user_id;
    if(otherIdCheck && await denyIfBlocked(otherIdCheck,"Conversation indisponible : ce compte est bloqué."))return;
    const { data: msgs } = await sb.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: true }).limit(200);
    await sb.rpc("tafa_mark_conversation_read", { p_conversation_id:id });
    const ids = [...new Set((msgs || []).map(m => m.sender_id))];
    const { data: profiles } = ids.length ? await sb.from("profiles").select("*").in("id", ids) : { data: [] };
    if (token !== state.renderToken) return;
    const map = new Map((profiles || []).map(p => [p.id, p]));
    const otherId = (await sb.from("conversation_members").select("user_id").eq("conversation_id", id).neq("user_id", state.user.id).maybeSingle()).data?.user_id;
    const otherProfile = otherId ? (await sb.from("profiles").select("*").eq("id", otherId).maybeSingle()).data : null;
    $("content").innerHTML = `<section class="clean-page messages-page conversation-page"><div class="page-header clean-page-header"><button class="page-back" data-action="page-back" type="button"><span aria-hidden="true">‹</span><small>Messages</small></button><div class="conversation-title">${avatarHTML(otherProfile || state.profile,"avatar conversation-avatar")}<div><h2>${esc(otherProfile ? nameOf(otherProfile) : "Discussion")}</h2><small id="conversationPresence" class="conversation-presence">Connexion sécurisée</small></div></div><span></span></div><div id="typingIndicator" class="typing-indicator" hidden>écrit…</div><div class="message-list clean-message-list">${(msgs||[]).map(m=>conversationMessageHTML(m,map)).join("")||`<div class="empty">Dites bonjour 👋</div>`}</div><form id="messageForm" class="comment-form clean-message-form"><input id="messageText" autocomplete="off" placeholder="Écrire un message..." required><button>Envoyer</button></form></section>`;

    // Conversation-level Realtime: typing + online presence without storing ephemeral state in SQL.
    if(state.conversationChannel){ try{ await sb.removeChannel(state.conversationChannel); }catch(_){} state.conversationChannel=null; }
    const convChannel=sb.channel(`tafass-conversation:${id}`, { config:{ broadcast:{ self:false }, presence:{ key:state.user.id } } });
    state.conversationChannel=convChannel;
    let typingTimer=null;
    const setTyping=(on)=>{ try{ convChannel.send({type:"broadcast",event:"typing",payload:{user_id:state.user.id,typing:!!on}}); }catch(_){} };
    convChannel.on("broadcast",{event:"typing"},({payload})=>{
      if(payload?.user_id===state.user.id) return;
      const el=$("typingIndicator"); if(!el)return;
      el.hidden=!payload?.typing; if(payload?.typing) el.textContent=`${esc(otherProfile ? nameOf(otherProfile) : "Votre contact")} écrit…`;
    });
    convChannel.on("presence",{event:"sync"},()=>{
      const present=convChannel.presenceState();
      const online=Object.keys(present||{}).some(k=>k!==state.user.id);
      const el=$("conversationPresence"); if(el) el.textContent=online ? "En ligne" : "Hors ligne";
    });
    convChannel.on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages",filter:`conversation_id=eq.${id}`},()=>{
      if(state.selectedConversation===id && state.route==="messages") openConversation(id);
      updateBadges();
    });
    convChannel.subscribe(async status=>{
      if(status==="SUBSCRIBED"){
        try{ await convChannel.track({user_id:state.user.id,online_at:new Date().toISOString()}); }catch(_){}
      }
    });

    const input=$("messageText");
    input?.addEventListener("input",()=>{
      setTyping(true); clearTimeout(typingTimer); typingTimer=setTimeout(()=>setTyping(false),1200);
    });
    $("messageForm").addEventListener("submit", async e => {
      e.preventDefault(); const text=$("messageText").value.trim(); if(!text)return;
      setTyping(false); clearTimeout(typingTimer);
      const otherId=(await sb.from("conversation_members").select("user_id").eq("conversation_id",id).neq("user_id",state.user.id).maybeSingle()).data?.user_id;
      if(otherId && await denyIfBlocked(otherId,"Message impossible : ce compte est bloqué."))return;
      const r=await sb.from("messages").insert({conversation_id:id,sender_id:state.user.id,content:text,is_read:false});
      if(r.error)toast(r.error.message); else {$("messageText").value=""; await openConversation(id);}
    });
  }


  function conversationMessageHTML(m, map){
    const mine=m.sender_id===state.user.id;
    const author=map.get(m.sender_id);
    const body=esc(m.content);
    const replyPreview = m.reply_to_content ? `<div class="message-reply-preview"><span class="message-reply-line"></span><div><b>${esc(m.reply_to_author || 'Message')}</b><span>${esc(String(m.reply_to_content).slice(0,180))}</span></div></div>` : '';
    const edited = m.updated_at && m.updated_at !== m.created_at ? ' · modifié' : '';
    return '<div class="message '+(mine?'mine':'')+'" data-message-id="'+esc(m.id)+'" data-author="'+esc(author?nameOf(author):'Membre')+'"><div class="message-card">'+replyPreview+'<div class="message-body">'+body+'</div><div class="message-meta"><small>'+timeAgo(m.created_at)+edited+(mine ? (m.is_read ? ' · Lu' : ' · Envoyé') : '')+'</small><button type="button" class="message-more" data-action="message-menu" data-id="'+esc(m.id)+'" aria-label="Options du message">⋯</button></div></div><div class="message-actions" role="group" aria-label="Actions du message"><button type="button" data-action="reply-message" data-id="'+esc(m.id)+'"><span>↩</span><small>Répondre</small></button>'+(mine?'<button type="button" data-action="edit-message" data-id="'+esc(m.id)+'"><span>✎</span><small>Modifier</small></button><button type="button" class="danger" data-action="delete-message" data-id="'+esc(m.id)+'"><span>⌫</span><small>Supprimer</small></button>':'')+'</div></div>';
  }

  async function refreshConversation(id){
    if(!id || state.selectedConversation!==id || state.route!=="messages") return;
    return openConversation(id);
  }

  async function editConversationMessage(id){
    if(!id) return;
    const r=await sb.from("messages").select("id,content,sender_id").eq("id",id).eq("sender_id",state.user.id).maybeSingle();
    if(r.error||!r.data) return toast("Ce message ne peut pas être modifié.");
    const current=String(r.data.content||"");
    openModal(`<div class="modal-box message-action-modal edit-message-modal"><button class="modal-close" data-action="close-modal">×</button><div class="message-action-icon edit">✎</div><span class="eyebrow">MESSAGE</span><h3>Modifier le message</h3><p class="muted">Corrigez votre message puis enregistrez les modifications.</p><textarea id="editMessageText" class="premium-textarea message-edit-textarea" maxlength="5000">${esc(current)}</textarea><div class="message-action-footer"><button class="ghost-action" data-action="close-modal">Annuler</button><button class="primary big" data-action="save-message-edit" data-id="${esc(id)}">Enregistrer</button></div></div>`);
    setTimeout(()=>{const el=$("editMessageText"); el?.focus(); el?.setSelectionRange(el.value.length,el.value.length);},40);
  }

  async function saveConversationMessageEdit(id){
    const text=$("editMessageText")?.value.trim()||"";
    if(!text) return toast("Le message ne peut pas être vide.");
    const u=await sb.from("messages").update({content:text,updated_at:new Date().toISOString()}).eq("id",id).eq("sender_id",state.user.id);
    if(u.error) return toast(u.error.message);
    closeModal(); toast("Message modifié");
    return refreshConversation(state.selectedConversation);
  }

  async function deleteConversationMessage(id){
    if(!id) return;
    const r=await sb.from("messages").select("id,content,sender_id").eq("id",id).eq("sender_id",state.user.id).maybeSingle();
    if(r.error||!r.data) return toast("Ce message ne peut pas être supprimé.");
    const preview=String(r.data.content||"").slice(0,120);
    openModal(`<div class="modal-box message-action-modal delete-message-modal"><button class="modal-close" data-action="close-modal">×</button><div class="message-action-icon danger">⌫</div><span class="eyebrow danger-eyebrow">SUPPRESSION</span><h3>Supprimer ce message ?</h3><p class="muted">Cette action supprimera définitivement votre message.</p><div class="delete-message-preview">${esc(preview)}${String(r.data.content||"").length>120?'…':''}</div><div class="message-action-footer"><button class="ghost-action" data-action="close-modal">Annuler</button><button class="danger-button" data-action="confirm-delete-message" data-id="${esc(id)}">Supprimer</button></div></div>`);
  }

  async function confirmDeleteConversationMessage(id){
    const d=await sb.from("messages").delete().eq("id",id).eq("sender_id",state.user.id);
    if(d.error) return toast(d.error.message);
    closeModal(); toast("Message supprimé");
    return refreshConversation(state.selectedConversation);
  }

  function messageActionMenu(id){
    const node=document.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`);
    if(!node) return;
    const mine=node.classList.contains("mine");
    openModal(`<div class="modal-box message-action-modal message-menu-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">MESSAGE</span><h3>Actions du message</h3><div class="message-menu-list"><button data-action="reply-message" data-id="${esc(id)}"><span class="menu-action-icon">↩</span><span><b>Répondre</b><small>Répondre à ce message</small></span><i>›</i></button>${mine?`<button data-action="edit-message" data-id="${esc(id)}"><span class="menu-action-icon">✎</span><span><b>Modifier</b><small>Changer le contenu du message</small></span><i>›</i></button><button class="danger-row" data-action="delete-message" data-id="${esc(id)}"><span class="menu-action-icon">⌫</span><span><b>Supprimer</b><small>Supprimer définitivement ce message</small></span><i>›</i></button>`:''}</div></div>`);
  }

  function replyConversationMessage(id){
    const node=document.querySelector(`[data-message-id="${CSS.escape(String(id))}"]`);
    if(!node) return;
    const text=node.querySelector(".message-body")?.textContent?.trim()||"";
    const author=node.dataset.author||"Membre";
    const input=$("messageText");
    if(!input) return;
    const composer=$("messageForm")?.parentElement || input.parentElement;
    let bar=$("replyComposerBar");
    if(!bar && composer){ bar=document.createElement("div"); bar.id="replyComposerBar"; bar.className="reply-composer-bar"; composer.prepend(bar); }
    if(bar) bar.innerHTML=`<span class="reply-composer-icon">↩</span><div><b>Répondre à ${esc(author)}</b><small>${esc(text.slice(0,120))}${text.length>120?'…':''}</small></div><button type="button" data-action="cancel-message-reply" aria-label="Annuler la réponse">×</button>`;
    input.value=""; input.dataset.replyTo=id; input.focus();
  }

  function cancelMessageReply(){
    const bar=$("replyComposerBar"); if(bar) bar.remove();
    const input=$("messageText"); if(input){ delete input.dataset.replyTo; input.focus(); }
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
        const actionAttrs = target ? `data-action="${esc(target.action)}" data-id="${esc(target.id || "")}"` : `data-action="notification-read" data-id="${esc(n.id)}"`; const roleButtons = (n.type==='page_role_request'||n.type==='group_role_request') ? `<span class="notification-role-actions"><button data-action="accept-role-request" data-id="${esc(n.entity_id||'')}">Accepter</button><button data-action="reject-role-request" data-id="${esc(n.entity_id||'')}">Refuser</button></span>` : "";
        const actorName = actor ? nameOf(actor) : "Un membre";
        return `<button class="list-row notification-row ${n.is_read ? "" : "unread"}" ${actionAttrs} data-notification="${esc(n.id)}">${avatarHTML(actor || null)}<div class="grow"><b>${esc(actorName)}</b><small>${esc(notificationAction(n))} · ${timeAgo(n.created_at)}</small></div>${n.is_read ? "" : '<span class="blue-dot"></span>'}${roleButtons}<span class="notification-arrow">›</span></button>`;
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

  async function getProfilePrivacy(userId) {
    if (!userId) return { locked:false, visibility:"public" };
    const { data, error } = await sb.from("user_settings")
      .select("profile_visibility,allow_messages,allow_friend_requests")
      .eq("user_id", userId).maybeSingle();
    if (error) console.warn("Tafaß profile privacy:", error.message);
    return { locked:data?.profile_visibility === "private", visibility:data?.profile_visibility || "public", settings:data || {} };
  }

  function lockedProfileScreen(p, isOwner=false) {
    const display = nameOf(p) || "Profil Tafaß";
    return `<section class="profile-locked-screen" data-page-route="profile">
      <div class="profile-lock-orbit"><div class="profile-lock-icon" aria-hidden="true">🔒</div></div>
      <div class="profile-lock-identity">${avatarHTML(p,"avatar profile-lock-avatar")}</div>
      <span class="eyebrow">TAFAß • CONFIDENTIALITÉ</span>
      <h2>Profil verrouillé</h2>
      <h3>${esc(display)}</h3>
      ${p.username ? `<div class="profile-lock-handle">@${esc(p.username)}</div>` : ""}
      <p class="profile-lock-message">Ny profil ankehitriny dia voasakan'ny tompony ny hiditra</p>
      <p class="profile-lock-message-fr">Le propriétaire de ce profil a verrouillé l’accès. Les informations, publications, photos, vidéos et relations privées ne sont pas accessibles.</p>
      <div class="profile-lock-status"><span>🔐</span><div><b>Accès protégé</b><small>Seul le propriétaire peut consulter le contenu complet de ce profil.</small></div></div>
      <div class="unavailable-actions"><button class="primary" data-route="home">Retour à l’accueil</button><button class="ghost-action" data-route="search">Rechercher</button></div>
    </section>`;
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
      $("content").innerHTML = `<section class="profile-unavailable premium-unavailable" data-page-route="profile"><div class="profile-unavailable-icon"><span>◌</span></div><span class="eyebrow">TAFAß • PROFIL</span><h2>Profil indisponible</h2><p>Ce profil n’est pas accessible actuellement. Il peut avoir été supprimé ou désactivé.</p><div class="unavailable-actions"><button class="primary" data-route="home">Retour</button><button class="ghost-action" data-route="search">Rechercher</button></div></section>`;
      return;
    }

    const isMe = userId === state.user.id;
    const liveQ = await sb.from("live_sessions").select("id,title,status,started_at").eq("user_id",userId).eq("status","live").order("started_at",{ascending:false}).limit(1).maybeSingle();
    const activeProfileLive = liveQ.data || null;
    if(!isMe && await isBlockedBetween(userId)){ $("content").innerHTML=`<section class="profile-locked-screen profile-blocked-screen" data-page-route="profile"><div class="profile-lock-orbit"><div class="profile-lock-icon">⊘</div></div><span class="eyebrow">TAFAß • BLOCAGE</span><h2>Compte inaccessible</h2><h3>Profil masqué</h3><p class="profile-lock-message-fr">Ce compte et votre compte sont bloqués l’un pour l’autre. Les profils, publications, relations et interactions ne sont pas accessibles.</p><div class="profile-lock-status"><span>🔒</span><div><b>Accès totalement bloqué</b><small>Vous ne pouvez ni voir ni contacter ce compte tant que le blocage est actif.</small></div></div><div class="unavailable-actions"><button class="ghost-action" data-route="home">Retour à l’accueil</button></div></section>`; return; }
    const privacy = await getProfilePrivacy(userId);
    // Le propriétaire voit toujours son propre profil, même lorsqu'il est verrouillé.
    if (!isMe) {
      if (privacy.locked) {
        $("content").innerHTML = lockedProfileScreen(p, false);
        return;
      }
      if (privacy.visibility === "friends") {
        const fr=(await sb.from("friendships").select("id").eq("user_id",state.user.id).eq("friend_id",userId).maybeSingle()).data;
        if(!fr) {
          $("content").innerHTML = `<section class="profile-locked-screen" data-page-route="profile"><div class="profile-lock-orbit"><div class="profile-lock-icon">🔐</div></div>${avatarHTML(p,"avatar profile-lock-avatar")}<span class="eyebrow">TAFAß • CONFIDENTIALITÉ</span><h2>Profil réservé aux amis</h2><h3>${esc(nameOf(p))}</h3><p class="profile-lock-message-fr">Ce profil est visible uniquement par les amis du propriétaire.</p><div class="profile-lock-status"><span>👥</span><div><b>Accès limité</b><small>Ajoutez cette personne comme ami pour demander l’accès.</small></div></div><div class="unavailable-actions"><button class="primary" data-action="add-friend" data-id="${esc(userId)}">Ajouter</button><button class="ghost-action" data-route="friends">Retour</button></div></section>`;
          return;
        }
      }
    }

    const { data: mine } = await sb.from("posts").select("*").eq("user_id", userId).order("created_at", { ascending:false }).limit(100);
    const postRows = mine || [];
    const friendsR = await sb.from("friendships").select("id", { count:"exact", head:true }).eq("user_id", userId);
    const followersR = await sb.from("follows").select("id", { count:"exact", head:true }).eq("following_id", userId);
    const cover = p.cover_url ? `style="background-image:url('${esc(p.cover_url)}')"` : "";
    const isLockedProfile = isMe && privacy.locked;
    if(isMe) { const pp=(await sb.from("privacy_protection_settings").select("capture_protection").eq("user_id",userId).maybeSingle()).data; applyNativeCaptureProtection(pp?.capture_protection !== false); }
    const [friendR, sentR, receivedR] = isMe ? [{data:null},{data:null},{data:null}] : await Promise.all([
      sb.from("friendships").select("id").eq("user_id",state.user.id).eq("friend_id",userId).maybeSingle(),
      sb.from("friend_requests").select("id,status").eq("sender_id",state.user.id).eq("receiver_id",userId).eq("status","pending").maybeSingle(),
      sb.from("friend_requests").select("id,status").eq("sender_id",userId).eq("receiver_id",state.user.id).eq("status","pending").maybeSingle()
    ]);
    const relationAction = isMe ? `<div class="profile-action-slot profile-action-left"><button class="primary" data-action="edit-profile">Modifier le profil</button></div>` : friendR.data ? `<div class="profile-action-slot profile-action-left"><button class="ghost-action" data-action="remove-friend" data-id="${esc(userId)}">Retirer des amis</button></div>` : receivedR.data ? `<div class="profile-action-slot profile-action-left"><button class="small-action" data-action="accept-friend" data-id="${esc(userId)}">Confirmer</button><button class="ghost-action" data-action="decline-friend" data-id="${esc(userId)}">Refuser</button></div>` : sentR.data ? `<div class="profile-action-slot profile-action-left"><button class="ghost-action" disabled>Demande envoyée</button></div>` : `<div class="profile-action-slot profile-action-left"><button class="primary" data-action="add-friend" data-id="${esc(userId)}">Ajouter</button></div>`;
    const actions = isMe ? relationAction : `${relationAction}<div class="profile-action-slot profile-action-center"><button class="ghost-action" data-action="message-user" data-id="${esc(userId)}">Messages</button></div><div class="profile-action-slot profile-action-right"><button class="round-button profile-more-button" data-action="profile-more" data-id="${esc(userId)}" aria-label="Plus d’options"><span aria-hidden="true">⋯</span></button></div>`;

    let body = "";
    for (const post of postRows) body += await postHTML({ ...post, author:p });
    if (!body) body = `<div class="empty profile-empty">Aucune publication pour le moment.</div>`;

    const ownerDetails = isMe ? `<div class="profile-owner-details"><div class="profile-owner-detail-head"><span class="eyebrow">MON PROFIL • INFORMATIONS</span><span class="profile-owner-lock-state">${isLockedProfile?'🔒 Verrouillé':'✓ Visible'}</span></div><div class="profile-owner-grid">
      <div><span>Nom complet</span><b>${esc(nameOf(p))}</b></div>
      ${p.username?`<div><span>Nom d’utilisateur</span><b>@${esc(p.username)}</b></div>`:""}
      ${p.email?`<div><span>E-mail</span><b>${esc(p.email)}</b></div>`:""}
      ${p.phone?`<div><span>Téléphone</span><b>${esc(p.phone)}</b></div>`:""}
      ${p.country?`<div><span>Pays</span><b>${esc(p.country)}</b></div>`:""}
      ${p.city_current?`<div><span>Ville actuelle</span><b>${esc(p.city_current)}</b></div>`:""}
      ${p.city_origin?`<div><span>Ville d’origine</span><b>${esc(p.city_origin)}</b></div>`:""}
      ${p.birth_date?`<div><span>Date de naissance</span><b>${esc(p.birth_date)}</b></div>`:""}
      ${p.gender?`<div><span>Genre</span><b>${esc(p.gender)}</b></div>`:""}
      ${p.created_at?`<div><span>Membre depuis</span><b>${new Date(p.created_at).toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}</b></div>`:""}
    </div></div>` : "";

    if (token !== state.renderToken) return;
    $("content").innerHTML = `<section class="profile-page-premium public-profile-page" data-page-route="profile">
      <div class="profile-cover-wrap"><div class="profile-cover" ${cover}></div></div>
      <div class="profile-main-premium">
        <div class="profile-identity-row">${avatarHTML(p,"avatar profile-avatar")}</div>
        <div class="profile-name-block"><h2 class="profile-name">${esc(nameOf(p))}${activeProfileLive ? ` <button class="profile-live-badge" data-action="watch-live" data-id="${esc(activeProfileLive.id)}">● EN DIRECT</button>` : ""}${isLockedProfile ? ' <span class="profile-locked-badge profile-locked-badge-centered" title="Profil verrouillé">🔒 Profil verrouillé</span>' : ''}</h2>${isLockedProfile ? '<small class="profile-protection-note">🔐 Ny profil ankehitriny dia voasakan’ny tompony ny hiditra • Seul vous pouvez voir le contenu complet.</small>' : ''}</div>
        <p class="profile-bio">${esc(p.bio || "")}</p>
        <div class="profile-actions">${actions}</div>
        <div class="profile-stats"><div class="profile-stat"><b>${postRows.length}</b><small>Publications</small></div><div class="profile-stat"><b>${friendsR.count || 0}</b><small>Amis</small></div><div class="profile-stat"><b>${followersR.count || 0}</b><small>Abonnés</small></div></div>
        ${ownerDetails}
        <div class="profile-info profile-info-v23"><div class="profile-info-title-v23">Présentation</div>${p.country ? `<div>🌍 Pays : ${esc(p.country)}</div>` : ""}${p.city_current ? `<div>⌖ Ville actuelle : ${esc(p.city_current)}</div>` : ""}${p.city_origin ? `<div>⌂ Ville d’origine : ${esc(p.city_origin)}</div>` : ""}${p.created_at ? `<div class="profile-member-v23">◷ Membre depuis ${new Date(p.created_at).toLocaleDateString("fr-FR", {month:"long", year:"numeric"})}</div>` : ""}</div>
        <div class="profile-tabs">${[["posts","Publications"],["photos","Photos"],["videos","Vidéos"],["friends","Amis"]].map(([k,v])=>`<button class="${k==="posts"?"active":""}" data-action="public-profile-tab" data-id="${esc(userId)}" data-tab="${k}">${v}</button>`).join("")}</div>
        <section class="profile-content-section profile-publications-section">${body}</section>
      </div>
    </section>`;
  }

  async function openUserProfileTab(userId, tab="posts") {
    if (!userId) return;
    if(userId!==state.user.id && await isBlockedBetween(userId)) return openUserProfile(userId);
    const { data:p }=await sb.from("profiles").select("*").eq("id",userId).maybeSingle();
    if(!p) return openUserProfile(userId);
    const isMe = userId === state.user.id;
    const privacy = await getProfilePrivacy(userId);
    if(!isMe && privacy.locked) { $("content").innerHTML = lockedProfileScreen(p,false); return; }
    const isLockedProfile = isMe && privacy.locked;
    const { data:posts }=await sb.from("posts").select("*").eq("user_id",userId).order("created_at",{ascending:false}).limit(100);
    const rows=(posts||[]).map(x=>({...x,author:p}));
    let body="";
    if(tab==="photos"){
      body=`<div class="photo-grid">${rows.filter(x=>x.media_type==="image"&&x.media_url).map(x=>`<img class="protected-media" src="${esc(x.media_url)}" alt="Photo publiée" loading="lazy">`).join("")||`<div class="empty profile-empty">Aucune photo publiée.</div>`}</div>`;
    } else if(tab==="videos"){
      body=rows.filter(x=>["video","reel"].includes(x.media_type)).map(x=>`<article class="profile-publication"><p>${esc(x.content||"")}</p><video class="post-media protected-media" src="${esc(x.media_url)}" controls preload="metadata"></video></article>`).join("")||`<div class="empty profile-empty">Aucune vidéo publiée.</div>`;
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
    if(r.error)return toast(r.error.message);
    await Promise.allSettled([
      sb.from("friend_requests").delete().or(`and(sender_id.eq.${state.user.id},receiver_id.eq.${id}),and(sender_id.eq.${id},receiver_id.eq.${state.user.id})`),
      sb.from("friendships").delete().or(`and(user_id.eq.${state.user.id},friend_id.eq.${id}),and(user_id.eq.${id},friend_id.eq.${state.user.id})`),
      sb.from("follows").delete().or(`and(follower_id.eq.${state.user.id},following_id.eq.${id}),and(follower_id.eq.${id},following_id.eq.${state.user.id})`)
    ]);
    blockedCache.loadedAt=0; await getBlockedIds(true); closeModal(); toast("Compte bloqué : accès et interactions désactivés"); await logActivity("profile_blocked","Compte bloqué","profile",id);
  }
  async function unblockProfile(id) {
    const r=await sb.from("blocked_profiles").delete().eq("blocker_id",state.user.id).eq("blocked_id",id);
    if(r.error)return toast(r.error.message); blockedCache.loadedAt=0; await getBlockedIds(true); closeModal(); toast("Compte débloqué");
  }

  async function profilePage(tab = state.profileTab) {
    const token = state.renderToken;
    state.profileTab = ["posts","photos","friends"].includes(tab) ? tab : "posts";
    tab = state.profileTab;
    const p = state.profile || {};
    const privacy = await getProfilePrivacy(state.user.id);
    const isLockedProfile = privacy.locked === true;
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
      tabBody = `<section class="profile-content-section"><div class="photo-grid">${photos.map(x => `<img class="protected-media" src="${esc(x.media_url)}" alt="Photo publiée" loading="lazy">`).join("") || `<div class="empty profile-empty">Aucune photo publiée.</div>`}</div></section>`;
    } else if (tab === "videos") {
      const videos = mine.filter(x => x.media_type === "video" || x.media_type === "reel");
      tabBody = `<section class="profile-content-section"><div class="profile-video-list">${videos.map(x => `<article class="profile-publication"><div class="profile-publication-head">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b><small>${timeAgo(x.created_at)} · ${x.media_type === "reel" ? "Reel" : "Vidéo"}</small></div></div>${x.content ? `<p>${esc(x.content)}</p>` : ""}<video class="post-media protected-media" src="${esc(x.media_url)}" controls preload="metadata"></video></article>`).join("") || `<div class="empty profile-empty">Aucune vidéo publiée.</div>`}</div></section>`;
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
        <div class="profile-name-block"><h2 class="profile-name">${esc(nameOf(p))}${isLockedProfile ? ' <span class="profile-locked-badge" title="Profil verrouillé">🔒 Profil verrouillé</span>' : ''}</h2>${isLockedProfile ? '<small class="profile-protection-note">🔐 Contenu protégé par les paramètres de confidentialité Tafaß</small>' : ''}</div>
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
        const up=await sb.storage.from('posts').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'});
        if(up.error) throw new Error('Upload : '+up.error.message);
        patch[key]=sb.storage.from('posts').getPublicUrl(path).data.publicUrl;
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


  // V35: explicit root-table projections prevent ambiguous owner_id references
  // when pages/groups are queried alongside member/profile relations.
  const PAGE_FIELDS = "id,name,logo_url,cover_url,owner_id,username,category,bio,created_at";
  const GROUP_FIELDS = "id,name,description,cover_url,owner_id,privacy,created_at";

  async function fetchPageById(id) {
    const {data,error}=await sb.from("pages").select(PAGE_FIELDS).eq("id",id).maybeSingle();
    return {data,error};
  }

  async function fetchGroupById(id) {
    const {data,error}=await sb.from("groups").select(GROUP_FIELDS).eq("id",id).maybeSingle();
    return {data,error};
  }

  async function pageBusinessSuite() {
    const token = state.renderToken;
    const {data: pages, error} = await sb.from("pages")
      .select("id,name,username,category,bio,logo_url,cover_url,owner_id,created_at")
      .eq("owner_id", state.user.id)
      .order("created_at",{ascending:false});

    if (error) return toast(error.message);
    if (token !== state.renderToken || !state.user) return;

    const pageIds = (pages || []).map(p => p.id);
    const stats = new Map();

    if (pageIds.length) {
      const [followersR, postsR, messagesR, membersR] = await Promise.all([
        sb.from("page_followers").select("page_id").in("page_id", pageIds),
        sb.from("page_posts").select("id,page_id,created_at,content,media_url,media_type").in("page_id", pageIds).order("created_at",{ascending:false}).limit(80),
        sb.from("page_messages").select("id,page_id,sender_id,created_at,message").in("page_id", pageIds).order("created_at",{ascending:false}).limit(80),
        sb.from("page_members").select("page_id,user_id,role").in("page_id", pageIds)
      ]);
      const f = followersR.data || [], po = postsR.data || [], me = messagesR.data || [], mm = membersR.data || [];
      pages.forEach(p => stats.set(p.id,{
        followers:f.filter(x=>x.page_id===p.id).length,
        posts:po.filter(x=>x.page_id===p.id),
        messages:me.filter(x=>x.page_id===p.id),
        members:mm.filter(x=>x.page_id===p.id)
      }));
    }

    const totalFollowers=[...stats.values()].reduce((n,x)=>n+x.followers,0);
    const totalPosts=[...stats.values()].reduce((n,x)=>n+x.posts.length,0);
    const totalMessages=[...stats.values()].reduce((n,x)=>n+x.messages.length,0);
    const totalManagers=[...stats.values()].reduce((n,x)=>n+x.members.filter(m=>m.role && m.role!=="member").length,0);

    const pageRows=(pages||[]).map(p=>{
      const s=stats.get(p.id)||{followers:0,posts:[],messages:[],members:[]};
      return `<article class="tbs-page-row">
        <button class="tbs-page-main" data-action="page-open" data-id="${esc(p.id)}">
          ${entityAvatarHTML(p,"page","tbs-page-avatar")}
          <span><b>${esc(p.name)}</b><small>${s.followers} abonnés · ${s.posts.length} publications · ${s.messages.length} messages</small>${p.category?`<em>${esc(p.category)}</em>`:""}</span>
        </button>
        <div class="tbs-page-actions">
          <button class="fb-gray-btn" data-action="page-switch" data-id="${esc(p.id)}">Mode Page</button>
          <button class="fb-more-btn" data-action="edit-page" data-id="${esc(p.id)}" aria-label="Gérer la Page">•••</button>
        </div>
      </article>`;
    }).join("");

    const recent = [];
    for (const p of pages||[]) {
      const s=stats.get(p.id); (s?.posts||[]).slice(0,5).forEach(post=>recent.push({...post,pageName:p.name}));
    }
    recent.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    const recentRows=recent.slice(0,8).map(p=>`<div class="tbs-activity-row"><span class="tbs-activity-dot"></span><div class="grow"><b>${esc(p.pageName)}</b><small>${p.content?esc(p.content.slice(0,90)):p.media_url?"Publication média":"Nouvelle publication"} · ${timeAgo(p.created_at)}</small></div></div>`).join("") || `<div class="tbs-empty">Aucune publication de Page pour le moment.</div>`;

    state.businessSuiteOpen = true;
    openModal(`<div class="modal-box tbs-modal" id="tbsBusinessSuite">
      <button class="modal-close" data-action="close-business-suite">×</button>
      <div class="tbs-header">
        <div class="tbs-brand-icon">${menuIcon("pages")}</div>
        <div><span class="eyebrow">TAFAß • BUSINESS</span><h2>Tafaß Business Suite</h2><p>Gérez vos Pages, publications, messages et équipes depuis un seul espace.</p></div>
      </div>

      <div class="tbs-metrics">
        <div><b>${pages?.length||0}</b><small>Pages</small></div>
        <div><b>${totalFollowers}</b><small>Abonnés</small></div>
        <div><b>${totalPosts}</b><small>Publications</small></div>
        <div><b>${totalMessages}</b><small>Messages</small></div>
      </div>

      <div class="tbs-toolbar">
        <button class="primary" data-action="create-page">＋ Créer une Page</button>
        <button class="fb-gray-btn" data-action="business-refresh">Actualiser</button>
      </div>

      <div class="tbs-section">
        <div class="tbs-section-head"><div><h3>Vos Pages</h3><small>${totalManagers} gestionnaire(s) avec rôle enregistré</small></div></div>
        <div class="tbs-pages-list">${pageRows || `<div class="tbs-empty"><b>Aucune Page</b><span>Créez votre première Page pour commencer à utiliser Tafaß Business Suite.</span><button class="primary" data-action="create-page">Créer une Page</button></div>`}</div>
      </div>

      <div class="tbs-section">
        <div class="tbs-section-head"><div><h3>Activité récente</h3><small>Données chargées depuis vos Pages Tafaß</small></div></div>
        <div class="tbs-activity">${recentRows}</div>
      </div>

      <div class="tbs-tools-grid">
        <button data-action="business-open-messages"><span>${menuIcon("messages")}</span><b>Messages</b><small>Consulter les messages reçus par vos Pages</small></button>
        <button data-action="business-open-pages"><span>${menuIcon("pages")}</span><b>Publications & Pages</b><small>Ouvrir la gestion réelle de vos Pages</small></button>
        <button data-action="business-open-team"><span>${menuIcon("friends")}</span><b>Équipe</b><small>Gérer les rôles des gestionnaires</small></button>
        <button data-action="business-open-settings"><span>${menuIcon("settings")}</span><b>Paramètres</b><small>Configurer une Page existante</small></button>
      </div>
    </div>`);
  }

  async function pagesHub() {
    const token = state.renderToken;
    const tab = state.pagesTab || "mine";
    let rows = [], followerRows = [], ownerMap = new Map();
    let q = sb.from("pages").select(PAGE_FIELDS).order("created_at",{ascending:false}).limit(60);
    if (tab === "mine") q = q.eq("owner_id", state.user.id);
    const {data,error} = await q;
    if (token !== state.renderToken || state.route !== "pages") return;
    if (error) return simplePage("Pages", `<div class="empty-block"><b>Impossible de charger les Pages.</b><small>${esc(error.message)}</small><button class="primary big" data-action="retry-route" data-route-target="pages">Réessayer</button></div>`);
    rows=data||[];
    const ids=rows.map(x=>x.id);
    if(ids.length){
      const f=await sb.from("page_followers").select("page_id,user_id").in("page_id",ids);
      if(!f.error) followerRows=f.data||[];
    }
    const followersCount=new Map(), following=new Set();
    followerRows.forEach(x=>{
      followersCount.set(x.page_id,(followersCount.get(x.page_id)||0)+1);
      if(x.user_id===state.user.id) following.add(x.page_id);
    });
    const mine=new Set(rows.filter(x=>x.owner_id===state.user.id).map(x=>x.id));
    const pageCard=x=>{
      const isMine=mine.has(x.id), isFollowing=following.has(x.id);
      return `<article class="fb-entity-row page-row">
        <button class="fb-entity-main" data-action="page-open" data-id="${esc(x.id)}">
          ${entityAvatarHTML(x,"page","fb-entity-avatar")}
          <span class="fb-entity-copy"><b>${esc(x.name)}</b><small>${followersCount.get(x.id)||0} abonnés${x.category?` · ${esc(x.category)}`:""}</small>${x.bio?`<em>${esc(x.bio)}</em>`:""}</span>
        </button>
        <div class="fb-entity-actions">
          ${isMine?`<button class="fb-blue-btn" data-action="page-switch" data-id="${esc(x.id)}">Basculer</button><button class="fb-more-btn" data-action="edit-page" data-id="${esc(x.id)}" aria-label="Gérer">•••</button>`
          :`<button class="${isFollowing?'fb-gray-btn':'fb-blue-btn'}" data-action="toggle-page-follow" data-id="${esc(x.id)}">${isFollowing?'Suivi(e)':'Suivre'}</button><button class="fb-more-btn" data-action="page-more" data-id="${esc(x.id)}">•••</button>`}
        </div>
      </article>`;
    };
    const title=tab==="mine"?"Vos Pages":"Découvrir";
    const content=rows.length?rows.map(pageCard).join(""):`<div class="fb-empty"><div>▣</div><b>${tab==="mine"?"Vous n’avez encore créé aucune Page":"Aucune Page disponible"}</b><span>${tab==="mine"?"Créez votre première Page pour commencer.":"Les Pages publiques apparaîtront ici."}</span><button class="fb-blue-btn" data-action="create-page">Créer une Page</button></div>`;
    return simplePage("Pages", `<section class="fb-hub fb-pages-hub">
      <div class="fb-top-tabs">
        <button class="${tab==="mine"?"active":""}" data-action="pages-tab" data-tab="mine">Vos Pages</button>
        <button class="fb-create-top" data-action="create-page">＋ Créer</button>
        <button class="${tab==="discover"?"active":""}" data-action="pages-tab" data-tab="discover">◉ Découvrir</button>
      </div>
      <div class="fb-section-heading"><h3>${title}</h3><button class="fb-link-btn" data-action="pages-tab" data-tab="discover">${tab==="mine"?"Découvrir":"Retour"}</button></div>
      ${tab==="mine"?`<div class="fb-business-card"><div class="fb-business-icon">◒</div><div><b>Tafaß Business Suite</b><small>Gérez les publications, messages et équipe de vos Pages.</small></div><button class="fb-gray-btn" data-action="page-business">Ouvrir</button></div>`:""}
      <div class="fb-entity-list">${content}</div>
    </section>`);
  }

  function groupSortMenu() {
    openModal(`<div class="modal-box fb-more-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • GROUPES</span><h3>Trier les groupes</h3><div class="fb-more-list"><button data-action="group-sort" data-sort="recent">🕘 <span>Plus récents</span></button><button data-action="group-sort" data-sort="members">👥 <span>Plus de membres</span></button><button data-action="group-sort" data-sort="name">A–Z <span>Nom du groupe</span></button></div></div>`);
  }

  async function groupsHub() {
    const token = state.renderToken;
    const tab = state.groupsTab || "mine";
    let rows=[], members=[];
    if(tab==="posts"){
      const {data:posts,error}=await sb.from("group_posts").select("*,profiles(first_name,last_name,username,avatar_url),group_post_reactions(id,user_id,reaction_type),group_post_comments(id,user_id,content,created_at,profiles(first_name,last_name,username,avatar_url))").order("created_at",{ascending:false}).limit(40);
      let postGroups=new Map();
      const postGroupIds=[...new Set((posts||[]).map(p=>p.group_id).filter(Boolean))];
      if(postGroupIds.length){
        const gr=await sb.from("groups").select(GROUP_FIELDS).in("id",postGroupIds);
        if(gr.error) return simplePage("Groupes",`<div class="empty-block"><b>Impossible de charger les Groupes.</b><small>${esc(gr.error.message)}</small></div>`);
        postGroups=new Map((gr.data||[]).map(g=>[g.id,g]));
      }
      if(token!==state.renderToken || state.route!=="groups")return;
      if(error)return simplePage("Groupes",`<div class="empty-block"><b>Impossible de charger les publications des groupes.</b><small>${esc(error.message)}</small></div>`);
      const postRows=(posts||[]).map(p=>{
        const g=postGroups.get(p.group_id)||{}, rs=p.group_post_reactions||[], cs=p.group_post_comments||[], mine=rs.some(r=>r.user_id===state.user.id);
        return `<article class="fb-group-post"><div class="fb-post-head">${avatarHTML(p.profiles||{},'avatar avatar-sm')}<div><b>${esc(nameOf(p.profiles||{}))}</b><small>dans <button class="fb-inline-link" data-action="group-open" data-id="${esc(g.id||"")}">${esc(g.name||"Groupe")}</button> · ${timeAgo(p.created_at)}</small></div></div>${p.content?`<p>${esc(p.content)}</p>`:""}${p.media_url?(String(p.media_type||"").startsWith("video")?`<video class="post-media" src="${esc(p.media_url)}" controls playsinline></video>`:`<img class="post-media" src="${esc(p.media_url)}" alt="Publication" loading="lazy">`):""}<div class="fb-post-counts"><span>${rs.length} réaction${rs.length!==1?"s":""}</span><span>${cs.length} commentaire${cs.length!==1?"s":""}</span></div><div class="fb-post-actions"><button class="${mine?"active":""}" data-action="group-post-like" data-id="${esc(p.id)}" data-entity-id="${esc(g.id||"")}">♡ J’aime</button><button data-action="group-post-comment" data-id="${esc(p.id)}" data-entity-id="${esc(g.id||"")}">💬 Commenter</button><button data-action="share-group-post" data-id="${esc(p.id)}" data-entity-id="${esc(g.id||"")}">↗ Partager</button></div></article>`;
      }).join("");
      return simplePage("Groupes", `<section class="fb-hub fb-groups-hub"><div class="fb-top-tabs"><button data-action="groups-tab" data-tab="mine">👥 Vos groupes</button><button class="active" data-action="groups-tab" data-tab="posts">▣ Publications</button><button data-action="groups-tab" data-tab="discover">◉ Découvrir</button></div><div class="fb-section-heading"><h3>Publications des groupes</h3><button class="fb-link-btn" data-action="groups-tab" data-tab="discover">Découvrir</button></div><div class="fb-post-feed">${postRows||`<div class="fb-empty"><div>▣</div><b>Aucune publication de groupe</b><span>Rejoignez des groupes pour retrouver leurs publications ici.</span></div>`}</div></section>`);
    }
    const groupQuery=sb.from("groups").select(GROUP_FIELDS).order("created_at",{ascending:false}).limit(60);
    const {data:all,error}=await groupQuery;
    if(token!==state.renderToken || state.route!=="groups")return;
    if(error)return simplePage("Groupes",`<div class="empty-block"><b>Impossible de charger les Groupes.</b><small>${esc(error.message)}</small><button class="primary big" data-action="retry-route" data-route-target="groups">Réessayer</button></div>`);
    const ids=(all||[]).map(x=>x.id);
    if(ids.length){const r=await sb.from("group_members").select("group_id,user_id,role").in("group_id",ids);if(!r.error)members=r.data||[];}
    const memberSet=new Set(members.filter(m=>m.user_id===state.user.id).map(m=>m.group_id));
    rows=tab==="mine"?(all||[]).filter(x=>memberSet.has(x.id)):(all||[]);
    const counts=new Map();members.forEach(m=>counts.set(m.group_id,(counts.get(m.group_id)||0)+1));
    rows.sort((a,b)=>{
      if(state.groupSort==="members") return (counts.get(b.id)||0)-(counts.get(a.id)||0);
      if(state.groupSort==="name") return String(a.name||"").localeCompare(String(b.name||""));
      return new Date(b.created_at||0)-new Date(a.created_at||0);
    });
    const card=x=>`<article class="fb-entity-row group-row"><button class="fb-entity-main" data-action="group-open" data-id="${esc(x.id)}">${entityAvatarHTML(x,"group","fb-entity-avatar")}<span class="fb-entity-copy"><b>${esc(x.name)}</b><small>${counts.get(x.id)||0} membres${x.privacy?` · ${x.privacy==="private"?"Privé":"Public"}`:""}</small>${x.description?`<em>${esc(x.description)}</em>`:""}</span></button><div class="fb-entity-actions">${memberSet.has(x.id)?`<button class="fb-gray-btn" data-action="group-open" data-id="${esc(x.id)}">Ouvrir</button>`:`<button class="fb-blue-btn" data-action="toggle-group-member" data-id="${esc(x.id)}">Rejoindre</button>`}<button class="fb-more-btn" data-action="group-open" data-id="${esc(x.id)}">•••</button></div></article>`;
    return simplePage("Groupes", `<section class="fb-hub fb-groups-hub">
      <div class="fb-top-tabs"><button class="${tab==="mine"?"active":""}" data-action="groups-tab" data-tab="mine">👥 Vos groupes</button><button data-action="groups-tab" data-tab="posts">▣ Publications</button><button class="${tab==="discover"?"active":""}" data-action="groups-tab" data-tab="discover">◉ Découvrir</button></div>
      <div class="fb-section-heading"><h3>${tab==="mine"?"Les plus visités":"Découvrir les groupes"}</h3><button class="fb-link-btn" data-action="${tab==="mine"?"group-sort-menu":"groups-tab"}" data-tab="mine">${tab==="mine"?"Trier":"Vos groupes"}</button></div>
      ${tab==="mine"?`<button class="fb-create-row" data-action="create-group"><span>＋</span><b>Créer un groupe</b></button>`:""}
      <div class="fb-entity-list">${rows.map(card).join("")||`<div class="fb-empty"><div>👥</div><b>${tab==="mine"?"Vous n’avez rejoint aucun groupe":"Aucun groupe disponible"}</b><span>${tab==="mine"?"Découvrez des communautés et rejoignez celles qui vous intéressent.":"Créez la première communauté."}</span><button class="fb-blue-btn" data-action="${tab==="mine"?"groups-tab":"create-group"}" data-tab="discover">${tab==="mine"?"Découvrir":"Créer un groupe"}</button></div>`}</div>
    </section>`);
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
    if (route === "pages") return pagesHub();
    if (route === "groups") return groupsHub();
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
      home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5M9.5 20v-6h5v6"/>',
      messages:'<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v7A3.5 3.5 0 0 1 16.5 16H10l-5.5 4v-4.6A3.5 3.5 0 0 1 4 12.5z"/><path d="M8 7h8M8 11h5"/>',
      notifications:'<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
      profile:'<circle cx="12" cy="8" r="3"/><path d="M5 20c.7-4 2.9-6 7-6s6.3 2 7 6"/>',
      friends:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.6-3.5 2.6-5.5 5.5-5.5s4.9 2 5.5 5.5M14.5 15c3.2-.2 5.2 1.4 6 4.5"/>',
      groups:'<circle cx="12" cy="8" r="3"/><path d="M4 20c.8-3.7 3.5-5.5 8-5.5s7.2 1.8 8 5.5"/>',
      pages:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/>',
      saved:'<path d="M6 4h12v17l-6-3.5L6 21z"/>',
      videos:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
      reels:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="m8 4 3 4m2-4 3 4M4 9h16M10 12l5 3-5 3z"/>',
      settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-2.5V20a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H6v-2.5h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V4h2.5v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v2.5h-.2a1.7 1.7 0 0 0-1.6 1z"/>',
      share:'<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 12v8h14v-8"/>' ,
      search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
      history:'<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5M12 7v5l3 2"/>',
      help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.7 2.7 0 1 1 4.2 2.2c-1.1.7-1.7 1.2-1.7 2.6M12 17h.01"/>',
      privacy:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
      tafab:'<path d="M6 4h7a5 5 0 0 1 0 10H9v6H6z"/><path d="M9 8h4a1.5 1.5 0 0 1 0 3H9z"/><path d="M16 15l3 3-3 3"/>',
      payment:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
      logout:'<path d="M10 5H5v14h5M14 8l5 4-5 4M19 12H9"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[type] || paths.settings}</svg>`;
  }

  function pageMenu(){
    const pg=state.activePage;
    if(!pg) return menuPage();
    const card=(action,title,sub,icon)=>`<button class="menu-card premium-menu-card page-menu-card" data-action="${action}" data-id="${esc(pg.id)}"><span class="menu-icon">${icon}</span><span class="menu-card-copy"><b>${title}</b><small>${sub}</small></span><span class="menu-arrow">›</span></button>`;
    simplePage("Menu",`${pageContextBanner()}<div class="page-menu-hero page-menu-hero-premium">${entityAvatarHTML(pg,"page","page-menu-avatar")}<div class="grow"><span class="eyebrow">MODE PAGE</span><h2>${esc(pg.name)}</h2><small>Vous utilisez Tafaß avec l’identité de cette Page.</small></div><button class="page-profile-mini" data-action="page-open" data-id="${esc(pg.id)}">Profil</button></div>
      <div class="page-menu-dashboard"><div><span>ESPACE PAGE</span><b>Centre de contrôle</b><small>Actualités, communauté, messages et paramètres.</small></div><span class="page-menu-live">● ACTIF</span></div>
      <div class="menu-section-title">Navigation de la Page</div><div class="menu-grid premium-menu-grid">
        ${card('page-open','Profil de la Page','Voir votre Page publiquement','◉')}${`<button class="menu-card premium-menu-card page-menu-card" data-route="home"><span class="menu-icon">⌂</span><span class="menu-card-copy"><b>Actualités</b><small>Publier et gérer le fil de la Page</small></span><span class="menu-arrow">›</span></button>`}${`<button class="menu-card premium-menu-card page-menu-card" data-route="messages"><span class="menu-icon">▤</span><span class="menu-card-copy"><b>Messages</b><small>Boîte de réception de la Page</small></span><span class="menu-arrow">›</span></button>`}${`<button class="menu-card premium-menu-card page-menu-card" data-route="search"><span class="menu-icon">⌕</span><span class="menu-card-copy"><b>Rechercher</b><small>Rechercher sur Tafaß</small></span><span class="menu-arrow">›</span></button>`}${`<button class="menu-card premium-menu-card page-menu-card" data-route="notifications"><span class="menu-icon">♢</span><span class="menu-card-copy"><b>Alertes</b><small>Activités liées à la Page</small></span><span class="menu-arrow">›</span></button>`}${`<button class="menu-card premium-menu-card page-menu-card" data-route="groups"><span class="menu-icon">◎</span><span class="menu-card-copy"><b>Groupes</b><small>Communautés</small></span><span class="menu-arrow">›</span></button>`}
      </div>
      <div class="menu-section-title">Gestion complète</div><div class="menu-grid premium-menu-grid">
        ${card('page-settings','Paramètres de la Page','Informations, confidentialité, messages et invitations','⚙')}${card('edit-page','Modifier les informations','Nom, @username, bio, contacts et visuels','✎')}${card('page-invite-friends','Inviter des amis','Chaque membre peut inviter ses amis','👥')}${card('page-business','Outils de gestion','Équipe, publication et gestion professionnelle','◒')}
      </div>
      <div class="menu-section-title">Compte</div><div class="menu-grid premium-menu-grid">${card('page-exit-mode','Retour au compte','Quitter le Mode Page et revenir au profil','↩')}</div>`);
  }

  async function pageSettings(id){
    const {data:p,error}=await fetchPageById(id||state.activePage?.id);
    if(error||!p)return toast(error?.message||'Page introuvable.');
    const key=`tafass_page_settings_${p.id}`;
    let saved={}; try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
    const toggle=(k,title,sub,def=true)=>`<label class="page-setting-row"><span><b>${title}</b><small>${sub}</small></span><input type="checkbox" data-page-setting="${k}" ${saved[k]??def?'checked':''}></label>`;
    openModal(`<div class="modal-box page-settings-modal"><button class="modal-close" data-action="close-modal">×</button><div class="page-settings-hero">${entityAvatarHTML(p,'page','page-settings-avatar')}<div><span class="eyebrow">TAFAß • PARAMÈTRES</span><h2>${esc(p.name)}</h2><p>Centre de contrôle complet de votre Page.</p></div></div>
      <div class="page-settings-section"><h3>Identité</h3><button class="page-setting-action" data-action="edit-page" data-id="${esc(p.id)}"><span>✎</span><div><b>Nom et informations</b><small>Nom, @username, catégorie, bio, contacts et visuels</small></div><strong>›</strong></button><button class="page-setting-action" data-action="page-name-history" data-id="${esc(p.id)}"><span>◷</span><div><b>Historique des noms</b><small>Consulter les anciens noms et les dates de changement</small></div><strong>›</strong></button></div>
      <div class="page-settings-section"><h3>Communauté</h3>${toggle('allow_invites','Invitations par les membres','Tous les utilisateurs peuvent inviter leurs amis à suivre la Page',true)}${toggle('allow_messages','Messages de la Page','Permettre aux visiteurs de contacter la Page',true)}${toggle('notify_followers','Alertes aux abonnés','Conserver les notifications importantes pour les abonnés',true)}</div>
      <div class="page-settings-section"><h3>Visibilité</h3>${toggle('public_profile','Profil public','La Page reste visible dans les recherches et partages',true)}${toggle('show_followers','Afficher les abonnés','Afficher le nombre d’abonnés sur le profil public',true)}</div>
      <button class="primary big" data-action="save-page-settings" data-id="${esc(p.id)}">Enregistrer les paramètres</button></div>`);
  }

  async function pageNameHistory(id){
    const {data:p}=await fetchPageById(id); if(!p)return toast('Page introuvable.');
    const r=await sb.from('activity_history').select('description,created_at').eq('user_id',state.user.id).eq('entity_type','page').eq('entity_id',id).eq('action_type','page_name_changed').order('created_at',{ascending:false}).limit(30);
    if(r.error)return toast(r.error.message);
    const rows=(r.data||[]).map(x=>`<div class="page-history-row"><span>◷</span><div><b>${esc(x.description||'Nom de Page modifié')}</b><small>${new Date(x.created_at).toLocaleString('fr-FR')}</small></div></div>`).join('')||`<div class="empty">Aucun ancien nom enregistré. Le nom actuel est « ${esc(p.name)} ».</div>`;
    openModal(`<div class="modal-box page-settings-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • HISTORIQUE</span><h3>Historique des noms</h3><p class="muted">Nom actuel : <b>${esc(p.name)}</b>. Un changement de nom est autorisé une fois tous les 15 jours.</p><div class="page-history-list">${rows}</div></div>`);
  }

  function menuPage() {
    state.backOverride = null;
    if(pageModeActive()) return pageMenu();
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
    simplePage("Menu", `<div class="menu-profile premium-menu-profile" data-route="profile"><button class="profile-link menu-profile-avatar" data-action="view-profile" data-id="${esc(p.id || "")}">${avatarHTML(p)}</button><div class="grow"><b>${esc(nameOf(p))}</b><small title="${esc(p.email || state.user?.email || "")}">${esc(p.email || state.user?.email || "")}</small></div><button class="small-action" data-route="profile">Profil</button></div><div class="menu-section-title">Raccourcis</div><div class="menu-grid premium-menu-grid">${items.map(card).join("")}</div><div class="menu-section-title">Services</div><div class="menu-grid premium-menu-grid">${actions.map(card).join("")}</div><div class="menu-section-title">Compte</div><div class="menu-grid premium-menu-grid"><button class="menu-card premium-menu-card danger-card" data-action="new-logout"><span class="menu-icon">${menuIcon("logout")}</span><span class="menu-card-copy"><b>Quitter le compte</b><small>Fermer la session sur cet appareil</small></span><span class="menu-arrow">›</span></button></div>`);
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
  function createPaymentRequest(method="Airtel Money"){
    openModal(`<div class="modal-box payment-modal-premium"><button class="modal-close" data-action="close-modal">×</button><div class="payment-brand"><span class="payment-brand-icon">₿</span><div><span class="eyebrow">TAFAß • PAIEMENT</span><h3>Nouvelle demande</h3></div></div><div class="payment-stepper"><span class="active">1<small>Montant</small></span><i></i><span>2<small>Vérification</small></span><i></i><span>3<small>Confirmation</small></span></div><div class="payment-methods"><button class="payment-method active" data-action="select-payment-method" data-payment-method="Airtel Money"><b>📱 Airtel Money</b><small>Paiement mobile</small></button><button class="payment-method" data-action="select-payment-method" data-payment-method="Yas Money"><b>📲 Yas Money</b><small>Paiement mobile</small></button></div><label class="payment-field">Montant (MGA)<input id="paymentAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="Ex. 10 000"></label><label class="payment-field">Numéro de paiement<input id="paymentPhone" type="tel" inputmode="tel" placeholder="03x xx xxx xx"></label><div class="payment-secure-note"><span>🔐</span><div><b>Paiement sécurisé</b><small>La demande est enregistrée dans Tafaß et reste en attente jusqu'à validation réelle. Aucun lien externe n'est affiché.</small></div></div><button class="primary big" data-action="payment-review">Continuer vers la vérification</button></div>`);
  }
  async function submitPaymentRequest(method,amount,phone){
    const n=Number(amount); if(!Number.isFinite(n)||n<=0)return toast("Montant invalide."); if(!phone.trim())return toast("Ajoutez le numéro de paiement.");
    const existing=await sb.from("payment_transactions").select("id,status").eq("user_id",state.user.id).eq("method",method).eq("amount",n).eq("status","pending").limit(1); if(existing.error)return toast(existing.error.message); if((existing.data||[]).length)return toast("Une demande identique est déjà en attente.");
    const r=await sb.from("payment_transactions").insert({user_id:state.user.id,method,amount:n,currency:"MGA",status:"pending",external_reference:phone.trim()}).select("id").single(); if(r.error)return toast(r.error.message);
    await logActivity("payment_request_created",`Demande de paiement ${method}`,"payment",r.data?.id||null);
    openModal(`<div class="modal-box payment-modal-premium payment-confirm-modal"><div class="payment-success-mark">✓</div><span class="eyebrow">TAFAß • DEMANDE ENREGISTRÉE</span><h3>Demande envoyée</h3><p class="muted">Votre demande de <b>${n.toLocaleString("fr-FR")} MGA</b> via <b>${esc(method)}</b> est enregistrée et attend une validation réelle.</p><div class="payment-receipt"><span>Montant</span><b>${n.toLocaleString("fr-FR")} MGA</b><span>Méthode</span><b>${esc(method)}</b><span>Numéro</span><b>${esc(phone.trim())}</b><span>État</span><b class="payment-pending">EN ATTENTE</b></div><button class="primary big" data-action="close-payment">Terminer</button></div>`);
  }

  async function settingsPage() {
    state.settingsDetailAction = null;
    const token = state.renderToken;
    let cfg = state.user ? (await sb.from("user_settings").select("*").eq("user_id", state.user.id).maybeSingle()).data : null;
    if (!cfg && state.user) {
      const r = await sb.from("user_settings").insert({ user_id: state.user.id }).select().single();
      cfg = r.data || {};
    }
    if (token !== state.renderToken || state.route !== "settings") return;

    const icon = type => menuIcon(type);
    const row = (action, type, title, sub, extra="") =>
      `<button type="button" class="fb-settings-row" data-action="${esc(action)}">
        <span class="fb-settings-icon">${icon(type)}</span>
        <span class="fb-settings-copy"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
        ${extra || `<span class="fb-settings-chevron">›</span>`}
      </button>`;

    const on = v => v !== false ? "Activé" : "Désactivé";
    const visibility = cfg?.profile_visibility || "public";
    const dark = state.theme === "dark";

    simplePage("Para & Conf", `
      <section class="fb-settings-page">
        <div class="fb-settings-mobile-head"><button data-action="page-back" aria-label="Retour">‹</button><b>Paramètres et confidentialité</b><button data-action="settings-focus-search" aria-label="Rechercher">${icon("search")}</button></div>
        <div class="fb-settings-search">
          <span>${icon("search")}</span><input id="settingsSearch" type="search" placeholder="Rechercher dans les paramètres" autocomplete="off">
        </div>

        <div class="fb-settings-group">
          <h3>Votre compte</h3>
          ${row("account-settings","profile","Espace Compte","Mot de passe, sécurité, informations personnelles, expériences partagées, préférences publicitaires, vérification")}
        </div>

        <div class="fb-settings-group">
          <h3>Outils et ressources</h3>
          <p class="fb-settings-note">Nos outils vous aident à contrôler et gérer votre confidentialité.</p>
          ${row("privacy-settings","privacy","Assistance confidentialité","Contrôlez la visibilité de votre profil et la façon dont les autres vous trouvent")}
          ${row("family-center","friends","Centre familial","Contrôles et conseils pour les comptes et les relations")}
          ${row("audience-defaults","groups","Paramètres d’audience par défaut","Choisissez l’audience utilisée par défaut pour vos nouvelles publications")}
        </div>

        <div class="fb-settings-group">
          <h3>Préférences</h3>
          <p class="fb-settings-note">Personnalisez votre expérience sur Tafaß.</p>
          ${row("reaction-settings","reels","Préférences des réactions","Gérez vos réactions et leur affichage")}
          ${row("notifications-settings","history","Notifications",on(cfg?.notifications_enabled))}
          ${row("accessibility-settings","settings","Accessibilité","Préférences d’affichage et d’interaction")}
          ${row("language-settings","language","Langue et région",cfg?.language === "mg" ? "Malagasy" : "Français")}
          ${row("media-settings","videos","Contenu multimédia","Lecture et affichage des photos et vidéos")}
          ${row("time-management","history","Gestion du temps","Contrôlez votre temps passé sur Tafaß")}
          ${row("effects-settings","profile","Effets pour le visage et les mains","Préférences des effets disponibles sur votre appareil")}
        </div>

        <div class="fb-settings-group">
          <h3>Audience et visibilité</h3>
          <p class="fb-settings-note">Choisissez qui voit ce que vous partagez sur Tafaß.</p>
          ${row("profile-lock","privacy", "Verrouillage du profil", visibility === "private" ? "Verrouillé" : "Non verrouillé")}
          ${row("account-settings","profile","Informations du profil","Informations personnelles et coordonnées")}
          ${row("professional-mode","pages","Mode professionnel","Utilisez vos outils Pages et Business Suite")}
          ${row("find-contact-settings","friends","Comment les autres peuvent vous trouver et vous contacter","Demandes d’amis, messages et recherche")}
          ${row("post-privacy","home","Publications","Audience de vos publications")}
          ${row("story-privacy","reels","Stories","Audience de vos stories")}
          ${row("page-privacy","pages","Pages","Pages que vous gérez et leurs permissions")}
          ${row("followers-public","friends","Followers et contenu public","Abonnés et visibilité du contenu public")}
          ${row("profile-identification","profile","Profil et identification","Profil, identification et apparence publique")}
          ${row("blocking","privacy","Blocage","Comptes bloqués et restrictions")}
          ${row("online-status","messages","Statut En ligne","Gérez la visibilité de votre présence")}
        </div>

        <div class="fb-settings-group">
          <h3>Paiements</h3>
          <p class="fb-settings-note">Gérez vos infos de paiement et votre activité.</p>
          ${row("payment-settings","payment","Paiement des publicités","Demandes et historique de paiement réel")}
        </div>

        <div class="fb-settings-group">
          <h3>Votre activité</h3>
          <p class="fb-settings-note">Examinez votre activité et le contenu dans lequel vous êtes identifié(e).</p>
          ${row("activity-settings","history","Historique d’activité","Actions et recherches enregistrées")}
          ${row("location-settings","profile","Localisation","Ville et informations de localisation de votre profil")}
          ${row("apps-web","pages","Applications et sites Web","Connexions et intégrations disponibles")}
          ${row("professional-integrations","pages","Intégrations professionnelles","Outils professionnels et Pages Tafaß")}
          ${row("information-management","settings","Comment gérer vos informations","Contrôle des informations de votre compte")}
        </div>

        <div class="fb-settings-group">
          <h3>Standards de la communauté et mentions légales</h3>
          ${row("terms","settings","Conditions de service","Règles et conditions d’utilisation de Tafaß")}
          ${row("privacy-policy","privacy","Politique de confidentialité","Comment Tafaß traite les informations")}
          ${row("cookies","settings","Politique d’utilisation des cookies","Informations sur les cookies et technologies similaires")}
          ${row("community-standards","friends","Standards de la communauté","Règles applicables aux contenus et comportements")}
          ${row("about-tafass","tafab","À propos","Informations sur Tafaß")}
        </div>

        <div class="fb-settings-footer">
          <button class="fb-settings-account-action" data-action="security-settings">${icon("privacy")}<span>Sécurité et connexion</span></button>
          <button class="fb-settings-account-action" data-action="new-logout">${icon("logout")}<span>Quitter le compte</span></button>
        </div>
      </section>
    `);

    const input = $("settingsSearch");
    input?.addEventListener("input", () => {
      const q = input.value.trim().toLowerCase();
      document.querySelectorAll(".fb-settings-row").forEach(el => {
        el.hidden = !!q && !el.textContent.toLowerCase().includes(q);
      });
      document.querySelectorAll(".fb-settings-group").forEach(group => {
        const visible = [...group.querySelectorAll(".fb-settings-row")].some(x => !x.hidden);
        group.hidden = !!q && !visible;
      });
    });
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
    if(state.route==="settings" && state.settingsDetailAction) return openAdvancedSetting(state.settingsDetailAction);
  }

  async function getSettingsTable(table) {
    const r = await sb.from(table).select("*").eq("user_id", state.user.id).maybeSingle();
    if (r.error) throw r.error;
    if (r.data) return r.data;
    const i = await sb.from(table).insert({ user_id: state.user.id }).select("*").single();
    if (i.error) throw i.error;
    return i.data;
  }

  function settingsBackToHub() {
    state.backOverride = "settings";
  }

  function settingsDetail(title, eyebrow, description, body) {
    settingsBackToHub();
    simplePage(title, `<section class="settings-detail-page">
      <div class="settings-detail-intro"><span class="eyebrow">${esc(eyebrow || "TAFAß • PARAMÈTRES")}</span>${description ? `<p>${esc(description)}</p>` : ""}</div>
      ${body}
    </section>`);
  }

  function settingSwitch(id, title, sub, checked, extra="") {
    return `<label class="settings-control-row" for="${esc(id)}"><span class="settings-control-copy"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><span class="settings-switch"><input id="${esc(id)}" type="checkbox" ${checked ? "checked" : ""}><i></i></span>${extra}</label>`;
  }

  function settingChoice(id, title, sub, value, options) {
    return `<label class="settings-control-row settings-choice-row" for="${esc(id)}"><span class="settings-control-copy"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><select id="${esc(id)}">${options.map(o=>`<option value="${esc(o[0])}" ${o[0]===value?"selected":""}>${esc(o[1])}</option>`).join("")}</select></label>`;
  }

  async function saveSettingsTable(table, patch, success="Paramètres enregistrés") {
    const r = await sb.from(table).upsert({ user_id: state.user.id, ...patch }, { onConflict:"user_id" });
    if (r.error) return toast(r.error.message);
    await logActivity("settings_updated", success, table);
    toast(success);
    return openAdvancedSetting(state.settingsDetailAction || "privacy-settings");
  }

  async function openAdvancedSetting(action) {
    state.settingsDetailAction = action;
    try {
      if (action === "profile-lock") {
        const cfg = (await sb.from("user_settings").select("profile_visibility").eq("user_id",state.user.id).maybeSingle()).data || {};
        const pc=(await sb.from("privacy_protection_settings").select("capture_protection,private_media_longpress").eq("user_id",state.user.id).maybeSingle()).data || {};
        settingsDetail("Verrouiller votre profil","TAFAß • CONFIDENTIALITÉ","Le verrouillage limite réellement l’accès au profil. Les protections média sont appliquées côté interface et, lorsque l’APK fournit un bridge sécurisé, au niveau natif.",
          `<div class="settings-hero-lock"><div class="settings-lock-icon">🔒</div><b>${cfg.profile_visibility === "private" ? "Votre profil est verrouillé" : "Votre profil est public"}</b><small>${cfg.profile_visibility === "private" ? "Les visiteurs non autorisés ne peuvent pas consulter vos publications privées." : "Votre profil est actuellement accessible selon vos règles d’audience."}</small></div>
           <div class="settings-control-list">${settingSwitch("profileLockToggle","Verrouiller le profil","Restreindre l’accès aux personnes autorisées.",cfg.profile_visibility === "private")}
           ${settingSwitch("protectCapture","Protection du contenu","Activer la protection contre la capture lorsque le conteneur Android Tafaß expose la fonction sécurisée.",pc.capture_protection !== false)}
           ${settingSwitch("protectLongPress","Protection des médias","Désactiver le menu contextuel et l’enregistrement direct par appui long sur les médias protégés.",pc.private_media_longpress !== false)}</div>
           <div class="settings-info-card"><b>Protection anti-capture</b><small>Un site Web ne peut pas garantir à lui seul l’impossibilité d’une capture d’écran. L’APK peut toutefois activer le mode sécurisé natif (FLAG_SECURE) lorsqu’il expose le bridge Tafaß.</small></div>
           <button class="primary big settings-save" data-action="save-profile-lock">Enregistrer</button>`);
        return;
      }

      if (action === "privacy-settings") {
        const [u,a,p] = await Promise.all([
          sb.from("user_settings").select("profile_visibility,allow_friend_requests,allow_messages,allow_search_by_phone,allow_search_by_email").eq("user_id",state.user.id).maybeSingle(),
          sb.from("audience_settings").select("default_post_audience,story_audience,followers_visibility").eq("user_id",state.user.id).maybeSingle(),
          sb.from("profile_identification_settings").select("allow_tagging,review_tags,search_engine_index").eq("user_id",state.user.id).maybeSingle()
        ]);
        const x=u.data||{}, y=a.data||{}, z=p.data||{};
        settingsDetail("Assistance confidentialité","TAFAß • CONFIDENTIALITÉ","Nous vous aidons à prendre les bonnes décisions pour préserver votre compte et votre contenu.",
          `<div class="privacy-choice-grid">
            <button class="privacy-choice" data-action="profile-identification"><span class="privacy-choice-icon">◉</span><b>Qui peut voir ce que vous partagez</b><small>Publications, stories et contenu public</small></button>
            <button class="privacy-choice" data-action="followers-public"><span class="privacy-choice-icon">◎</span><b>Comment les autres peuvent vous trouver</b><small>Followers, recherche et profil public</small></button>
            <button class="privacy-choice" data-action="profile-lock"><span class="privacy-choice-icon">▣</span><b>Verrouiller votre profil</b><small>${x.profile_visibility === "private" ? "Activé" : "Désactivé"}</small></button>
            <button class="privacy-choice" data-action="blocking"><span class="privacy-choice-icon">⊘</span><b>Comment protéger votre compte</b><small>Blocage et restrictions</small></button>
          </div>
          <div class="settings-section-block"><h3>Réglages rapides</h3>
            ${settingSwitch("privacyFriend","Autoriser les demandes d’amis","Les autres membres peuvent vous envoyer une demande.",x.allow_friend_requests !== false)}
            ${settingSwitch("privacyMessage","Autoriser les messages","Les autres membres peuvent vous contacter.",x.allow_messages !== false)}
            ${settingSwitch("privacyPhone","Recherche par téléphone","Votre compte peut être trouvé avec votre numéro.",x.allow_search_by_phone !== false)}
            ${settingSwitch("privacyEmail","Recherche par e-mail","Votre compte peut être trouvé avec votre adresse e-mail.",x.allow_search_by_email !== false)}
          </div>
          <button class="primary big settings-save" data-action="save-privacy-assistance">Enregistrer</button>`);
        return;
      }

      if (action === "find-contact-settings") {
        const x=(await sb.from("user_settings").select("allow_friend_requests,allow_messages,allow_search_by_phone,allow_search_by_email").eq("user_id",state.user.id).maybeSingle()).data||{};
        settingsDetail("Comment les autres peuvent vous trouver et vous contacter","TAFAß • CONTACT","Contrôlez qui peut vous trouver, vous contacter et vous envoyer une demande.",
          `<div class="settings-section-block"><h3>Demandes et contacts</h3>
            ${settingSwitch("findFriends","Demandes d’amis","Autoriser les autres membres à vous envoyer une demande d’ami.",x.allow_friend_requests !== false)}
            ${settingSwitch("findMessages","Messages","Autoriser les autres membres à vous envoyer des messages.",x.allow_messages !== false)}
            ${settingSwitch("findPhone","Recherche par téléphone","Permettre de trouver votre compte avec votre numéro.",x.allow_search_by_phone !== false)}
            ${settingSwitch("findEmail","Recherche par e-mail","Permettre de trouver votre compte avec votre adresse e-mail.",x.allow_search_by_email !== false)}
          </div><button class="primary big settings-save" data-action="save-find-contact-settings">Enregistrer</button>`);
        return;
      }

      if (action === "notifications-settings") {
        const x=(await sb.from("user_settings").select("notifications_enabled,message_notifications,friend_notifications,reaction_notifications,comment_notifications").eq("user_id",state.user.id).maybeSingle()).data||{};
        settingsDetail("Notifications","TAFAß • NOTIFICATIONS","Choisissez les alertes que vous souhaitez recevoir en temps réel.",
          `<div class="settings-section-block"><h3>Vos notifications</h3>
            ${settingSwitch("notifAll","Notifications générales","Activer les notifications Tafaß.",x.notifications_enabled !== false)}
            ${settingSwitch("notifMessages","Messages","Nouveaux messages et activités de conversation.",x.message_notifications !== false)}
            ${settingSwitch("notifFriends","Amis","Demandes d’amis et changements de relation.",x.friend_notifications !== false)}
            ${settingSwitch("notifReactions","Réactions","Réactions sur vos publications.",x.reaction_notifications !== false)}
            ${settingSwitch("notifComments","Commentaires","Nouveaux commentaires sur vos publications.",x.comment_notifications !== false)}
          </div><button class="primary big settings-save" data-action="save-notification-settings">Enregistrer</button>`);
        return;
      }

      if (action === "family-center") {
        const x=await getSettingsTable("family_settings");
        settingsDetail("Centre familial","TAFAß • FAMILLE","Des contrôles simples pour la sécurité, les relations et la confidentialité des comptes.",
          `<div class="settings-info-card"><b>Activité et contrôles</b><small>Gérez les protections disponibles dans votre compte Tafaß.</small></div>
           <div class="settings-section-block"><h3>Ressources pour les familles</h3>
             ${settingSwitch("familySafety","Mode sécurité","Renforcer les restrictions de contact et de visibilité.",x.safety_mode)}
             ${settingSwitch("familyContacts","Restrictions de contact","Limiter certaines interactions avec les comptes non autorisés.",x.contact_restrictions)}
           </div>
           <button class="primary big settings-save" data-action="save-family-settings">Enregistrer</button>`);
        return;
      }

      if (action === "media-settings") {
        const x=await getSettingsTable("media_settings");
        settingsDetail("Économiseur de données","TAFAß • MULTIMÉDIA","Réduisez la consommation de données mobiles sans désactiver les fonctions essentielles.",
          `<div class="settings-section-block"><h3>Économiseur de données</h3>
            ${settingSwitch("mediaSaver","Économiseur de données","Réduire la qualité et les téléchargements automatiques.",x.data_saver)}
            ${settingSwitch("mediaAutoplay","Lecture automatique des vidéos","Lire automatiquement les vidéos lorsque c’est possible.",x.autoplay_videos)}
            ${settingChoice("mediaQuality","Qualité vidéo et photo","Choisissez la qualité utilisée pour les médias.",x.upload_quality||"standard",[["data_saver","Économiseur de données"],["standard","Optimisée"],["high","Haute qualité"]])}
          </div>
          <button class="primary big settings-save" data-action="save-media-settings">Enregistrer</button>`);
        return;
      }

      if (action === "time-management") {
        const x=await getSettingsTable("time_management_settings");
        settingsDetail("Gestion du temps","TAFAß • VOTRE TEMPS","Contrôlez le temps passé sur Tafaß avec des limites et des rappels.",
          `<div class="time-summary-card"><b>${x.daily_limit_minutes>0 ? x.daily_limit_minutes+" min / jour" : "Aucune limite quotidienne"}</b><small>Votre limite est appliquée sur cet appareil lorsque le suivi est disponible.</small></div>
           <div class="settings-section-block">
             ${settingChoice("timeLimit","Limite quotidienne","0 désactive la limite.",String(x.daily_limit_minutes||0),[["0","Désactivée"],["15","15 minutes"],["30","30 minutes"],["60","1 heure"],["90","1 h 30"],["120","2 heures"]])}
             ${settingSwitch("timeReminders","Rappels de temps","Recevoir un rappel lorsque vous approchez de votre limite.",x.reminders_enabled)}
             ${settingChoice("quietStart","Début du mode silencieux","Heure de début des rappels silencieux.",String(x.quiet_start||"22:00"),[["20:00","20:00"],["21:00","21:00"],["22:00","22:00"],["23:00","23:00"]])}
             ${settingChoice("quietEnd","Fin du mode silencieux","Heure de fin des rappels silencieux.",String(x.quiet_end||"06:00"),[["05:00","05:00"],["06:00","06:00"],["07:00","07:00"],["08:00","08:00"]])}
           </div><button class="primary big settings-save" data-action="save-time-settings">Enregistrer</button>`);
        return;
      }

      if (action === "reaction-settings") {
        const x=await getSettingsTable("reaction_settings");
        settingsDetail("Préférences des réactions","TAFAß • RÉACTIONS","Contrôlez l’affichage des réactions sur vos publications et personnalisez votre expérience.",
          `<div class="settings-reaction-preview"><span>J’aime</span><span>J’adore</span><span>Solidaire</span><span>Haha</span><span>Waouh</span><span>Triste</span><span>En colère</span></div>
           <div class="settings-section-block">
             ${settingSwitch("reactionCounts","Masquer le nombre de réactions","Les autres ne voient pas le total de réactions sur vos publications.",!x.show_reaction_counts)}
             ${settingSwitch("reactionPersonalized","Réactions personnalisées","Utiliser les préférences de réactions adaptées à votre compte.",x.personalized_reactions)}
           </div><button class="primary big settings-save" data-action="save-reaction-settings">Enregistrer</button>`);
        return;
      }

      if (action === "story-privacy") {
        const [a,b]=(await Promise.all([getSettingsTable("audience_settings"),getSettingsTable("story_settings")]));
        settingsDetail("Stories","TAFAß • STORIES","Choisissez qui peut voir vos stories et ce que les autres peuvent en faire.",
          `<div class="settings-section-block"><h3>Contenu de vos stories</h3>
            ${settingChoice("storyAudience","Qui peut voir vos stories","Audience appliquée aux nouvelles stories.",a.story_audience||"public",[["public","Public"],["friends","Amis"],["private","Moi uniquement"]])}
            ${settingSwitch("storyPublicShare","Autoriser le partage des stories publiques","Les autres peuvent partager une story publique.",b.allow_public_sharing)}
            ${settingSwitch("storyPersonalShare","Autoriser le partage des stories personnelles","Autoriser le partage lorsque l’audience personnelle le permet.",b.allow_personal_sharing)}
            ${settingSwitch("storyMentionShare","Autoriser le partage des stories où vous êtes mentionné(e)","Contrôler le partage des stories contenant une mention.",b.allow_mention_sharing)}
            ${settingSwitch("storyShare","Autoriser le partage des stories","Contrôle général du partage des stories.",b.allow_story_sharing)}
            ${settingSwitch("storyArchive","Archiver les stories","Conserver automatiquement vos stories après leur expiration.",b.archive_stories)}
            ${settingSwitch("storyMuted","Stories mises en sourdine","Masquer les stories des comptes que vous avez mis en sourdine.",b.muted_stories_enabled)}
          </div><button class="primary big settings-save" data-action="save-story-settings">Enregistrer</button>`);
        return;
      }

      if (action === "post-privacy") {
        const x=await getSettingsTable("publication_settings");
        settingsDetail("Publications","TAFAß • PUBLICATIONS","Définissez l’audience de vos publications et les contrôles de partage.",
          `<div class="settings-section-block"><h3>Publications</h3>
            ${settingChoice("futureAudience","Qui peut voir vos futures publications","Audience par défaut des nouvelles publications.",x.future_audience||"public",[["public","Public"],["friends","Amis"],["private","Moi uniquement"]])}
            ${settingSwitch("limitOldPosts","Limiter qui peut voir les anciennes publications","Réduire l’audience des anciennes publications lorsque cette option est activée.",x.limit_old_posts)}
            ${settingSwitch("commentSummaries","Autoriser les résumés de commentaires","Afficher les résumés lorsqu’ils sont disponibles.",x.comment_summaries)}
            ${settingSwitch("sharePostsStory","Toujours partager les publications dans une story","Partager automatiquement les nouvelles publications dans votre story.",x.share_posts_to_story)}
          </div><button class="primary big settings-save" data-action="save-publication-settings">Enregistrer</button>`);
        return;
      }

      if (action === "audience-defaults") {
        const x=await getSettingsTable("audience_settings");
        settingsDetail("Paramètres d’audience par défaut","TAFAß • AUDIENCE","Définissez l’audience utilisée lorsque vous publiez du nouveau contenu.",
          `<div class="settings-section-block"><h3>Audience par défaut</h3>${settingChoice("audienceValue","Nouvelles publications","Audience utilisée par défaut.",x.default_post_audience||"public",[["public","Public"],["friends","Amis"],["private","Moi uniquement"]])}</div>
           <button class="primary big settings-save" data-action="save-audience-setting" data-audience-key="default_post_audience">Enregistrer</button>`);
        return;
      }

      if (action === "followers-public") {
        const x=await getSettingsTable("public_content_settings");
        settingsDetail("Followers et contenu public","TAFAß • CONTENU PUBLIC","Contrôlez les personnes qui peuvent vous suivre et les règles appliquées à votre contenu public.",
          `<div class="settings-section-block"><h3>Followers et contenu public</h3>
            ${settingChoice("followersVisibility","Qui peut me suivre","Détermine l’accès au suivi de votre compte.",x.followers_visibility||"public",[["public","Public"],["friends","Amis"],["private","Personne / privé"]])}
            ${settingChoice("followingVisibility","Qui peut voir les personnes et les Pages que vous suivez","Contrôle la visibilité de votre liste de suivi.",x.following_visibility||"private",[["public","Public"],["friends","Amis"],["private","Moi uniquement"]])}
            ${settingChoice("publicComments","Qui peut commenter vos publications publiques","Détermine qui peut commenter votre contenu public.",x.public_comments||"public",[["public","Tout le monde"],["followers","Followers"],["friends","Amis"],["private","Personne"]])}
            ${settingSwitch("publicNotifications","Notifications de publications publiques","Recevoir les notifications liées au contenu public.",x.public_post_notifications)}
            ${settingSwitch("publicProfileInfo","Informations de profil publiques","Afficher les informations publiques de votre profil.",x.public_profile_info)}
            ${settingSwitch("relevantComments","Afficher les commentaires les plus pertinents en premier","Trier les commentaires selon leur pertinence.",x.relevant_comments_first)}
            ${settingSwitch("offFacebookPreview","Aperçu hors Tafaß","Autoriser un aperçu de votre contenu public lorsqu’il est partagé hors de Tafaß.",x.off_facebook_preview)}
            ${settingSwitch("blocklistFilter","Filtre de la liste de blocage","Appliquer les règles de blocage au contenu public.",x.blocklist_filter)}
          </div><button class="primary big settings-save" data-action="save-public-content-settings">Enregistrer</button>`);
        return;
      }

      if (action === "profile-identification") {
        const x=await getSettingsTable("profile_identification_settings");
        settingsDetail("Profil et identification","TAFAß • PROFIL","Contrôlez les identifications, la validation des tags et la visibilité dans les moteurs de recherche.",
          `<div class="settings-section-block">
            ${settingSwitch("tagging","Autoriser les identifications","Les autres peuvent vous identifier dans les publications.",x.allow_tagging)}
            ${settingSwitch("reviewTags","Vérifier les identifications avant publication","Examiner les identifications avant qu’elles apparaissent sur votre profil.",x.review_tags)}
            ${settingSwitch("searchIndex","Autoriser l’indexation publique","Permettre aux moteurs de recherche d’indexer votre profil public.",x.search_engine_index)}
          </div><button class="primary big settings-save" data-action="save-profile-identification">Enregistrer</button>`);
        return;
      }

      if (action === "online-status") {
        const x=await getSettingsTable("online_status_settings");
        settingsDetail("Indiquer si vous êtes en ligne","TAFAß • MESSAGERIE","Choisissez si vos contacts peuvent voir votre présence et votre dernière activité.",
          `<div class="settings-info-card"><b>Votre statut En ligne</b><small>Ce réglage est appliqué à votre présence dans la messagerie Tafaß.</small></div>
           <div class="settings-section-block">${settingSwitch("onlineVisible","Indiquer quand vous êtes en ligne","Autoriser les autres à voir votre présence.",x.visible)}${settingSwitch("lastSeen","Afficher la dernière activité","Autoriser l’affichage de votre dernière activité.",x.last_seen_visible)}</div>
           <button class="primary big settings-save" data-action="save-online-settings">Enregistrer</button>`);
        return;
      }

      if (action === "location-settings") {
        const x=await getSettingsTable("location_settings");
        const lr=await sb.from("profile_locations").select("latitude,longitude,accuracy_m,place_name,updated_at").eq("user_id",state.user.id).maybeSingle();
        const loc=lr.data;
        const locText=loc ? `📍 ${esc(loc.place_name||"Position exacte enregistrée")} · précision ${Math.round(Number(loc.accuracy_m||0))} m · ${timeAgo(loc.updated_at)}` : "Aucune position exacte enregistrée sur cet appareil.";
        settingsDetail("Localisation","TAFAß • LOCALISATION","Utilisez la position réelle fournie par le GPS de votre appareil. La précision dépend du signal disponible et de l’autorisation accordée.",
          `<div class="settings-location-live"><b>Position actuelle</b><small id="locationLiveStatus">${locText}</small></div>
           <div class="settings-section-block">${settingSwitch("profileLocation","Localisation du profil","Afficher la ville/zone publique de votre profil.",x.profile_location_enabled)}${settingSwitch("preciseLocation","Localisation précise","Autoriser Tafaß à enregistrer les coordonnées GPS exactes lorsque vous le demandez.",x.precise_location_enabled)}</div>
           <button class="secondary-pill big" data-action="capture-exact-location">📍 Utiliser ma position exacte maintenant</button>
           <button class="primary big settings-save" data-action="save-location-settings">Enregistrer</button>`);
        return;
      }

      if (action === "professional-mode") {
        const x=await getSettingsTable("professional_settings");
        const pages=(await sb.from("pages").select("id,name,category,created_at").eq("owner_id",state.user.id).order("created_at",{ascending:false})).data||[];
        const pageRows=pages.length ? pages.map(pg=>`<button class="settings-link-row" data-action="page-open" data-id="${esc(pg.id)}"><span><b>${esc(pg.name)}</b><small>${esc(pg.category||"Page Tafaß")}</small></span><span>›</span></button>`).join("") : `<div class="settings-empty">Aucune Page. Créez une Page pour utiliser les outils professionnels.</div>`;
        settingsDetail("Mode professionnel","TAFAß • PROFESSIONNEL","Activez les outils professionnels de Tafaß. Vos Pages restent indépendantes de votre profil personnel.",
          `<div class="settings-section-block">${settingSwitch("professionalEnabled","Mode professionnel","Activer les outils professionnels disponibles pour votre compte.",x.enabled)}</div>
           <div class="settings-section-block"><h3>Vos Pages</h3>${pageRows}</div>
           <button class="primary big settings-save" data-action="save-professional-settings">Enregistrer</button>`);
        return;
      }

      if (action === "page-privacy") {
        const pages=(await sb.from("pages").select("id,name,category,created_at").eq("owner_id",state.user.id).order("created_at",{ascending:false})).data||[];
        const pageRows=pages.length ? pages.map(pg=>`<button class="settings-link-row" data-action="page-open" data-id="${esc(pg.id)}"><span><b>${esc(pg.name)}</b><small>${esc(pg.category||"Page")}</small></span><span>›</span></button>`).join("") : `<div class="settings-empty">Vous ne gérez encore aucune Page.</div>`;
        settingsDetail("Pages","TAFAß • PAGES","Gérez les Pages que vous administrez. Les permissions sont appliquées côté Supabase.",
          `<div class="settings-section-block"><h3>Vos Pages</h3>${pageRows}</div>
           <button class="ghost-action big" data-route="pages">Ouvrir Pages</button>`);
        return;
      }

      if (action === "blocking") {
        const r=await sb.from("blocked_profiles").select("id,blocked_id,created_at").eq("blocker_id",state.user.id).order("created_at",{ascending:false});
        if(r.error) throw r.error;
        const rows=r.data||[]; let profiles=[];
        if(rows.length){ const ids=rows.map(x=>x.blocked_id); profiles=(await sb.from("profiles").select("id,first_name,last_name,username,avatar_url").in("id",ids)).data||[]; }
        const map=new Map(profiles.map(x=>[x.id,x]));
        const blockedRows=rows.length ? rows.map(x=>{const u=map.get(x.blocked_id)||{}; const avatar=avatarHTML(u); const nm=esc(nameOf(u)||u.username||"Compte"); const handle=u.username?"@"+esc(u.username):"Compte bloqué"; return `<div class="blocked-row"><div class="blocked-avatar">${avatar}</div><div class="grow"><b>${nm}</b><small>${handle}</small></div><button class="ghost-action" data-action="unblock-from-settings" data-id="${esc(x.blocked_id)}">Débloquer</button></div>`}).join("") : `<div class="settings-empty">Aucun compte bloqué.</div>`;
        settingsDetail("Blocage","TAFAß • PROTECTION","Les personnes que vous bloquez ne peuvent plus interagir avec vous selon les règles de sécurité Tafaß.",
          `<div class="settings-section-block"><h3>Personnes bloquées</h3>${blockedRows}</div>`);
        return;
      }

      if (action === "apps-web") {
        const r=await sb.from("connected_apps").select("id,app_name,provider,status,connected_at").eq("user_id",state.user.id).order("connected_at",{ascending:false});
        if(r.error) throw r.error;
        const sessionId=(sb.auth.getSession ? (await sb.auth.getSession()).data?.session?.access_token : null) || "browser";
        const deviceId=`web-${btoa((navigator.userAgent||"tafass")).replace(/[^a-z0-9]/gi,"").slice(0,28)}`;
        const currentConn=await sb.from("connected_apps").select("id").eq("user_id",state.user.id).eq("app_name","Tafaß Web").eq("provider","Tafaß Web").eq("status","active").limit(1);
        if(!currentConn.error && !(currentConn.data||[]).length){ await sb.from("connected_apps").insert({user_id:state.user.id,app_name:"Tafaß Web",provider:"Tafaß Web",status:"active",connected_at:new Date().toISOString(),metadata:{device_id:deviceId,user_agent:navigator.userAgent||""}}); }
        const rr=await sb.from("connected_apps").select("id,app_name,provider,status,connected_at,metadata").eq("user_id",state.user.id).eq("status","active").order("connected_at",{ascending:false});
        const appRows=(rr.data||[]).map(x=>{const current=x.app_name==="Tafaß Web"&&x.metadata?.device_id===deviceId; const revoke=current?"":`<button class="ghost-action" data-action="revoke-connected-app" data-id="${esc(x.id)}">Révoquer</button>`; return `<div class="settings-link-row connection-real"><span><b>${esc(x.app_name)}</b><small>${current?'✓ Cet appareil · session actuelle':'✓ Connexion active'} · ${esc(x.provider||"Connexion externe")} · ${x.connected_at?timeAgo(x.connected_at):'à l’instant'}</small></span>${revoke}</div>`}).join("");
        settingsDetail("Applications et sites Web","TAFAß • CONNEXIONS","Les connexions affichées ici correspondent aux enregistrements actifs de votre compte Tafaß. Une connexion révoquée disparaît immédiatement de cette liste.",
          `<div class="settings-games-card"><div><span class="eyebrow">TAFAß • PLAY</span><h3>18+ Jeux premium</h3><p>Jeux intégrés et réellement jouables dans Tafaß : Ludo, Piano, Tetris, Mahjong, Échecs, Course, Football, Billard et plus.</p></div><button class="primary big" data-action="open-games">Explorer les jeux</button></div>
           <div class="settings-section-block"><div class="section-title-line"><h3>Connexions actives (${(rr.data||[]).length})</h3><small>Synchronisé avec Supabase · session réelle</small></div>${appRows || `<div class="settings-empty">Aucune connexion active.</div>`}</div>`);
        return;
      }

      if (action === "professional-integrations") {
        const r=await sb.from("professional_integrations").select("id,provider,status,connected_at").eq("user_id",state.user.id).order("connected_at",{ascending:false});
        if(r.error) throw r.error;
        const integrationRows=(r.data||[]).length ? (r.data||[]).map(x=>{const revoke=x.status==="active"?`<button class="ghost-action" data-action="revoke-professional-integration" data-id="${esc(x.id)}">Révoquer</button>`:""; return `<div class="settings-link-row"><span><b>${esc(x.provider)}</b><small>${esc(x.status||"active")} · ${timeAgo(x.connected_at)}</small></span>${revoke}</div>`}).join("") : `<div class="settings-empty">Aucune intégration professionnelle active.</div>`;
        settingsDetail("Intégrations professionnelles","TAFAß • BUSINESS","Gérez les intégrations professionnelles connectées à votre compte.",
          `<div class="settings-section-block"><h3>Intégrations</h3>${integrationRows}</div>`);
        return;
      }

      if (["terms","privacy-policy","cookies","community-standards","about-tafass"].includes(action)) {
        const docs={
          "terms":["Conditions de service","Les règles qui encadrent l’utilisation de Tafaß, la création de contenu et les interactions entre membres."],
          "privacy-policy":["Politique de confidentialité","Tafaß utilise les contrôles de compte et les politiques Supabase pour gérer l’accès aux informations personnelles et au contenu."],
          "cookies":["Politique d’utilisation des cookies","Tafaß peut utiliser des technologies locales nécessaires au fonctionnement de la session et des préférences de l’application."],
          "community-standards":["Standards de la communauté","Respectez les autres membres, ne publiez pas de contenu illégal ou dangereux et utilisez les outils de signalement lorsque nécessaire."],
          "about-tafass":["À propos","Tafaß est un réseau social conçu pour connecter les communautés et les utilisateurs autour d’une expérience moderne et locale."]
        };
        const d=docs[action];
        settingsDetail(d[0],"TAFAß • INFORMATIONS","Informations officielles de l’application.",`<div class="settings-legal-card"><h3>${esc(d[0])}</h3><p>${esc(d[1])}</p><small>Version Tafaß · ${esc(document.querySelector('meta[name="app-version"]')?.content||"build actuel")}</small></div>`);
        return;
      }

      if (action === "accessibility-settings") {
        const x=await getSettingsTable("accessibility_settings");
        settingsDetail("Accessibilité","TAFAß • ACCESSIBILITÉ","Adaptez l’affichage et les interactions pour votre confort.",
          `<div class="settings-section-block">${settingSwitch("largeText","Texte plus grand","Augmenter la taille des textes de l’interface.",x.large_text)}${settingSwitch("reduceMotion","Réduire les animations","Réduire les transitions et animations non essentielles.",x.reduce_motion)}${settingSwitch("highContrast","Contraste renforcé","Renforcer les contrastes pour une meilleure lisibilité.",x.high_contrast)}</div>
           <button class="primary big settings-save" data-action="save-accessibility-settings">Enregistrer</button>`);
        return;
      }

      if (action === "effects-settings") {
        const x=await getSettingsTable("effects_settings");
        settingsDetail("Effets pour le visage et les mains","TAFAß • EFFETS","Gérez les effets disponibles sur votre appareil.",
          `<div class="settings-section-block">${settingSwitch("effectsEnabled","Effets activés","Autoriser les effets compatibles avec votre appareil.",x.effects_enabled)}${settingSwitch("faceEffects","Effets pour le visage","Autoriser les effets liés au visage.",x.face_effects)}${settingSwitch("handEffects","Effets pour les mains","Autoriser les effets liés aux mains.",x.hand_effects)}</div>
           <button class="primary big settings-save" data-action="save-effects-settings">Enregistrer</button>`);
        return;
      }

      if (action === "information-management") {
        settingsDetail("Comment gérer vos informations","TAFAß • VOS INFORMATIONS","Utilisez les contrôles ci-dessous pour comprendre et gérer les informations enregistrées dans Tafaß.",
          `<div class="settings-section-block"><button class="settings-link-row" data-action="activity-settings"><span><b>Historique d’activité</b><small>Voir vos actions et recherches enregistrées</small></span><span>›</span></button><button class="settings-link-row" data-action="account-settings"><span><b>Informations du profil</b><small>Modifier les informations de votre profil</small></span><span>›</span></button><button class="settings-link-row" data-action="privacy-settings"><span><b>Confidentialité</b><small>Contrôler la visibilité de vos informations</small></span><span>›</span></button></div>`);
        return;
      }

      settingsDetail("Paramètre Tafaß","TAFAß • PARAMÈTRES","Cette section est disponible dans votre compte.",`<div class="settings-empty">Aucun réglage supplémentaire n’est nécessaire pour le moment.</div>`);
    } catch(e) {
      console.error("Tafaß settings detail:", action, e);
      settingsDetail("Paramètres","TAFAß • PARAMÈTRES","Impossible de charger ce réglage pour le moment.",`<div class="settings-empty">${esc(e?.message||"Service indisponible")}</div>`);
    }
  }

  async function captureExactLocation(){
    if(!navigator.geolocation) return toast("La géolocalisation n’est pas disponible sur cet appareil.");
    const status=$("locationLiveStatus"); if(status) status.textContent="Recherche de votre position GPS exacte…";
    navigator.geolocation.getCurrentPosition(async pos=>{
      const lat=Number(pos.coords.latitude), lon=Number(pos.coords.longitude), accuracy=Number(pos.coords.accuracy||0);
      let place="Position GPS";
      try{
        const u=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1`;
        const r=await fetch(u,{headers:{"Accept":"application/json","Accept-Language":"fr"}});
        if(r.ok){const j=await r.json(); const a=j.address||{}; place=[a.road,a.suburb,a.city||a.town||a.village,a.state,a.country].filter(Boolean).join(", ")||j.display_name||place;}
      }catch{}
      const r=await sb.from("profile_locations").upsert({user_id:state.user.id,latitude:lat,longitude:lon,accuracy_m:accuracy,place_name:place,source:"device_gps",updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if(r.error) return toast(r.error.message);
      await logActivity("location_updated",`Position exacte mise à jour · précision ${Math.round(accuracy)} m`,`location`);
      toast(`Position enregistrée · précision ${Math.round(accuracy)} m`);
      return openAdvancedSetting("location-settings");
    },err=>{if(status)status.textContent="Autorisation refusée ou position indisponible."; toast(err.code===1?"Autorisez la localisation pour utiliser cette fonction.":"Position GPS indisponible.");},{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  }

  async function applyNativeCaptureProtection(enabled){
    try{
      if(window.TafassAndroid?.setSecureFlag) await window.TafassAndroid.setSecureFlag(!!enabled);
      else if(window.AndroidTafass?.setSecureFlag) window.AndroidTafass.setSecureFlag(!!enabled);
      document.documentElement.classList.toggle("tafass-secure-content",!!enabled);
    }catch(e){}
  }

  async function saveSettingsDetail(action) {
    try {
      if(action==="save-profile-lock") {
        const visibility=$('profileLockToggle')?.checked?"private":"public";
        const a=await sb.from("user_settings").upsert({user_id:state.user.id,profile_visibility:visibility},{onConflict:"user_id"});
        if(a.error)return toast(a.error.message);
        const b=await sb.from("privacy_protection_settings").upsert({user_id:state.user.id,capture_protection:$('protectCapture')?.checked!==false,private_media_longpress:$('protectLongPress')?.checked!==false,updated_at:new Date().toISOString()},{onConflict:"user_id"});
        if(b.error)return toast(b.error.message);
        await applyNativeCaptureProtection($('protectCapture')?.checked!==false);
        await logActivity("profile_privacy_updated",visibility==="private"?"Profil verrouillé":"Profil déverrouillé","profile",state.user.id);
        toast("Confidentialité du profil enregistrée");
        return openAdvancedSetting("profile-lock");
      }
      if(action==="save-privacy-assistance") return saveUserSetting({allow_friend_requests:!!$('privacyFriend')?.checked,allow_messages:!!$('privacyMessage')?.checked,allow_search_by_phone:!!$('privacyPhone')?.checked,allow_search_by_email:!!$('privacyEmail')?.checked});
      if(action==="save-find-contact-settings") return saveUserSetting({allow_friend_requests:!!$('findFriends')?.checked,allow_messages:!!$('findMessages')?.checked,allow_search_by_phone:!!$('findPhone')?.checked,allow_search_by_email:!!$('findEmail')?.checked});
      if(action==="save-notification-settings") return saveUserSetting({notifications_enabled:!!$('notifAll')?.checked,message_notifications:!!$('notifMessages')?.checked,friend_notifications:!!$('notifFriends')?.checked,reaction_notifications:!!$('notifReactions')?.checked,comment_notifications:!!$('notifComments')?.checked});
      if(action==="save-family-settings") return saveSettingsTable("family_settings",{safety_mode:!!$('familySafety')?.checked,contact_restrictions:!!$('familyContacts')?.checked},"Contrôles familiaux enregistrés");
      if(action==="save-story-settings") return saveSettingsTable("story_settings",{allow_public_sharing:!!$('storyPublicShare')?.checked,allow_personal_sharing:!!$('storyPersonalShare')?.checked,allow_mention_sharing:!!$('storyMentionShare')?.checked,allow_story_sharing:!!$('storyShare')?.checked,archive_stories:!!$('storyArchive')?.checked,muted_stories_enabled:!!$('storyMuted')?.checked},"Réglages des stories enregistrés");
      if(action==="save-publication-settings") return saveSettingsTable("publication_settings",{future_audience:$('futureAudience')?.value||"public",limit_old_posts:!!$('limitOldPosts')?.checked,comment_summaries:!!$('commentSummaries')?.checked,share_posts_to_story:!!$('sharePostsStory')?.checked},"Réglages des publications enregistrés");
      if(action==="save-public-content-settings") return saveSettingsTable("public_content_settings",{followers_visibility:$('followersVisibility')?.value||"public",following_visibility:$('followingVisibility')?.value||"private",public_comments:$('publicComments')?.value||"public",public_post_notifications:!!$('publicNotifications')?.checked,public_profile_info:!!$('publicProfileInfo')?.checked,relevant_comments_first:!!$('relevantComments')?.checked,off_facebook_preview:!!$('offFacebookPreview')?.checked,blocklist_filter:!!$('blocklistFilter')?.checked},"Réglages du contenu public enregistrés");
      if(action==="save-media-settings") return saveSettingsTable("media_settings",{data_saver:!!$('mediaSaver')?.checked,autoplay_videos:!!$('mediaAutoplay')?.checked,upload_quality:$('mediaQuality')?.value||"standard"},"Préférences multimédia enregistrées");
      if(action==="save-time-settings") return saveSettingsTable("time_management_settings",{daily_limit_minutes:Number($('timeLimit')?.value||0),reminders_enabled:!!$('timeReminders')?.checked,quiet_start:$('quietStart')?.value||"22:00",quiet_end:$('quietEnd')?.value||"06:00"},"Gestion du temps enregistrée");
      if(action==="save-reaction-settings") return saveSettingsTable("reaction_settings",{show_reaction_counts:!$('reactionCounts')?.checked,personalized_reactions:!!$('reactionPersonalized')?.checked},"Préférences des réactions enregistrées");
      if(action==="save-audience-setting") return saveSettingsTable("audience_settings",{[$('audienceValue')?.closest('label')?.querySelector('select')?.id?($('audienceValue')?.id):"default_post_audience"]:$('audienceValue')?.value||"public"},"Audience enregistrée").then(()=>{});
      if(action==="save-followers-settings") return saveSettingsTable("audience_settings",{followers_visibility:$('followersVisibility')?.value||"public"},"Audience des followers enregistrée");
      if(action==="save-profile-identification") return saveSettingsTable("profile_identification_settings",{allow_tagging:!!$('tagging')?.checked,review_tags:!!$('reviewTags')?.checked,search_engine_index:!!$('searchIndex')?.checked},"Préférences de profil enregistrées");
      if(action==="save-online-settings") return saveSettingsTable("online_status_settings",{visible:!!$('onlineVisible')?.checked,last_seen_visible:!!$('lastSeen')?.checked},"Statut En ligne enregistré");
      if(action==="save-location-settings") return saveSettingsTable("location_settings",{profile_location_enabled:!!$('profileLocation')?.checked,precise_location_enabled:!!$('preciseLocation')?.checked},"Préférences de localisation enregistrées");
      if(action==="save-professional-settings") return saveSettingsTable("professional_settings",{enabled:!!$('professionalEnabled')?.checked},"Mode professionnel enregistré");
      if(action==="save-accessibility-settings") return saveSettingsTable("accessibility_settings",{large_text:!!$('largeText')?.checked,reduce_motion:!!$('reduceMotion')?.checked,high_contrast:!!$('highContrast')?.checked},"Accessibilité enregistrée");
      if(action==="save-effects-settings") return saveSettingsTable("effects_settings",{effects_enabled:!!$('effectsEnabled')?.checked,face_effects:!!$('faceEffects')?.checked,hand_effects:!!$('handEffects')?.checked},"Préférences des effets enregistrées");
    } catch(e) { toast(e?.message||"Impossible d’enregistrer ce réglage."); }
  }

  function securitySettings() {
    openModal(`<div class="modal-box settings-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • SÉCURITÉ</span><h3>Sécurité et connexion</h3><p class="muted">Compte connecté : ${esc(state.user?.email || "Compte Tafaß")}</p><div class="form-stack"><label>Nouveau mot de passe<input id="newPassword" type="password" minlength="6" autocomplete="new-password" placeholder="Au moins 6 caractères"></label><label>Confirmer le mot de passe<input id="confirmPassword" type="password" minlength="6" autocomplete="new-password" placeholder="Répétez le mot de passe"></label><button class="primary big" data-action="change-password">Modifier le mot de passe</button><button class="ghost-action big" data-action="new-logout">Se déconnecter</button></div></div>`);
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
    const clean = ["Amis","Messages","Alertes","Tafaß","Menu","Rechercher","Pages","Groupes","Reels","Enregistrements","Para & Conf","Profil","Aide","Paiement","Historique d'activité"].includes(title) || (state.route === "settings" && !!state.settingsDetailAction);
    const fbHub = ["Pages","Groupes"].includes(title) && String(body).includes("fb-hub");
    const customSettingsHeader = title === "Para & Conf";
    $("content").innerHTML = clean
      ? `<section class="clean-page clean-page-shell ${fbHub?"fb-shell":""} ${customSettingsHeader?"settings-shell":""}">${fbHub || customSettingsHeader ? "" : `<div class="page-header clean-page-header"><div><h2>${esc(title)}</h2></div></div>`}${body}</section>`
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
    // Do not block taps while the tiny visual transition finishes.
    pageLoading = false;
    document.body.classList.remove("page-loading");
    el.classList.add("done");
    setTimeout(() => { el.classList.remove("active","done"); }, 90);
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
      if (route === "home") await (pageModeActive() ? renderPageFeed() : renderFeed());
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
    if (document.body.classList.contains("modal-open")) closeModal();
    state.backOverride = null;
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
    if (route === "groups") state.groupsTab = "mine";
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
    // Deliberately disabled: Tafaß is dark-only in this stable build.
    state.theme = "dark";
    document.body.classList.remove("light");
    syncThemeButton();
    if (state.user) await sb.from("user_settings").upsert({user_id:state.user.id,theme:"dark"},{onConflict:"user_id"});
  }

  async function newLogout(){
    if(state.loggingOut)return;
    state.loggingOut=true;
    try{
      document.body.classList.add("app-logging-out");
      if(state.channel){try{await sb.removeChannel(state.channel);}catch(_){} state.channel=null;}
      if(state.liveFeedChannel){try{await sb.removeChannel(state.liveFeedChannel);}catch(_){} state.liveFeedChannel=null;}
      if(state.conversationChannel){try{await sb.removeChannel(state.conversationChannel);}catch(_){} state.conversationChannel=null;}
      if(realtimeRuntime.retryTimer){clearTimeout(realtimeRuntime.retryTimer);realtimeRuntime.retryTimer=null;}
      const {error}=await sb.auth.signOut();
      if(error)throw error;
      state.user=null; state.profile=null; state.posts=[]; state.friends=[]; state.stories=[];
      state.selectedConversation=null; state.viewingProfileId=null; state.activePage=null; state.entityBackRoute=null;
      state.navStack=["home"]; state.route="home"; state.composerOpen=false; state.composerLocation="";
      document.body.classList.remove("page-mode-active","modal-open");
      closeModal();
      $("app")?.classList.add("hidden");
      showLogin();
      window.scrollTo({top:0,left:0,behavior:"instant"});
    }catch(e){
      toast(e?.message||"Impossible de se déconnecter. Réessayez.");
    }finally{
      state.loggingOut=false;
      document.body.classList.remove("app-logging-out");
    }
  }
  async function setupRealtime() {
    if (!state.user || !navigator.onLine) return;
    if (state.channel) {
      try { await sb.removeChannel(state.channel); } catch (_) {}
      state.channel = null;
    }
    if (realtimeRuntime.retryTimer) { clearTimeout(realtimeRuntime.retryTimer); realtimeRuntime.retryTimer=null; }

    const channel = sb.channel(`tafa-live-ui:${state.user.id}`, { config:{ broadcast:{ self:false } } });
    const refresh = {
      profiles: () => { loadProfile(); if (state.route==="search") searchPage($("searchInput")?.value||""); if (state.viewingProfileId && state.route==="profile") openUserProfile(state.viewingProfileId); },
      posts: async () => { await loadPosts(); if (["home","profile","reels","saved"].includes(state.route)) render(); },
      comments: async () => { await loadPosts(); if (["home","profile"].includes(state.route)) render(); },
      comment_likes: () => { if (["home","profile"].includes(state.route)) render(); },
      comment_reactions: () => { if (["home","profile"].includes(state.route)) render(); },
      post_reactions: async () => { await loadPosts(); if (["home","profile"].includes(state.route)) render(); },
      post_shares: async () => { await loadPosts(); if (["home","profile"].includes(state.route)) render(); },
      notifications: () => { updateBadges(); if (state.route==="notifications") notificationsPage(); },
      messages: payload => { updateBadges(); if (state.route==="messages") state.selectedConversation ? openConversation(state.selectedConversation) : messagesPage(); },
      friend_requests: () => { updateBadges(); if (state.route==="friends") friendsPage(); if (state.viewingProfileId && state.route==="profile") openUserProfile(state.viewingProfileId); },
      friendships: () => { if (state.route==="friends") friendsPage(); if (state.viewingProfileId && state.route==="profile") openUserProfile(state.viewingProfileId); },
      follows: () => { if (state.route==="profile") state.viewingProfileId ? openUserProfile(state.viewingProfileId) : profilePage(state.profileTab); },
      groups: () => { if (state.route==="groups") genericListPage("groups"); },
      group_members: () => { if (state.route==="groups") genericListPage("groups"); },
      pages: () => { if (state.route==="pages") genericListPage("pages"); },
      page_followers: () => { if (state.route==="pages") genericListPage("pages"); const id=document.querySelector('.page-detail')?.dataset.pageId; if(id) openPageDetail(id); },
      saved_posts: () => { if (state.route==="saved") genericListPage("saved"); },
      user_settings: () => { if (state.route==="settings") settingsPage(); },
      audience_settings: () => { if (state.route==="settings" && state.settingsDetailAction) openAdvancedSetting(state.settingsDetailAction); },
      family_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="family-center") openAdvancedSetting("family-center"); },
      reaction_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="reaction-settings") openAdvancedSetting("reaction-settings"); },
      accessibility_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="accessibility-settings") openAdvancedSetting("accessibility-settings"); },
      media_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="media-settings") openAdvancedSetting("media-settings"); },
      time_management_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="time-management") openAdvancedSetting("time-management"); },
      effects_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="effects-settings") openAdvancedSetting("effects-settings"); },
      profile_identification_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="profile-identification") openAdvancedSetting("profile-identification"); },
      online_status_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="online-status") openAdvancedSetting("online-status"); },
      location_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="location-settings") openAdvancedSetting("location-settings"); },
      professional_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="professional-mode") openAdvancedSetting("professional-mode"); },
      connected_apps: () => { if (state.route==="settings" && state.settingsDetailAction==="apps-web") openAdvancedSetting("apps-web"); },
      professional_integrations: () => { if (state.route==="settings" && state.settingsDetailAction==="professional-integrations") openAdvancedSetting("professional-integrations"); },
      story_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="story-privacy") openAdvancedSetting("story-privacy"); },
      publication_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="post-privacy") openAdvancedSetting("post-privacy"); },
      public_content_settings: () => { if (state.route==="settings" && state.settingsDetailAction==="followers-public") openAdvancedSetting("followers-public"); },
      search_history: () => { if (state.route==="search") searchPage($("searchInput")?.value||""); },
      activity_history: () => { if (state.route==="menu") menuPage(); },
      blocked_profiles: () => { if (state.viewingProfileId && state.route==="profile") openUserProfile(state.viewingProfileId); },
      profile_reports: () => {},
      payment_transactions: () => { if (state.route==="settings") servicePage("payment"); },
      stories: () => { if (state.route==="home") render(); },
      story_views: () => { if (state.route==="home") render(); },
      reels: () => { if (state.route==="reels") render(); },
      calls: () => { if (state.route==="messages" && state.selectedConversation) openConversation(state.selectedConversation); },
      call_participants: () => { if (state.route==="messages" && state.selectedConversation) openConversation(state.selectedConversation); },
      media_assets: () => {},
      page_members: () => { if (state.businessSuiteOpen) pageBusinessSuite(); if (state.route==="pages") genericListPage("pages"); const id=document.querySelector('.page-detail')?.dataset.pageId; if(id) openPageDetail(id); },
      page_posts: () => { if (state.businessSuiteOpen) pageBusinessSuite(); const id=document.querySelector('.page-detail')?.dataset.pageId; if(id) openPageDetail(id); },
      page_post_reactions: () => { const id=document.querySelector('.page-detail')?.dataset.pageId; if(id) openPageDetail(id); },
      page_post_comments: () => { const id=document.querySelector('.page-detail')?.dataset.pageId; if(id) openPageDetail(id); },
      page_post_shares: () => { const id=document.querySelector('.page-detail')?.dataset.pageId; if(id) openPageDetail(id); },
      page_messages: () => { updateBadges(); if (state.businessSuiteOpen) pageBusinessSuite(); const id=document.querySelector('.page-detail')?.dataset.pageId; if(id && document.querySelector('.page-inbox-modal')) pageInbox(id); },
      group_posts: () => { const id=document.querySelector('.group-detail')?.querySelector('[data-action="group-publish"]')?.dataset.id; if(id) document.querySelector(`[data-action="group-open"][data-id="${id}"]`)?.click(); },
      group_post_reactions: () => {},
      group_post_comments: () => {},
      group_messages: () => { updateBadges(); },
      conversations: () => { if (state.route==="messages") state.selectedConversation ? openConversation(state.selectedConversation) : messagesPage(); },
      conversation_members: () => { if (state.route==="messages") messagesPage(); },
      tafab_listings: () => { if (state.route==="tafab") servicePage("marketplace"); },
      tafab_listing_messages: () => { if (state.route==="tafab") servicePage("marketplace"); },
      tafab_ads: () => {}
    };

    Object.keys(refresh).forEach(table => {
      channel.on("postgres_changes", { event:"*", schema:"public", table }, payload => {
        try { refresh[table](payload); } catch (e) { console.warn("Tafaß realtime refresh error:", table, e); }
      });
    });

    state.channel = channel;
    channel.subscribe(status => {
      realtimeRuntime.lastStatus=status;
      if (status === "SUBSCRIBED") {
        realtimeRuntime.retryCount=0; realtimeRuntime.reconnecting=false; networkBanner("");
        console.info("Tafaß Realtime: connecté");
      }
      if (["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(status)) {
        console.warn("Tafaß Realtime:", status);
        scheduleRealtimeReconnect();
      }
    });
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
      await loadPosts(); await setupRealtime(); ensureLiveFeedRealtime(); await render(); toast('Compte complété. Bienvenue sur Tafaß.');
    } catch(e){ setLoading(btn,false,'Déverrouiller Tafaß'); toast(e?.message||'Impossible de valider le compte.'); }
  }

  async function enterApp() {
    if (state.entering || !state.user) return;
    state.entering = true;
    // Never hide an already authenticated app during token refresh/background re-entry.
    // The auth screen is shown only when there is genuinely no session.
    const appWasVisible = !$("app")?.classList.contains("hidden");
    if (!appWasVisible) $("app")?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    document.body.classList.toggle("light", state.theme === "light");
    syncThemeButton();
    try{
      await loadProfile();
      if (!(await profileIsComplete())) {
        showOAuthOnboarding();
        return;
      }
      await splashReady;
      $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
      await loadPosts(); await setupRealtime(); ensureLiveFeedRealtime();
      await render();
    }finally{
      state.entering = false;
    }
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

  async function pagePostReaction(postId, pageId){
    const {data:mine,error:readErr}=await sb.from('page_post_reactions').select('id').eq('page_post_id',postId).eq('user_id',state.user.id).maybeSingle();
    if(readErr)return toast(readErr.message);
    const r=mine?await sb.from('page_post_reactions').delete().eq('id',mine.id):await sb.from('page_post_reactions').insert({page_post_id:postId,user_id:state.user.id,reaction_type:'like'});
    if(r.error)return toast(r.error.message);
    return openPageDetail(pageId);
  }
  async function pagePostComment(postId,pageId){
    openModal(`<div class="modal-box interaction-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • COMMENTAIRE</span><h3>Commenter la publication</h3><textarea id="pageCommentInput" class="premium-input" maxlength="2000" placeholder="Écrivez votre commentaire…"></textarea><button class="primary big" data-action="page-send-comment" data-id="${esc(postId)}" data-entity-id="${esc(pageId)}">Publier le commentaire</button></div>`);
    setTimeout(()=>$('pageCommentInput')?.focus(),50);
  }
  async function pagePostShare(postId,pageId){
    const {error}=await sb.from('page_post_shares').insert({page_post_id:postId,user_id:state.user.id,share_message:''});
    if(error)return toast(error.message);
    toast('Publication partagée.');
    return openPageDetail(pageId);
  }
  async function groupPostReaction(postId,groupId){
    const {data:mine,error:readErr}=await sb.from('group_post_reactions').select('id').eq('group_post_id',postId).eq('user_id',state.user.id).maybeSingle();
    if(readErr)return toast(readErr.message);
    const r=mine?await sb.from('group_post_reactions').delete().eq('id',mine.id):await sb.from('group_post_reactions').insert({group_post_id:postId,user_id:state.user.id,reaction_type:'like'});
    if(r.error)return toast(r.error.message);
    return reopenGroupDetail(groupId);
  }
  async function groupPostComment(postId,groupId){
    openModal(`<div class="modal-box interaction-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • GROUPE</span><h3>Commenter la publication</h3><textarea id="groupCommentInput" class="premium-input" maxlength="2000" placeholder="Écrivez votre commentaire…"></textarea><button class="primary big" data-action="group-send-comment" data-id="${esc(postId)}" data-entity-id="${esc(groupId)}">Publier le commentaire</button></div>`);
    setTimeout(()=>$('groupCommentInput')?.focus(),50);
  }
  async function groupPostShare(postId,groupId){
    const {error}=await sb.from('group_post_shares').insert({group_post_id:postId,user_id:state.user.id,share_message:''});
    if(error)return toast(error.message);
    toast('Publication partagée.');
    return reopenGroupDetail(groupId);
  }
  async function reopenGroupDetail(id){
    const listBtn=document.querySelector(`[data-action="group-open"][data-id="${CSS.escape(id)}"]`);
    if(listBtn){ listBtn.click(); return; }
    return toast('Actualisez les Groupes pour rouvrir cette communauté.');
  }
  async function openPageDetail(id){
    const {data:x,error:xerr}=await fetchPageById(id);
    if(xerr) return toast(xerr.message);
    if(!x) return toast('Page introuvable.');
    const [follow,followers,owner,members,posts]=await Promise.all([
      sb.from('page_followers').select('id').eq('page_id',id).eq('user_id',state.user.id).maybeSingle(),
      sb.from('page_followers').select('id',{count:'exact',head:true}).eq('page_id',id),
      sb.from('profiles').select('first_name,last_name,username,avatar_url,email,phone,country,city_current,bio').eq('id',x.owner_id).maybeSingle(),
      sb.from('page_members').select('user_id,role,profiles(first_name,last_name,username,avatar_url)').eq('page_id',id).order('created_at',{ascending:true}),
      sb.from('page_posts').select('*,page_post_reactions(id,user_id,reaction_type),page_post_comments(id,user_id,content,created_at,profiles(first_name,last_name,username,avatar_url)),page_post_shares(id,user_id)').eq('page_id',id).order('created_at',{ascending:false}).limit(30)
    ]);
    if(posts.error) return toast(posts.error.message);
    const ownerMe=x.owner_id===state.user.id;
    const nameHistoryR=await sb.from('activity_history').select('description,created_at').eq('user_id',x.owner_id).eq('entity_type','page').eq('entity_id',id).eq('action_type','page_name_changed').order('created_at',{ascending:false}).limit(10);
    const nameHistory=nameHistoryR.data||[];
    const previousName=nameHistory[0]?.description ? (String(nameHistory[0].description).match(/Ancien nom\s*:\s*(.*?)\s*→/)||[])[1] : '';
    const myRole=(members.data||[]).find(m=>m.user_id===state.user.id)?.role || null;
    const canManage=ownerMe || ['owner','admin'].includes(myRole);
    const canPublish=ownerMe || ['owner','admin'].includes(myRole);
    const followerCount=followers.count||0;
    const postCount=posts.data?.length||0;
    const avatar=entityAvatarHTML(x,'page','page-detail-avatar');
    const postRows=(posts.data||[]).map(p=>{
      const reactions=p.page_post_reactions||[], comments=p.page_post_comments||[], shares=p.page_post_shares||[];
      const mine=reactions.some(r=>r.user_id===state.user.id);
      const commentPreview=comments.slice(-3).map(c=>`<div class="page-comment-row">${avatarHTML(c.profiles||{},'avatar page-comment-avatar')}<div><b>${esc(nameOf(c.profiles||{}))}</b><span>${esc(c.content||'')}</span><small>${timeAgo(c.created_at)}</small></div></div>`).join('');
      return `<article class="page-post-card" data-page-post="${esc(p.id)}">
        <header class="page-post-head"><div class="page-post-author">${entityAvatarHTML(x,'page','page-post-avatar')}<div><b>${esc(x.name)}</b><small>${timeAgo(p.created_at)} · Page</small></div></div>${(p.user_id===state.user.id||canManage)?`<button class="page-icon-btn" data-action="delete-page-post" data-id="${esc(p.id)}" data-entity-id="${esc(id)}" aria-label="Supprimer">⋯</button>`:''}</header>
        ${p.content?`<div class="page-post-text">${esc(p.content)}</div>`:''}
        ${p.media_url?(String(p.media_type||'').startsWith('video')?`<video class="page-post-media" src="${esc(p.media_url)}" controls playsinline preload="metadata"></video>`:`<img class="page-post-media" src="${esc(p.media_url)}" alt="Publication ${esc(x.name)}" loading="lazy">`):''}
        <div class="page-post-stats"><span>${reactions.length} réaction${reactions.length===1?'':'s'}</span><span>${comments.length} commentaire${comments.length===1?'':'s'}</span><span>${shares.length} partage${shares.length===1?'':'s'}</span></div>
        <div class="page-post-actions"><button class="${mine?'active':''}" data-action="page-post-like" data-id="${esc(p.id)}" data-entity-id="${esc(id)}">${mine?'♥':'♡'} J’aime</button><button data-action="page-post-comment" data-id="${esc(p.id)}" data-entity-id="${esc(id)}">💬 Commenter</button><button data-action="share-page-post" data-id="${esc(p.id)}" data-entity-id="${esc(id)}">↗ Partager</button></div>
        ${commentPreview?`<div class="page-comments-preview">${commentPreview}</div>`:''}
      </article>`;
    }).join('') || `<div class="page-empty-state"><div class="page-empty-icon">✦</div><b>Aucune publication pour le moment</b><span>Les nouvelles publications de la Page apparaîtront ici instantanément.</span></div>`;
    const team=(members.data||[]).map(m=>`<div class="page-team-row">${avatarHTML(m.profiles||{},'avatar page-team-avatar')}<div class="grow"><b>${esc(nameOf(m.profiles||{}))}</b><small>${esc(m.role||'editor')}</small></div>${canManage&&m.user_id!==state.user.id?`<button class="page-team-role" data-action="page-member-menu" data-id="${esc(m.user_id)}" data-entity-id="${esc(id)}">⋯</button>`:''}</div>`).join('') || '<div class="muted">Aucun gestionnaire supplémentaire.</div>';
    const ownerName=owner.data?nameOf(owner.data):'';
    const about=`<div class="page-info-grid"><div><small>Catégorie</small><b>${esc(x.category||'Autre')}</b></div><div><small>Créée le</small><b>${new Date(x.created_at).toLocaleDateString('fr-FR')}</b></div><div><small>Responsable</small><b>${esc(ownerName||'Membre Tafaß')}</b></div><div><small>Adresse</small><b>${esc(x.address||owner.data?.city_current||'Non renseignée')}</b></div>${previousName?`<div class="wide page-old-name-detail"><small>Ancien nom</small><b>${esc(previousName)}</b><em>Nom précédent enregistré le ${new Date(nameHistory[0].created_at).toLocaleDateString('fr-FR')}</em></div>`:''}${x.contact_email?`<div><small>E-mail</small><b>${esc(x.contact_email)}</b></div>`:''}${x.contact_phone?`<div><small>Téléphone</small><b>${esc(x.contact_phone)}</b></div>`:''}${x.website_url?`<div class="wide"><small>Site web</small><b>${esc(x.website_url)}</b></div>`:''}</div>`;
    openModal(`<div class="modal-box page-premium-modal page-detail fb-style-detail" data-page-id="${esc(id)}">
      <button class="entity-back-btn" data-action="close-entity" data-route-back="${esc(state.entityBackRoute || "pages")}" aria-label="Retour aux Pages"><span>‹</span><small>Pages</small></button>
      <div class="page-cover" ${x.cover_url?`style="background-image:url('${esc(x.cover_url)}')"`:''}><div class="page-cover-overlay"></div><div class="page-live-badge">● PAGE</div></div>
      <div class="page-profile-head page-profile-head-v2"><div class="page-avatar-wrap">${avatar}<span class="page-verified">✓</span></div></div>
      <div class="page-profile-copy-v2"><h2>${esc(x.name)}</h2>${x.username?`<div class="page-handle">@${esc(x.username)}</div>`:''}<p>${esc(x.bio||'Présentez votre activité, votre communauté et vos actualités.')}</p><div class="page-follow-line"><span><b>${followerCount}</b> abonnés</span><span><b>${postCount}</b> publications</span></div></div>
      <div class="page-top-actions page-primary-actions">${ownerMe?`<button class="page-action primary" data-action="page-switch" data-id="${esc(id)}">⇄ Basculer</button><button class="page-action secondary" data-action="edit-page" data-id="${esc(id)}">⚙ Gérer la Page</button>`:`<button class="page-action ${follow.data?'secondary':'primary'}" data-action="toggle-page-follow" data-id="${esc(id)}">${follow.data?'✓ Suivie':'＋ Suivre'}</button><button class="page-action secondary" data-action="page-contact" data-id="${esc(id)}">💬 Messages</button>`}<button class="page-action secondary" data-action="page-profile" data-id="${esc(id)}">◉ Profil</button><button class="page-action secondary page-more-action" data-action="page-more" data-id="${esc(id)}" aria-label="Plus d’options">•••</button></div>
      <nav class="page-tabs"><button class="active" data-action="page-tab" data-tab="posts" data-id="${esc(id)}">Publications</button><button data-action="page-tab" data-tab="about" data-id="${esc(id)}">À propos</button><button data-action="page-tab" data-tab="team" data-id="${esc(id)}">Équipe</button></nav>
      ${canPublish?`<section class="page-composer"><div class="page-composer-title"><span>✦</span><div><b>Publier en tant que ${esc(x.name)}</b><small>${myRole==='editor'?'Éditeur':'Gestionnaire'}</small></div></div><textarea id="pagePostText" maxlength="5000" placeholder="Partagez une actualité avec vos abonnés…"></textarea><div class="page-composer-bottom"><label class="page-media-btn">＋ Média<input id="pagePostMedia" type="file" accept="image/*,video/*" hidden></label><span id="pagePostMediaName">Aucun fichier</span><button class="page-publish-btn" data-action="page-publish" data-id="${esc(id)}">Publier</button></div></section>`:''}
      <section class="page-tab-panel page-live-section" data-tab="posts"><div class="page-section-title"><div><span>ACTUALITÉ</span><h3>Publications</h3></div><strong>● EN DIRECT</strong></div><div class="page-post-list">${postRows}</div></section>
      <section class="page-tab-panel page-about-section hidden" data-tab="about"><div class="page-section-title"><div><span>INFORMATIONS</span><h3>À propos de la Page</h3></div></div>${about}</section>
      <section class="page-tab-panel page-team-section hidden" data-tab="team"><div class="page-section-title"><div><span>GESTION</span><h3>Équipe de la Page</h3></div>${canManage?`<button class="page-small-btn" data-action="page-add-member" data-id="${esc(id)}">＋ Ajouter</button>`:''}</div>${team}</section>
    </div>`);
    const media=$('pagePostMedia'); media?.addEventListener('change',()=>{ const f=media.files?.[0]; $('pagePostMediaName').textContent=f?f.name:'Aucun fichier'; });
  }

  async function pageMore(id){
    const {data:p,error}=await sb.from('pages').select('id,name,owner_id,username').eq('id',id).maybeSingle();
    if(error||!p) return toast(error?.message||'Page introuvable.');
    const {data:m}=await sb.from('page_members').select('role').eq('page_id',id).eq('user_id',state.user.id).maybeSingle();
    const isAdmin=p.owner_id===state.user.id || m?.role==='admin';
    openModal(`<div class="modal-box page-more-menu-modal"><button class="modal-close" data-action="close-modal">×</button><div class="more-menu-hero"><span class="eyebrow">TAFAß • ${esc(p.name)}</span><h3>Plus d’options</h3><p>Gérez ou partagez cette Page selon vos droits.</p></div><div class="more-menu-grid"><button class="more-menu-item" data-action="page-invite-friends" data-id="${esc(id)}"><span>👥</span><div><b>Inviter des amis</b><small>Envoyer une invitation à suivre la Page</small></div></button><button class="more-menu-item" data-action="page-share" data-id="${esc(id)}"><span>↗</span><div><b>Partager la Page</b><small>Partager avec vos contacts</small></div></button><button class="more-menu-item" data-action="page-copy-link" data-id="${esc(id)}"><span>🔗</span><div><b>Copier le lien</b><small>Copier l’adresse de la Page</small></div></button>${isAdmin?`<button class="more-menu-item" data-action="edit-page" data-id="${esc(id)}"><span>⚙</span><div><b>Gérer la Page</b><small>Informations, équipe et paramètres</small></div></button>`:''}<button class="more-menu-item" data-action="page-report" data-id="${esc(id)}"><span>⚑</span><div><b>Signaler la Page</b><small>Signaler un problème</small></div></button></div></div>`);
  }

  async function pageInviteFriends(id){
    const {data:friends,error}=await sb.from('friendships').select('user_id,friend_id').or(`user_id.eq.${state.user.id},friend_id.eq.${state.user.id}`).limit(200);
    if(error)return toast(error.message);
    const ids=[...(friends||[])].map(f=>f.user_id===state.user.id?f.friend_id:f.user_id).filter(Boolean);
    if(!ids.length)return openModal(`<div class="modal-box page-more-menu-modal"><button class="modal-close" data-action="close-modal">×</button><h3>Inviter des amis</h3><p class="muted">Vous n’avez pas encore d’ami à inviter.</p></div>`);
    const [profilesR,followersR,invitesR]=await Promise.all([
      sb.from('profiles').select('id,first_name,last_name,username,avatar_url').in('id',ids),
      sb.from('page_followers').select('user_id').eq('page_id',id).in('user_id',ids),
      sb.from('notifications').select('user_id').eq('entity_type','page').eq('entity_id',id).eq('type','page_follow_invite').in('user_id',ids).limit(200)
    ]);
    const followed=new Set((followersR.data||[]).map(x=>x.user_id)), invited=new Set((invitesR.data||[]).map(x=>x.user_id));
    const rows=(profilesR.data||[]).map(u=>`<label class="invite-friend-row ${followed.has(u.id)?'disabled':''}"><input type="checkbox" value="${esc(u.id)}" ${followed.has(u.id)?'disabled':''}><span>${avatarHTML(u,'avatar tiny-avatar')}</span><span class="grow"><b>${esc(nameOf(u))}</b><small>${followed.has(u.id)?'Déjà abonné(e)':invited.has(u.id)?'Invitation déjà envoyée':'@'+esc(u.username||'membre')}</small></span></label>`).join('');
    openModal(`<div class="modal-box page-more-menu-modal page-invite-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • INVITATION</span><h3>Inviter des amis à suivre</h3><p class="muted">Tout utilisateur peut inviter ses amis. Une notification sera envoyée directement à chaque ami sélectionné.</p><div class="invite-friend-list">${rows}</div><button class="primary big" data-action="send-page-invites" data-id="${esc(id)}">Envoyer les invitations</button></div>`);
  }

  async function sendPageInvites(id){
    const ids=[...document.querySelectorAll('.invite-friend-list input:checked')].map(x=>x.value);
    if(!ids.length)return toast('Sélectionnez au moins un ami.');
    const pg=(await fetchPageById(id)).data; if(!pg)return toast('Page introuvable.');
    const rows=ids.map(uid=>({user_id:uid,actor_id:state.user.id,type:'page_follow_invite',title:`Invitation à suivre ${pg.name}`,message:`Vous êtes invité à suivre la Page ${pg.name}.`,entity_type:'page',entity_id:id}));
    const r=await sb.from('notifications').insert(rows); if(r.error)return toast(r.error.message);
    await logActivity('page_invites_sent',`${ids.length} invitation(s) envoyée(s) pour ${pg.name}`,'page',id);
    closeModal(); toast(`${ids.length} invitation${ids.length>1?'s':''} envoyée${ids.length>1?'s':''}.`);
  }

  async function pageShare(id){
    const url=`${location.origin}${location.pathname}#/pages/${id}`;
    if(navigator.share){ try{await navigator.share({title:'Page Tafaß',url});}catch{} } else { await navigator.clipboard?.writeText(url); toast('Lien de la Page copié.'); }
  }

  async function pageCopyLink(id){
    const url=`${location.origin}${location.pathname}#/pages/${id}`;
    try{await navigator.clipboard.writeText(url); toast('Lien copié.');}catch{toast(url);}
  }

  async function pageReport(id){
    const reason=prompt('Pourquoi souhaitez-vous signaler cette Page ?'); if(!reason)return;
    const r=await sb.from('page_reports').insert({reporter_id:state.user.id,page_id:id,reason});
    if(r.error)return toast(r.error.message); closeModal(); toast('Signalement envoyé.');
  }

  async function togglePageFollow(id){
    const exists=(await sb.from('page_followers').select('id').eq('page_id',id).eq('user_id',state.user.id).maybeSingle()).data;
    const r=exists?await sb.from('page_followers').delete().eq('id',exists.id):await sb.from('page_followers').insert({page_id:id,user_id:state.user.id});
    if(r.error) return toast(r.error.message);
    if(!exists){
      const pg=(await fetchPageById(id)).data;
      if(pg?.owner_id && pg.owner_id!==state.user.id){
        await sb.from('notifications').insert({user_id:pg.owner_id,actor_id:state.user.id,type:'page_follow',title:'Nouvel abonné',message:`Un membre suit maintenant ${pg.name}.`,entity_type:'page',entity_id:id});
      }
    }
    toast(exists?'Vous ne suivez plus cette Page.':'Vous suivez maintenant cette Page.');
    return openPageDetail(id);
  }

  async function editPage(id){
    const {data:p,error}=await fetchPageById(id);
    if(error) return toast(error.message); if(!p) return toast('Page introuvable.');
    const {data:roleRow}=await sb.from('page_members').select('role').eq('page_id',id).eq('user_id',state.user.id).maybeSingle();
    if(p.owner_id!==state.user.id && roleRow?.role!=='admin') return toast('Seul le propriétaire ou un administrateur peut modifier la Page.');
    openModal(`<div class="modal-box page-edit-modal page-manage-screen"><div class="page-manage-topbar"><button class="entity-back-btn compact" data-action="page-manage-back" data-id="${esc(id)}" aria-label="Retour à la Page"><span>‹</span><small>Retour</small></button><span class="page-eyebrow">TAFAß · ADMINISTRATION</span></div><div class="page-manage-scroll"><div class="page-manage-heading"><h2>Gérer la Page</h2><p>Modifiez l’identité publique, les coordonnées et les visuels.</p></div><div class="page-rename-rule"><span>◷</span><div><b>Le nom peut être modifié une fois tous les 15 jours</b><small>Si vous changez le nom, l’ancien nom restera visible dans les détails de la Page.</small></div></div><div class="page-edit-grid"><label>Nom<input id="editPageName" maxlength="80" value="${esc(p.name)}"></label><label>Nom d’utilisateur<input id="editPageUsername" maxlength="50" value="${esc(p.username||'')}" placeholder="@ma-page"></label><label>Catégorie<select id="editPageCategory">${pageCategoryOptions(p.category||'Autre')}</select><small>Cette information apparaîtra uniquement dans « À propos ».</small></label><label>Site web<input id="editPageWebsite" type="url" value="${esc(p.website_url||'')}" placeholder="https://…"></label><label class="wide">Présentation<textarea id="editPageBio" maxlength="1000">${esc(p.bio||'')}</textarea></label><label>Adresse<input id="editPageAddress" maxlength="200" value="${esc(p.address||p.location||'')}" placeholder="Adresse / ville"></label><label>E-mail professionnel<input id="editPageEmail" type="email" value="${esc(p.contact_email||'')}" placeholder="contact@…"></label><label>Téléphone professionnel<input id="editPagePhone" type="tel" value="${esc(p.contact_phone||'')}" placeholder="+261…"></label><label>Logo<input id="editPageLogo" type="file" accept="image/jpeg,image/png,image/webp"></label><label>Couverture<input id="editPageCover" type="file" accept="image/jpeg,image/png,image/webp"></label></div></div><div class="page-manage-footer"><button class="ghost-action" data-action="page-manage-back" data-id="${esc(id)}">Annuler</button><button class="primary big" data-action="save-page-edit" data-id="${esc(id)}">Enregistrer les modifications</button></div></div>`);
  }

  async function savePageEdit(id){
    const btn=document.querySelector('[data-action="save-page-edit"]'); setLoading(btn,true,'Enregistrer');
    try{
      const current=(await fetchPageById(id)).data;
      if(!current){setLoading(btn,false,'Enregistrer');return toast('Page introuvable.');}
      const patch={name:$('editPageName')?.value.trim(),username:$('editPageUsername')?.value.trim().replace(/^@/,''),category:$('editPageCategory')?.value||'Autre',bio:$('editPageBio')?.value.trim()||'',address:$('editPageAddress')?.value.trim()||'',contact_email:$('editPageEmail')?.value.trim()||'',contact_phone:$('editPagePhone')?.value.trim()||'',website_url:$('editPageWebsite')?.value.trim()||''};
      if(!patch.name){setLoading(btn,false,'Enregistrer');return toast('Le nom est obligatoire.');}
      if(patch.name!==current.name){
        if(current.owner_id!==state.user.id){setLoading(btn,false,'Enregistrer');return toast('Seul le propriétaire de la Page peut modifier son nom.');}
        const h=await sb.from('activity_history').select('created_at').eq('user_id',current.owner_id).eq('entity_type','page').eq('entity_id',id).eq('action_type','page_name_changed').order('created_at',{ascending:false}).limit(1);
        if(h.error){setLoading(btn,false,'Enregistrer');return toast(h.error.message);}
        const last=h.data?.[0]?.created_at;
        if(last){
          const next=new Date(new Date(last).getTime()+15*24*60*60*1000);
          if(Date.now()<next.getTime()){setLoading(btn,false,'Enregistrer');return toast(`Le nom de la Page ne peut être modifié qu’une fois tous les 15 jours. Prochain changement : ${next.toLocaleDateString('fr-FR')}.`);}
        }
      }
      for(const [input,key] of [['editPageLogo','logo_url'],['editPageCover','cover_url']]){const file=$(input)?.files?.[0]; if(!file) continue; const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); const path=`${state.user.id}/page-${id}-${key}-${crypto.randomUUID()}.${ext}`; const up=await sb.storage.from('posts').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'}); if(up.error){setLoading(btn,false,'Enregistrer');return toast('Upload impossible : '+up.error.message);} patch[key]=sb.storage.from('posts').getPublicUrl(path).data.publicUrl;}
      const r=await sb.from('pages').update(patch).eq('id',id); if(r.error){setLoading(btn,false,'Enregistrer');return toast(r.error.message);}
      if(patch.name!==current.name){await logActivity('page_name_changed',`Ancien nom : ${current.name} → Nouveau nom : ${patch.name}`,'page',id);}
      setLoading(btn,false,'Enregistrer'); closeModal(); toast('Page mise à jour.');
      if(state.activePage?.id===id) state.activePage={...state.activePage,...patch};
      return openPageDetail(id);
    }catch(e){setLoading(btn,false,'Enregistrer');toast(e?.message||'Impossible d’enregistrer la Page.');}
  }

  async function pageMemberMenu(userId,pageId){
    const {data:m}=await sb.from('page_members').select('role,profiles(first_name,last_name,username,avatar_url)').eq('page_id',pageId).eq('user_id',userId).maybeSingle();
    if(!m) return toast('Gestionnaire introuvable.');
    openModal(`<div class="modal-box page-edit-modal"><button class="page-close" data-action="close-modal">×</button><span class="page-eyebrow">ÉQUIPE DE LA PAGE</span><h2>${esc(nameOf(m.profiles||{}))}</h2><p class="muted">Rôle actuel : ${esc(m.role)}</p><div class="page-role-actions"><button class="page-action secondary" data-action="set-page-role" data-id="${esc(userId)}" data-entity-id="${esc(pageId)}" data-role="admin">Administrateur</button><button class="page-action secondary" data-action="set-page-role" data-id="${esc(userId)}" data-entity-id="${esc(pageId)}" data-role="editor">Éditeur</button><button class="page-action secondary danger" data-action="remove-page-member" data-id="${esc(userId)}" data-entity-id="${esc(pageId)}">Retirer de l’équipe</button></div></div>`);
  }

  async function sendPageRoleRequest(userId,pageId){
    const role=document.querySelector('[data-role-choice]')?.value || 'editor';
    const r=await sb.from('page_role_requests').insert({page_id:pageId,target_user_id:userId,requested_by:state.user.id,role});
    if(r.error)return toast(r.error.message);
    await sb.from('notifications').insert({user_id:userId,actor_id:state.user.id,type:'page_role_request',title:'Demande de rôle Page',message:`Vous êtes invité à devenir ${role}.`,entity_type:'page_role_request',entity_id:r.data?.[0]?.id});
    closeModal(); toast('Demande envoyée.');
  }
  async function respondRoleRequest(requestId,accept){
    let req=(await sb.from('page_role_requests').select('*').eq('id',requestId).maybeSingle()).data; let kind='page';
    if(!req){ req=(await sb.from('group_role_requests').select('*').eq('id',requestId).maybeSingle()).data; kind='group'; }
    if(!req)return toast('Demande introuvable.'); if(req.target_user_id!==state.user.id)return toast('Accès refusé.'); if(req.status!=='pending')return toast('Cette demande a déjà été traitée.');
    const table=kind==='page'?'page_role_requests':'group_role_requests'; const upd=await sb.from(table).update({status:accept?'accepted':'rejected',responded_at:new Date().toISOString()}).eq('id',requestId); if(upd.error)return toast(upd.error.message);
    if(accept){ const r=kind==='page'?await sb.from('page_members').upsert({page_id:req.page_id,user_id:state.user.id,role:req.role},{onConflict:'page_id,user_id'}):await sb.from('group_members').upsert({group_id:req.group_id,user_id:state.user.id,role:req.role},{onConflict:'group_id,user_id'}); if(r.error)return toast(r.error.message); }
    const entityId=kind==='page'?req.page_id:req.group_id; await sb.from('notifications').insert({user_id:req.requested_by,actor_id:state.user.id,type:'role_request_response',title:accept?'Demande acceptée':'Demande refusée',message:accept?'Le rôle a été accepté.':'La demande de rôle a été refusée.',entity_type:kind,entity_id:entityId});
    toast(accept?'Demande acceptée.':'Demande refusée.'); return notificationsPage();
  }

  async function pageInbox(pageId){
    const {data:p}=await sb.from('pages').select('name,owner_id').eq('id',pageId).maybeSingle(); if(!p||p.owner_id!==state.user.id)return toast('Accès refusé.');
    const {data:msgs,error}=await sb.from('page_messages').select('id,sender_id,message,is_read,created_at,profiles(first_name,last_name,username,avatar_url)').eq('page_id',pageId).order('created_at',{ascending:true}).limit(100); if(error)return toast(error.message);
    const rows=(msgs||[]).map(m=>`<div class="page-message-row ${m.sender_id===state.user.id?'mine':''}">${avatarHTML(m.profiles||{},'avatar page-msg-avatar')}<div><b>${esc(m.sender_id===state.user.id?'Vous':nameOf(m.profiles||{}))}</b><p>${esc(m.message)}</p><small>${timeAgo(m.created_at)}</small></div></div>`).join('')||'<div class="muted">Aucun message.</div>';
    openModal(`<div class="modal-box page-inbox-modal"><button class="page-close" data-action="close-modal">×</button><span class="page-eyebrow">TAFAß · MESSAGERIE PAGE</span><h2>${esc(p.name)}</h2><div id="pageInboxList" class="page-inbox-list">${rows}</div><div class="page-inbox-compose"><textarea id="pageReplyText" maxlength="2000" placeholder="Répondre à un visiteur…"></textarea><button class="primary big" data-action="page-inbox-reply" data-id="${esc(pageId)}">Envoyer</button></div></div>`);
  }


  async function toggleGroupMember(id){
    const {data:me}=await sb.from('group_members').select('id,role').eq('group_id',id).eq('user_id',state.user.id).maybeSingle();
    if(me){
      if(me.role==='admin') return toast('Le propriétaire ne peut pas quitter avec ce rôle.');
      const r=await sb.from('group_members').delete().eq('id',me.id);
      if(r.error)return toast(r.error.message);
      toast('Vous avez quitté le groupe.');
    }else{
      const r=await sb.from('group_members').insert({group_id:id,user_id:state.user.id,role:'member'});
      if(r.error)return toast(r.error.message);
      toast('Vous avez rejoint le groupe.');
    }
    return openGroupDetail(id);
  }

  async function openGroupDetail(id){
    const el=document.querySelector(`[data-action="group-open"][data-id="${CSS.escape(id)}"]`);
    if(el) return el.click();
    // Fallback: invoke the same route through the delegated handler.
    const x=(await fetchGroupById(id)).data;
    if(x) toast('Actualisez la liste des groupes pour rouvrir cette communauté.');
  }

  async function editGroup(id){
    const {data:g,error}=await fetchGroupById(id);
    if(error)return toast(error.message); if(!g)return toast('Groupe introuvable.');
    const {data:gm}=await sb.from('group_members').select('role').eq('group_id',id).eq('user_id',state.user.id).maybeSingle();
    if(g.owner_id!==state.user.id && gm?.role!=='admin')return toast('Seul un administrateur peut modifier le groupe.');
    openModal(`<div class="modal-box entity-create-modal-v2 premium-management-modal"><div class="modal-topbar"><button class="entity-back-btn compact" data-action="close-modal" aria-label="Retour"><span>‹</span><small>Retour</small></button></div><div class="create-hero-v2 group"><div class="create-icon-v2 group-mark">◎</div><div><span class="eyebrow">TAFAß • ADMINISTRATION</span><h3>Gérer le groupe</h3><p>Modifiez l’identité, la confidentialité et les visuels.</p></div></div><div class="create-grid-v2"><label class="create-field-v2 wide"><span>Nom</span><input id="editGroupName" maxlength="80" value="${esc(g.name||'')}"></label><label class="create-field-v2 wide"><span>Description</span><textarea id="editGroupDesc" maxlength="1000">${esc(g.description||'')}</textarea></label><label class="create-field-v2"><span>Confidentialité</span><select id="editGroupPrivacy"><option value="public" ${g.privacy==='public'?'selected':''}>🌐 Public</option><option value="private" ${g.privacy==='private'?'selected':''}>🔒 Privé</option></select></label><label class="create-upload-v2"><span>Avatar</span><input id="editGroupAvatar" type="file" accept="image/jpeg,image/png,image/webp"></label><label class="create-upload-v2 wide"><span>Couverture</span><input id="editGroupCover" type="file" accept="image/jpeg,image/png,image/webp"></label></div><button class="primary big create-submit-v2" data-action="save-group-edit" data-id="${esc(id)}">Enregistrer</button></div>`);
  }

  async function saveGroupEdit(id){
    const btn=document.querySelector('[data-action="save-group-edit"]'); setLoading(btn,true,'Enregistrer');
    const patch={name:$('editGroupName')?.value.trim(),description:$('editGroupDesc')?.value.trim()||'',privacy:$('editGroupPrivacy')?.value||'public'};
    if(!patch.name){setLoading(btn,false,'Enregistrer');return toast('Le nom est obligatoire.');}
    const file=$("editGroupCover")?.files?.[0] || $("editGroupAvatar")?.files?.[0];
    if(file){
      const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); const path=`${state.user.id}/group-${id}-cover-${crypto.randomUUID()}.${ext}`;
      const up=await sb.storage.from('posts').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'});
      if(up.error){setLoading(btn,false,'Enregistrer');return toast('Upload impossible : '+up.error.message);}
      patch.cover_url=sb.storage.from('posts').getPublicUrl(path).data.publicUrl;
    }
    const r=await sb.from('groups').update(patch).eq('id',id); setLoading(btn,false,'Enregistrer');
    if(r.error)return toast(r.error.message); closeModal(); toast('Groupe mis à jour.'); return openGroupDetail(id);
  }

  async function groupMore(id) {
    const {data:g,error}=await sb.from("groups").select("id,name,owner_id,privacy").eq("id",id).maybeSingle();
    if(error||!g)return toast(error?.message||"Groupe introuvable.");
    const me=(await sb.from("group_members").select("role").eq("group_id",id).eq("user_id",state.user.id).maybeSingle()).data;
    const admin=g.owner_id===state.user.id||me?.role==="admin";
    openModal(`<div class="modal-box fb-more-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • GROUPE</span><h3>${esc(g.name)}</h3><div class="fb-more-list"><button data-action="group-share" data-id="${esc(id)}">↗ <span>Partager le groupe</span></button><button data-action="group-copy-link" data-id="${esc(id)}">🔗 <span>Copier le lien</span></button>${admin?`<button data-action="edit-group" data-id="${esc(id)}">⚙ <span>Gérer le groupe</span></button>`:""}${me?`<button data-action="toggle-group-member" data-id="${esc(id)}">↪ <span>Quitter le groupe</span></button>`:""}</div></div>`);
  }
  async function groupShare(id) {
    const url=`${location.origin}${location.pathname}#/groups/${id}`;
    if(navigator.share){try{await navigator.share({title:"Groupe Tafaß",url});}catch{}}
    else {try{await navigator.clipboard.writeText(url);toast("Lien du groupe copié.");}catch{toast(url);}}
  }
  async function groupCopyLink(id) {
    const url=`${location.origin}${location.pathname}#/groups/${id}`;
    try{await navigator.clipboard.writeText(url);toast("Lien du groupe copié.");}catch{toast(url);}
  }

  async function groupMemberRole(userId,groupId){
    const {data:m}=await sb.from('group_members').select('role,profiles(first_name,last_name,username,avatar_url)').eq('group_id',groupId).eq('user_id',userId).maybeSingle();
    if(!m)return toast('Membre introuvable.');
    openModal(`<div class="modal-box page-edit-modal"><button class="page-close" data-action="close-modal">×</button><span class="page-eyebrow">TAFAß · ÉQUIPE</span><h2>${esc(nameOf(m.profiles||{}))}</h2><p class="muted">Rôle actuel : ${esc(m.role||'member')}</p><div class="page-role-actions"><button class="page-action secondary" data-action="set-group-role" data-id="${esc(userId)}" data-entity-id="${esc(groupId)}" data-role="admin">Administrateur</button><button class="page-action secondary" data-action="set-group-role" data-id="${esc(userId)}" data-entity-id="${esc(groupId)}" data-role="moderator">Modérateur</button><button class="page-action secondary" data-action="set-group-role" data-id="${esc(userId)}" data-entity-id="${esc(groupId)}" data-role="member">Membre</button><button class="page-action secondary danger" data-action="remove-group-member" data-id="${esc(userId)}" data-entity-id="${esc(groupId)}">Retirer</button></div></div>`);
  }

  async function groupChat(id){
    const g=(await sb.from('groups').select('name').eq('id',id).maybeSingle()).data; if(!g)return toast('Groupe introuvable.');
    const {data:msgs,error}=await sb.from('group_messages').select('id,sender_id,message,created_at,profiles(first_name,last_name,username,avatar_url)').eq('group_id',id).order('created_at',{ascending:true}).limit(100);
    if(error)return toast(error.message);
    const rows=(msgs||[]).map(m=>`<div class="page-message-row ${m.sender_id===state.user.id?'mine':''}">${avatarHTML(m.profiles||{},'avatar page-msg-avatar')}<div><b>${esc(m.sender_id===state.user.id?'Vous':nameOf(m.profiles||{}))}</b><p>${esc(m.message||'')}</p><small>${timeAgo(m.created_at)}</small></div></div>`).join('')||'<div class="muted">Aucun message. Commencez la discussion.</div>';
    openModal(`<div class="modal-box page-inbox-modal group-chat-modal"><button class="page-close" data-action="close-modal">×</button><span class="page-eyebrow">TAFAß · DISCUSSION DU GROUPE</span><h2>${esc(g.name)}</h2><div class="page-inbox-list" id="groupChatList">${rows}</div><div class="page-inbox-compose"><textarea id="groupChatText" maxlength="2000" placeholder="Écrire au groupe…"></textarea><button class="primary big" data-action="send-group-chat" data-id="${esc(id)}">Envoyer</button></div></div>`);
  }

  async function pageTab(id,tab){
    const root=document.querySelector('.page-detail'); if(!root)return openPageDetail(id);
    const sections=root.querySelectorAll('.page-tab-panel'); sections.forEach(s=>s.classList.add('hidden'));
    const target=root.querySelector(`.page-tab-panel[data-tab="${tab}"]`); if(target)target.classList.remove('hidden');
    root.querySelectorAll('.page-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  }

  async function groupTab(id,tab){
    const root=document.querySelector('.group-detail'); if(!root)return openGroupDetail(id);
    root.querySelectorAll('.group-tab-panel').forEach(s=>s.classList.add('hidden'));
    const target=root.querySelector(`.group-tab-panel[data-tab="${tab}"]`); if(target)target.classList.remove('hidden');
    root.querySelectorAll('.group-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  }

  /* ============================================================
     TAFAß GAMES — 12 jeux intégrés, jouables localement
     ============================================================ */
  let activeGameCleanup = null;
  const TAFA_GAMES = [
    {id:'ludo',icon:'🎲',name:'Tafaß Ludo Royale',desc:'Ludo 4 joueurs avec dés, captures, sorties et IA.',tag:'Plateau'},
    {id:'piano',icon:'🎹',name:'Tafaß Piano Studio',desc:'Piano tactile 2 octaves, sons WebAudio et défis de mélodie.',tag:'Musique'},
    {id:'tetris',icon:'🧱',name:'Tafaß Tetris Ultra',desc:'Tetris complet : rotation, lignes, vitesse progressive et combos.',tag:'Arcade'},
    {id:'mahjong',icon:'🀄',name:'Tafaß Mahjong Elite',desc:'Mahjong solitaire avec tuiles libres, couches et aide.',tag:'Stratégie'},
    {id:'checkers',icon:'⚫',name:'Tafaß Checkers Pro',desc:'Dames avec prises obligatoires et adversaire IA.',tag:'Stratégie'},
    {id:'memory',icon:'🧠',name:'Tafaß Memory Pro',desc:'Jeu de mémoire avancé avec niveaux et chrono.',tag:'Réflexion'},
    {id:'battle',icon:'🎯',name:'Tafaß Battle Arena',desc:'Défiez une IA tactique sur une arène de stratégie.',tag:'Stratégie'},
    {id:'racing',icon:'🏎️',name:'Tafaß Racing Turbo',desc:'Course arcade contre des rivaux IA, vitesse et trajectoires.',tag:'Course'},
    {id:'football',icon:'⚽',name:'Tafaß Football Arena',desc:'Penalty + gardien IA avec séries et tirs précis.',tag:'Sport'},
    {id:'chess',icon:'♟️',name:'Tafaß Chess Master',desc:'Échecs contre une IA avec mouvements et prises.',tag:'Réflexion'},
    {id:'pool',icon:'🎱',name:'Tafaß 8 Ball Pool',desc:'Billard arcade : angle, puissance, poches et score.',tag:'Sport'},
    {id:'cyber',icon:'🤖',name:'Tafaß Cyber Strike',desc:'Shooter tactique : esquivez, visez et survivez.',tag:'Action'},
    {id:'puzzle',icon:'💎',name:'Tafaß Puzzle Legend',desc:'Match-3 dynamique avec combos et objectifs.',tag:'Puzzle'},
    {id:'air',icon:'✈️',name:'Tafaß Air Combat',desc:'Combat aérien avec ennemis, tirs et vagues.',tag:'Action'},
    {id:'ninja',icon:'🥷',name:'Tafaß Ninja Shadow',desc:'Action réflexe : obstacles et score de survie.',tag:'Action'},
    {id:'reversi',icon:'⚫',name:'Tafaß Reversi Pro',desc:'Othello stratégique contre une IA.',tag:'Stratégie'},
    {id:'mines',icon:'💣',name:'Tafaß Mines Pro',desc:'Déminez une grille générée à chaque partie.',tag:'Réflexion'},
    {id:'sudoku',icon:'🔢',name:'Tafaß Sudoku Master',desc:'Sudoku avec validation et chronomètre.',tag:'Puzzle'}
  ];
  function gameScores(key){try{return Number(localStorage.getItem('tafass_game_score_'+key)||0)}catch{return 0}}
  function setGameScore(key,score){try{if(Number(score)>gameScores(key)){localStorage.setItem('tafass_game_score_'+key,String(score));if(state.user) sb.from('game_scores').upsert({user_id:state.user.id,game_id:key,score:Number(score),updated_at:new Date().toISOString()},{onConflict:'user_id,game_id'}).catch(()=>{});}}catch{}}
  function gameIcon(g){return `<div class="tafa-game-icon game-logo-${esc(g.id)}"><span class="game-logo-mark">${g.icon}</span><i>ß</i></div>`}
  function gamesModal(){
    if(activeGameCleanup){activeGameCleanup();activeGameCleanup=null}
    openModal(`<div class="modal-box tafass-games-modal"><button class="modal-close" data-action="close-games">×</button>
      <div class="games-head"><span class="eyebrow">TAFAß • JEUX OFFICIELS</span><h2>Jeux Tafaß</h2><p class="muted">18 expériences intégrées. Jouez directement dans Tafaß, sans quitter votre compte.</p></div>
      <div class="games-feature"><div class="games-feature-mark">ß</div><div><b>TAFAß PLAY</b><small>Jeux officiels Tafaß · scores synchronisés · commandes tactiles · IA</small></div><div class="games-feature-stats"><span><b>18+</b><small>Jeux</small></span><span><b>6</b><small>Nouveaux</small></span><span><b>∞</b><small>Parties</small></span></div></div>
      <div class="games-catalog">${TAFA_GAMES.map(g=>`<button class="game-card-premium" data-game="${g.id}">${gameIcon(g)}<span class="game-card-copy"><strong>${g.name}</strong><small>${g.desc}</small><em>✓ Jeu officiel Tafaß · ${g.tag}</em></span><span class="game-play">Jouer <b>›</b></span></button>`).join('')}</div>
      <div id="gameStage"></div></div>`);
  }
  function startGame(key){
    if(activeGameCleanup){activeGameCleanup();activeGameCleanup=null}
    const stage=$('gameStage');if(!stage)return;
    const fn={ludo:renderLudo,piano:renderPiano,tetris:renderTetris,mahjong:renderMahjong,checkers:renderCheckers,memory:renderMemory,battle:renderBattle,racing:renderRacing,football:renderFootball,chess:renderChess,pool:renderPool,cyber:renderCyber,puzzle:renderPuzzle,air:renderAir,ninja:renderNinja,reversi:renderReversi,mines:renderMines,sudoku:renderSudoku}[key];
    if(fn){fn(stage);setTimeout(()=>stage.scrollIntoView({behavior:'smooth',block:'start'}),30)}
  }
  function gameToolbar(name,key,scoreLabel='Record'){return `<div class="game-toolbar"><span><b>${name}</b><small class="game-official">✓ OFFICIEL TAFAß</small></span><span>${scoreLabel} : <strong id="liveScore">${gameScores(key)}</strong></span><div class="game-toolbar-actions"><button class="ghost-action" data-games-back>← Jeux</button><button class="ghost-action" id="gameReset">Nouvelle partie</button></div></div>`}
  function bindGameReset(fn){$('gameReset')?.addEventListener('click',fn);document.querySelector('[data-games-back]')?.addEventListener('click',()=>gamesModal())}

  function renderLudo(stage){
    const path=[[6,0],[7,0],[8,0],[9,0],[10,0],[10,1],[10,2],[10,3],[10,4],[10,5],[11,6],[11,7],[11,8],[11,9],[11,10],[10,10],[9,10],[8,10],[7,10],[6,10],[5,11],[4,11],[3,11],[2,11],[1,11],[0,11],[0,10],[0,9],[0,8],[0,7],[0,6],[0,5],[0,4],[0,3],[0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[5,1],[5,0],[6,0],[7,1],[8,2],[9,3],[10,4],[9,5],[8,6],[7,7],[6,8],[5,9]];
    const colors=[{n:'Vous',c:'red',start:0},{n:'IA Bleu',c:'blue',start:13},{n:'IA Vert',c:'green',start:26},{n:'IA Jaune',c:'yellow',start:39}];
    let pieces=colors.map(()=>[0,0,0,0]),turn=0,dice=0,rolled=false,over=false,score=0;
    const reset=()=>{pieces=colors.map(()=>[0,0,0,0]);turn=0;dice=0;rolled=false;over=false;score=0;draw()};
    const abs=(pl,step)=>step<1?null:(colors[pl].start+step-1)%52;
    const canMove=(pl,k)=>dice>0 && (pieces[pl][k]===0?dice===6:pieces[pl][k]+dice<=57);
    const move=(pl,k)=>{if(!canMove(pl,k))return false; if(pieces[pl][k]===0)pieces[pl][k]=1; else pieces[pl][k]+=dice; const at=abs(pl,pieces[pl][k]); if(at!==null){for(let op=0;op<4;op++)if(op!==pl)for(let q=0;q<4;q++){if(abs(op,pieces[op][q])===at&&pieces[op][q]>0){pieces[op][q]=0}}} if(pieces[pl].every(v=>v>=57)){over=true;score+=1000;setGameScore('ludo',score)} return true};
    const ai=()=>{if(over)return; const pl=turn; dice=1+Math.floor(Math.random()*6); const ks=[0,1,2,3].filter(k=>canMove(pl,k)); if(ks.length){move(pl,ks.sort((a,b)=>pieces[pl][b]-pieces[pl][a])[0]);} turn=(turn+1)%4; rolled=false; draw(); if(turn>0&&!over)setTimeout(ai,450)};
    const draw=()=>{stage.innerHTML=gameToolbar('Ludo Royale','ludo','Record')+`<div class="ludo-hud"><span>Tour : <b>${colors[turn].n}</b></span><b class="ludo-dice">${dice||'🎲'}</b><button class="primary" id="ludoRoll" ${turn!==0||rolled||over?'disabled':''}>Lancer le dé</button></div><div class="ludo-board">${path.map((p,i)=>`<div class="ludo-cell" style="grid-column:${p[1]+1};grid-row:${p[0]+1}">${i<52?'<span class="ludo-track">'+(i+1)+'</span>':''}</div>`).join('')}<div class="ludo-home red-home">${pieces[0].map((v,k)=>`<button class="ludo-piece red" data-piece="${k}" ${!canMove(0,k)?'disabled':''}>${v?(''+v):'●'}</button>`).join('')}</div><div class="ludo-home blue-home">🔵 🔵 🔵 🔵</div><div class="ludo-home green-home">🟢 🟢 🟢 🟢</div><div class="ludo-home yellow-home">🟡 🟡 🟡 🟡</div></div><div class="game-status" id="ludoStatus">${over?'Victoire ! 🏆':turn===0?(rolled?'Choisissez un pion à déplacer.':'Lancez le dé pour commencer.'):'L’IA joue…'}</div>`;
      stage.querySelector('#ludoRoll')?.addEventListener('click',()=>{dice=1+Math.floor(Math.random()*6);rolled=true;const ks=[0,1,2,3].filter(k=>canMove(0,k));if(!ks.length){rolled=false;turn=1;draw();setTimeout(ai,300);return}draw()});
      stage.querySelectorAll('[data-piece]').forEach(b=>b.addEventListener('click',()=>{if(!rolled)return;const k=+b.dataset.piece;if(move(0,k)){score+=dice*10;$('liveScore').textContent=score;rolled=false;turn=(dice===6?0:1);draw();if(turn!==0&&!over)setTimeout(ai,400)}}));bindGameReset(reset)};draw();activeGameCleanup=()=>{};
  }

  function renderPiano(stage){
    const notes=['C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4','C5','C#5','D5','D#5','E5','F5','F#5','G5','G#5','A5','A#5','B5','C6'];
    const freqs=[261.63,277.18,293.66,311.13,329.63,349.23,369.99,392,415.3,440,466.16,493.88,523.25,554.37,587.33,622.25,659.25,698.46,739.99,783.99,830.61,880,932.33,987.77,1046.5];
    let audio=null,score=0,seq=[];
    const play=(i)=>{try{audio ||= new (window.AudioContext||window.webkitAudioContext)();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=freqs[i];g.gain.setValueAtTime(.0001,audio.currentTime);g.gain.exponentialRampToValueAtTime(.18,audio.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.65);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.7);}catch{} score+=5;seq.push(notes[i]);seq=seq.slice(-12);$('liveScore').textContent=score;};
    const reset=()=>{score=0;seq=[];draw()};
    const draw=()=>{stage.innerHTML=gameToolbar('Piano Studio','piano','Score')+`<div class="piano-panel"><div class="piano-display">${seq.length?seq.join(' · '):'Touchez les touches pour jouer'}<small>Son généré en temps réel · 2 octaves</small></div><div class="piano-keys">${notes.map((n,i)=>`<button class="piano-key ${n.includes('#')?'black':''}" data-note="${i}"><span>${n}</span></button>`).join('')}</div><div class="game-status">Clavier : A–W–S–E–D… ou touchez les touches.</div></div>`;stage.querySelectorAll('[data-note]').forEach(b=>{const f=()=>{const i=+b.dataset.note;b.classList.add('pressed');play(i);setTimeout(()=>b.classList.remove('pressed'),100)};b.addEventListener('pointerdown',f)});bindGameReset(reset)};draw();activeGameCleanup=()=>{};
  }

  function renderTetris(stage){
    const W=10,H=20,shapes=[[[1,1,1,1]],[[1,1],[1,1]],[[0,1,0],[1,1,1]],[[1,0,0],[1,1,1]],[[0,0,1],[1,1,1]],[[1,1,0],[0,1,1]],[[0,1,1],[1,1,0]]];
    let board,piece,x,y,score=0,lines=0,over=false,timer,dropMs=650;
    const spawn=()=>{const si=Math.floor(Math.random()*shapes.length);piece=shapes[si].map(r=>r.slice());x=3;y=0;if(collide(x,y,piece))over=true};
    const collide=(px,py,sh)=>sh.some((r,dy)=>r.some((v,dx)=>v&&(px+dx<0||px+dx>=W||py+dy>=H||(py+dy>=0&&board[py+dy][px+dx]))));
    const merge=()=>piece.forEach((r,dy)=>r.forEach((v,dx)=>{if(v&&y+dy>=0)board[y+dy][x+dx]=1}));
    const clear=()=>{let n=0;board=board.filter(r=>{if(r.every(Boolean)){n++;return false}return true});while(board.length<H)board.unshift(Array(W).fill(0));if(n){lines+=n;score+=([0,100,300,500,800][n]||1000);dropMs=Math.max(100,650-Math.floor(lines/3)*60);setGameScore('tetris',score)}};
    const down=()=>{if(over)return;if(!collide(x,y+1,piece))y++;else{merge();clear();spawn()}draw()};
    const rotate=()=>{const r=piece[0].map((_,i)=>piece.map(row=>row[i]).reverse());if(!collide(x,y,r))piece=r;draw()};
    const reset=()=>{clearInterval(timer);board=Array.from({length:H},()=>Array(W).fill(0));score=0;lines=0;over=false;dropMs=650;spawn();timer=setInterval(down,dropMs);draw()};
    const draw=()=>{let cells=board.map(r=>r.slice());piece?.forEach((r,dy)=>r.forEach((v,dx)=>{if(v&&y+dy>=0&&y+dy<H&&x+dx>=0&&x+dx<W)cells[y+dy][x+dx]=2}));stage.innerHTML=gameToolbar('Tetris Ultra','tetris','Score')+`<div class="tetris-board">${cells.flat().map(v=>`<i class="tetris-cell v${v||0}"></i>`).join('')}</div><div class="tetris-controls"><button id="tLeft">←</button><button id="tRotate">↻</button><button id="tDown">↓</button><button id="tRight">→</button></div><div class="game-status">${over?'Game over — Nouvelle partie pour rejouer.':`Lignes ${lines} · Niveau ${Math.floor(lines/3)+1}`}</div>`;if(over)clearInterval(timer);stage.querySelector('#tLeft').onclick=()=>{if(!collide(x-1,y,piece))x--;draw()};stage.querySelector('#tRight').onclick=()=>{if(!collide(x+1,y,piece))x++;draw()};stage.querySelector('#tDown').onclick=down;stage.querySelector('#tRotate').onclick=rotate;bindGameReset(reset)};reset();activeGameCleanup=()=>clearInterval(timer);
  }

  function renderMahjong(stage){
    const tiles=['🀀','🀁','🀂','🀃','🀄','🀅','🀆','🀇','🀈','🀉','🀊','🀋','🀌','🀍','🀎','🀏','🀐','🀑'];let deck=[];let selected=null,removed=new Set(),moves=0;
    const reset=()=>{deck=[...tiles,...tiles].sort(()=>Math.random()-.5).map((v,i)=>({v,i,layer:i<12?0:1}));selected=null;removed=new Set();moves=0;draw()};
    const free=(i)=>{if(removed.has(i))return false;const t=deck[i];if(t.layer===1 && !removed.has(i-12))return false;const left=i-1,right=i+1;return (i%6===0||removed.has(left)) || (i%6===5||removed.has(right));};
    const draw=()=>{stage.innerHTML=gameToolbar('Mahjong Elite','mahjong','Paires')+`<div class="mahjong-board">${deck.map((t,i)=>removed.has(i)?'':`<button class="mahjong-tile layer${t.layer} ${free(i)?'free':''} ${selected===i?'selected':''}" data-i="${i}" style="--x:${i%6};--y:${Math.floor(i/6)}">${t.v}</button>`).join('')}</div><div class="game-status">${removed.size===deck.length?'Mahjong terminé ! 🏆':`Tuiles restantes : ${deck.length-removed.size} · Coups : ${moves}`}</div>`;stage.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;if(!free(i))return toast('Cette tuile est bloquée.');if(selected===null){selected=i;draw();return}if(selected!==i&&deck[selected].v===deck[i].v&&free(selected)){removed.add(selected);removed.add(i);moves++;selected=null;setGameScore('mahjong',moves);draw()}else{selected=i;draw()}});bindGameReset(reset)};reset();activeGameCleanup=()=>{};
  }

  function renderCheckers(stage){
    let b=Array(32).fill(0);for(let i=0;i<12;i++)b[i]=2;for(let i=20;i<32;i++)b[i]=1;let turn=1,sel=null,score=0,over=false;
    const rc=i=>[Math.floor(i/4),i%4*2+((Math.floor(i/4)+1)%2)];const idx=(r,c)=>r<0||r>7||c<0||c>7||((r+c)%2===0)?-1:Math.floor(r*4+c/2);
    const moves=(i,pl)=>{const [r,c]=rc(i),out=[];for(const dr of (pl===1?[-1]:[1]))for(const dc of [-1,1]){const j=idx(r+dr,c+dc),k=idx(r+2*dr,c+2*dc);if(j>=0&&!b[j])out.push(j);else if(j>=0&&b[j]===3-pl&&k>=0&&!b[k])out.push(k)}return out};
    const reset=()=>{b=Array(32).fill(0);for(let i=0;i<12;i++)b[i]=2;for(let i=20;i<32;i++)b[i]=1;turn=1;sel=null;score=0;over=false;draw()};
    const ai=()=>{const choices=[];b.forEach((v,i)=>{if(v===2)moves(i,2).forEach(j=>choices.push([i,j]))});if(!choices.length){over=true;draw();return}const [i,j]=choices[Math.floor(Math.random()*choices.length)];const [r,c]=rc(i),[rr,cc]=rc(j);if(Math.abs(rr-r)===2){const mid=idx((r+rr)/2,(c+cc)/2);if(mid>=0)b[mid]=0}b[j]=2;b[i]=0;turn=1;draw()};
    const draw=()=>{stage.innerHTML=gameToolbar('Checkers Pro','checkers','Score')+`<div class="checkers-board">${b.map((v,i)=>`<button class="checker-cell ${(i+Math.floor(i/4))%2?'dark':'light'} ${sel===i?'selected':''}" data-i="${i}">${v===1?'⚪':v===2?'⚫':''}</button>`).join('')}</div><div class="game-status">${over?'Partie terminée.':turn===1?'À vous — sélectionnez un pion puis une case.':'IA joue…'}</div>`;stage.querySelectorAll('[data-i]').forEach(el=>el.onclick=()=>{const i=+el.dataset.i;if(turn!==1||over)return;if(sel===null){if(b[i]===1)sel=i;draw();return}const ms=moves(sel,1);if(ms.includes(i)){const [r,c]=rc(sel),[rr,cc]=rc(i);if(Math.abs(rr-r)===2){const mid=idx((r+rr)/2,(c+cc)/2);if(mid>=0)b[mid]=0;score+=100}b[i]=1;b[sel]=0;sel=null;turn=2;setGameScore('checkers',score);draw();setTimeout(ai,350)}else{sel=b[i]===1?i:null;draw()}});bindGameReset(reset)};draw();activeGameCleanup=()=>{};
  }

  function renderMemory(stage){
    const vals=['🚀','🎧','⚽','🎹','🏎️','♟️','🎲','🪐','🚀','🎧','⚽','🎹','🏎️','♟️','🎲','🪐'];let cards=[],open=[],matched=new Set(),moves=0,lock=false;
    const reset=()=>{cards=vals.slice().sort(()=>Math.random()-.5);open=[];matched=new Set();moves=0;lock=false;draw()};
    const click=i=>{if(lock||matched.has(i)||open.includes(i))return;open.push(i);draw();if(open.length===2){moves++;lock=true;const [a,b]=open;if(cards[a]===cards[b]){matched.add(a);matched.add(b);open=[];lock=false;setGameScore('memory',Math.max(0,1000-moves*10));draw()}else setTimeout(()=>{open=[];lock=false;draw()},650)}};
    const draw=()=>{stage.innerHTML=gameToolbar('Memory Pro','memory','Record')+`<div class="memory-board">${cards.map((v,i)=>`<button class="memory-card ${open.includes(i)||matched.has(i)?'revealed':''}" data-i="${i}">${open.includes(i)||matched.has(i)?v:'?'}</button>`).join('')}</div><div class="game-status">${matched.size===cards.length?'Bravo ! Toutes les paires sont trouvées 🏆':`Paires ${matched.size/2}/8 · Coups ${moves}`}</div>`;stage.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>click(+b.dataset.i));bindGameReset(reset)};reset();activeGameCleanup=()=>{};
  }

  function renderBattle(stage){
    let a=3,b=3,turn='player',over=false,round=1,score=0;
    const reset=()=>{a=3;b=3;turn='player';over=false;round=1;score=0;draw()};
    const draw=()=>{stage.innerHTML=gameToolbar('Battle Arena','battle','Victoire')+`<div class="arena-card"><div class="arena-hud"><b>Vous ${a} ❤️</b><span>Manche ${round}</span><b>IA ${b} ❤️</b></div><div class="arena-board"><div class="arena-core">⚡</div><button class="arena-action" data-hit="1">ATTAQUER</button><button class="arena-action" data-hit="2">CHARGE + DÉFENSE</button><div class="game-status" id="battleStatus">Votre tour — choisissez une action.</div></div></div>`;stage.querySelectorAll('[data-hit]').forEach(x=>x.onclick=()=>{if(over)return;const hit=Number(x.dataset.hit);if(hit===1){b--;score+=100}else{score+=35}if(b<=0){over=true;setGameScore('battle',score);$('battleStatus').textContent='Victoire tactique ! 🏆';return}turn='ai';$('battleStatus').textContent='L’IA prépare sa réponse…';setTimeout(()=>{if(hit===2&&Math.random()<.55){$('battleStatus').textContent='Votre défense bloque l’attaque.'}else{a--;}$('liveScore').textContent=score;if(a<=0){over=true;$('battleStatus').textContent='Défaite — analysez la stratégie et rejouez.'}else{$('battleStatus').textContent='Votre tour.'}turn='player'},420)}) ;bindGameReset(reset)};
    draw();activeGameCleanup=()=>{}
  }
  function renderRacing(stage){
    const c=document.createElement('canvas');c.width=360;c.height=520;c.className='premium-game-canvas';let ctx=c.getContext('2d'),x=180,enemy=180,score=0,speed=5,running=true,raf,keys={};
    const reset=()=>{cancelAnimationFrame(raf);x=180;enemy=80+Math.random()*200;score=0;speed=5;running=true;loop()};
    stage.innerHTML=gameToolbar('Racing Turbo','racing','Record')+'<div class="canvas-wrap"></div><div class="game-status" id="raceStatus">← → ou touchez les zones gauche/droite.</div>';stage.querySelector('.canvas-wrap').appendChild(c);
    const draw=()=>{ctx.clearRect(0,0,360,520);ctx.fillStyle='#080d17';ctx.fillRect(0,0,360,520);ctx.fillStyle='#182133';ctx.fillRect(55,0,250,520);for(let y=-20;y<520;y+=70){ctx.fillStyle='#cbd5e1';ctx.fillRect(174,y+(score%70),8,34)}ctx.fillStyle='#e84d68';ctx.fillRect(x-18,420,36,62);ctx.fillStyle='#6d7cff';ctx.fillRect(enemy-18,90,36,62)};
    const loop=()=>{if(!running)return;score++;speed=Math.min(10,5+score/700);enemy+=((Math.random()-.5)*7);enemy=Math.max(75,Math.min(285,enemy));if(keys.left)x-=speed;if(keys.right)x+=speed;x=Math.max(78,Math.min(282,x));if(420<152+62&&Math.abs(x-enemy)<35){running=false;setGameScore('racing',score);$('raceStatus').textContent='Collision ! Record sauvegardé.'}draw();$('liveScore').textContent=score;raf=requestAnimationFrame(loop)};
    const key=e=>{if(e.key==='ArrowLeft')keys.left=true;if(e.key==='ArrowRight')keys.right=true};const up=e=>{if(e.key==='ArrowLeft')keys.left=false;if(e.key==='ArrowRight')keys.right=false};document.addEventListener('keydown',key);document.addEventListener('keyup',up);stage.addEventListener('pointerdown',e=>{keys.left=e.clientX<innerWidth/2;keys.right=!keys.left});stage.addEventListener('pointerup',()=>{keys.left=keys.right=false});bindGameReset(reset);loop();activeGameCleanup=()=>{cancelAnimationFrame(raf);document.removeEventListener('keydown',key);document.removeEventListener('keyup',up)}
  }
  function renderFootball(stage){let score=0,kick=0;const reset=()=>{score=0;kick=0;draw()};const draw=()=>{stage.innerHTML=gameToolbar('Football Arena','football','Buts')+`<div class="football-field"><div class="goalkeeper" id="keeper">🧤</div><div class="football-ball" id="ball">⚽</div><div class="penalty-targets"><button data-shot="left">↖</button><button data-shot="center">↑</button><button data-shot="right">↗</button></div></div><div class="game-status" id="footStatus">Choisissez une zone de tir.</div>`;stage.querySelectorAll('[data-shot]').forEach(b=>b.onclick=()=>{kick++;const save=Math.random()>.28;if(save){score++;$('footStatus').textContent=`BUT ! ${score}/10 ⚽`}else $('footStatus').textContent='Arrêt du gardien !';$('liveScore').textContent=score;if(kick>=10){setGameScore('football',score);$('footStatus').textContent=`Série terminée : ${score}/10. ${score>=7?'Excellent !':'Rejouez pour progresser.'}`}});bindGameReset(reset)};draw();activeGameCleanup=()=>{}}
  function renderChess(stage){
    let board=['♜','♞','♝','♛','♚','♝','♞','♜',...Array(8).fill('♟'),...Array(32).fill(''),'♙','♙','♙','♙','♙','♙','♙','♙','♖','♘','♗','♕','♔','♗','♘','♖'];
    let selected=-1,score=0;
    const reset=()=>{selected=-1;score=0;board=['♜','♞','♝','♛','♚','♝','♞','♜',...Array(8).fill('♟'),...Array(32).fill(''),'♙','♙','♙','♙','♙','♙','♙','♙','♖','♘','♗','♕','♔','♗','♘','♖'];draw()};
    const draw=()=>{
      stage.innerHTML=gameToolbar('Chess Master','chess','Prises')+`<div class="chess-board">${board.map((pc,i)=>`<button class="chess-cell ${(Math.floor(i/8)+i)%2?'dark':'light'}" data-i="${i}">${pc}</button>`).join('')}</div><div class="game-status" id="chessStatus">Sélectionnez une pièce blanche puis sa destination.</div>`;
      stage.querySelectorAll('.chess-cell').forEach(c=>c.onclick=()=>{
        const i=Number(c.dataset.i);
        if(selected<0){
          if(board[i]&&'♙♖♘♗♕♔'.includes(board[i])){selected=i;$('chessStatus').textContent='Choisissez une case cible.';}
          return;
        }
        if(i!==selected && (!board[i] || '♟♜♞♝♛♚'.includes(board[i]))){
          if(board[i])score++;
          board[i]=board[selected];board[selected]='';$('liveScore').textContent=score;$('chessStatus').textContent='Coup joué.';
          setTimeout(()=>{
            const black=board.map((pc,j)=>'♟♜♞♝♛♚'.includes(pc)?j:-1).filter(j=>j>=0);
            if(black.length){
              const from=black[Math.floor(Math.random()*black.length)];
              const targets=board.map((pc,j)=>(!pc||'♙♖♘♗♕♔'.includes(pc))?j:-1).filter(j=>j>=0);
              if(targets.length){const to=targets[Math.floor(Math.random()*targets.length)];if(board[to])score++;board[to]=board[from];board[from]='';}
            }
            draw();
          },280);
        }
        selected=-1;draw();
      });
    };
    draw();bindGameReset(reset);activeGameCleanup=()=>{};
  }
  function renderPool(stage){
    const c=document.createElement('canvas');c.width=420;c.height=250;c.className='premium-game-canvas pool-canvas';const ctx=c.getContext('2d');let balls=[{x:210,y:125,vx:0,vy:0,n:8},{x:110,y:105,vx:0,vy:0,n:1},{x:125,y:145,vx:0,vy:0,n:2}],aim=0,power=.7,score=0,raf;
    stage.innerHTML=gameToolbar('8 Ball Pool','pool','Poches')+'<div class="canvas-wrap"></div><div class="game-pad"><button id="aimL">↶</button><button id="shootPool">TIRER</button><button id="aimR">↷</button></div><div class="game-status" id="poolStatus">Ajustez l’angle puis tirez.</div>';stage.querySelector('.canvas-wrap').appendChild(c);
    const reset=()=>{balls=[{x:210,y:125,vx:0,vy:0,n:8},{x:110,y:105,vx:0,vy:0,n:1},{x:125,y:145,vx:0,vy:0,n:2}];score=0;draw()};const draw=()=>{ctx.fillStyle='#0b6b54';ctx.fillRect(0,0,420,250);ctx.strokeStyle='#d8b36a';ctx.lineWidth=10;ctx.strokeRect(5,5,410,240);ctx.fillStyle='#05070b';[[12,12],[408,12],[12,238],[408,238]].forEach(p=>{ctx.beginPath();ctx.arc(p[0],p[1],9,0,7);ctx.fill()});balls.forEach((b,i)=>{ctx.fillStyle=i?'#f4f4f5':'#111827';ctx.beginPath();ctx.arc(b.x,b.y,11,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText(b.n,b.x,b.y+3);b.x+=b.vx;b.y+=b.vy;b.vx*=.985;b.vy*=.985;if(b.x<18||b.x>402)b.vx*=-1;if(b.y<18||b.y>232)b.vy*=-1});raf=requestAnimationFrame(draw)};const shoot=()=>{balls[0].vx=Math.cos(aim)*12*power;balls[0].vy=Math.sin(aim)*12*power;score++;$('liveScore').textContent=score;$('poolStatus').textContent='Tir en cours…'};$('aimL').onclick=()=>aim-=.2;$('aimR').onclick=()=>aim+=.2;$('shootPool').onclick=shoot;bindGameReset(reset);draw();activeGameCleanup=()=>cancelAnimationFrame(raf)}
  function renderCyber(stage){return renderCanvasShooter(stage,'cyber','Cyber Strike','🤖')}
  function renderAir(stage){return renderCanvasShooter(stage,'air','Air Combat','✈️')}
  function renderCanvasShooter(stage,key,name,playerIcon){const c=document.createElement('canvas');c.width=360;c.height=500;c.className='premium-game-canvas';const ctx=c.getContext('2d');let x=180,y=430,enemies=[],score=0,lives=3,raf,shots=[],keys={};const reset=()=>{x=180;y=430;enemies=[];score=0;lives=3;shots=[];loop()};stage.innerHTML=gameToolbar(name,key,'Score')+'<div class="canvas-wrap"></div><div class="game-status" id="shootStatus">Déplacement tactile ou clavier. Maintenez pour tirer.</div>';stage.querySelector('.canvas-wrap').appendChild(c);const loop=()=>{ctx.fillStyle='#050912';ctx.fillRect(0,0,360,500);if(Math.random()<.025)enemies.push({x:20+Math.random()*320,y:-20,s:2+Math.random()*2});if(keys.l)x-=5;if(keys.r)x+=5;x=Math.max(20,Math.min(340,x));if(keys.f&&Math.random()<.22)shots.push({x,y:y-25});shots.forEach(s=>s.y-=8);enemies.forEach(e=>e.y+=e.s);for(const s of shots)for(const e of enemies){if(Math.hypot(s.x-e.x,s.y-e.y)<20){e.y=600;s.y=-20;score+=10}}for(const e of enemies){if(Math.hypot(e.x-x,e.y-y)<28){e.y=600;lives--;}}enemies=enemies.filter(e=>e.y<540);shots=shots.filter(s=>s.y>-20);ctx.font='28px sans-serif';ctx.textAlign='center';ctx.fillText(playerIcon,x,y);ctx.font='20px sans-serif';shots.forEach(s=>ctx.fillText('•',s.x,s.y));enemies.forEach(e=>ctx.fillText('☄️',e.x,e.y));$('liveScore').textContent=score;if(lives<=0){setGameScore(key,score);$('shootStatus').textContent='Mission terminée — record sauvegardé.'}else raf=requestAnimationFrame(loop)};const kd=e=>{if(e.key==='ArrowLeft')keys.l=true;if(e.key==='ArrowRight')keys.r=true;if(e.code==='Space')keys.f=true};const ku=e=>{if(e.key==='ArrowLeft')keys.l=false;if(e.key==='ArrowRight')keys.r=false;if(e.code==='Space')keys.f=false};document.addEventListener('keydown',kd);document.addEventListener('keyup',ku);stage.addEventListener('pointermove',e=>{const r=c.getBoundingClientRect();x=(e.clientX-r.left)/r.width*360});stage.addEventListener('pointerdown',()=>keys.f=true);stage.addEventListener('pointerup',()=>keys.f=false);bindGameReset(reset);raf=requestAnimationFrame(loop);activeGameCleanup=()=>{cancelAnimationFrame(raf);document.removeEventListener('keydown',kd);document.removeEventListener('keyup',ku)}}
  function renderPuzzle(stage){let g=Array.from({length:36},()=>Math.floor(Math.random()*5)),moves=0;const reset=()=>{g=Array.from({length:36},()=>Math.floor(Math.random()*5));moves=0;draw()};const draw=()=>{stage.innerHTML=gameToolbar('Puzzle Legend','puzzle','Score')+`<div class="match3-board">${g.map((v,i)=>`<button class="match3-cell c${v}" data-i="${i}">${['◆','●','■','▲','★'][v]}</button>`).join('')}</div><div class="game-status" id="puzzleStatus">Associez 3 symboles ou plus. Coups : ${moves}</div>`;stage.querySelectorAll('.match3-cell').forEach(b=>b.onclick=()=>{const i=+b.dataset.i,j=i+1;if(j<36&&Math.floor(j/6)===Math.floor(i/6)){[g[i],g[j]]=[g[j],g[i]];moves++;for(let k=0;k<34;k++)if(g[k]===g[k+1]&&g[k]===g[k+2]){g[k]=g[k+1]=g[k+2]=Math.floor(Math.random()*5);setGameScore('puzzle',moves)}draw()}})};draw();bindGameReset(reset);activeGameCleanup=()=>{}}
  function renderNinja(stage){const c=document.createElement('canvas');c.width=360;c.height=360;c.className='premium-game-canvas';const ctx=c.getContext('2d');let x=70,y=270,vy=0,score=0,obs=[],raf,playing=true;const reset=()=>{x=70;y=270;vy=0;score=0;obs=[];playing=true;loop()};stage.innerHTML=gameToolbar('Ninja Shadow','ninja','Score')+'<div class="canvas-wrap"></div><div class="game-status" id="ninjaStatus">Touchez pour sauter. Évitez les obstacles.</div>';stage.querySelector('.canvas-wrap').appendChild(c);const loop=()=>{if(!playing)return;ctx.fillStyle='#080b15';ctx.fillRect(0,0,360,360);if(Math.random()<.025)obs.push({x:360,h:25+Math.random()*55});vy+=.55;y+=vy;if(y>270){y=270;vy=0}obs.forEach(o=>o.x-=4);obs=obs.filter(o=>o.x>-30);for(const o of obs)if(o.x<95&&o.x+22>55&&y+30>270-o.h){playing=false;setGameScore('ninja',score);$('ninjaStatus').textContent='Collision — record sauvegardé.'}score++;$('liveScore').textContent=score;ctx.font='30px sans-serif';ctx.fillText('🥷',x,y);ctx.fillStyle='#f15b6c';obs.forEach(o=>ctx.fillRect(o.x,270-o.h,22,o.h));ctx.fillStyle='#222b3d';ctx.fillRect(0,300,360,4);if(playing)raf=requestAnimationFrame(loop)};const jump=()=>{if(y>=269)vy=-11};c.addEventListener('pointerdown',jump);stage.addEventListener('pointerdown',jump);bindGameReset(reset);loop();activeGameCleanup=()=>cancelAnimationFrame(raf)}
  function renderReversi(stage){let b=Array(64).fill(0);b[27]=2;b[28]=1;b[35]=1;b[36]=2;let turn=1,score=0;const dirs=[-1,1,-8,8,-9,-7,7,9];const valid=(i,p)=>{const r=Math.floor(i/8),c=i%8;return dirs.some(d=>{let j=i+d,n=0;while(j>=0&&j<64&&Math.abs(Math.floor(j/8)-Math.floor((j-d)/8))<=1&&b[j]===3-p){n++;j+=d}return n>0&&j>=0&&j<64&&b[j]===p&&Math.abs(Math.floor(j/8)-Math.floor((j-d)/8))<=1})};const reset=()=>{b=Array(64).fill(0);b[27]=2;b[28]=1;b[35]=1;b[36]=2;turn=1;score=0;draw()};const draw=()=>{stage.innerHTML=gameToolbar('Reversi Pro','reversi','Score')+`<div class="reversi-board">${b.map((v,i)=>`<button data-i="${i}" class="rev-cell">${v?`<i class="disc d${v}"></i>`:''}</button>`).join('')}</div><div class="game-status" id="revStatus">À vous — placez un jeton.</div>`;stage.querySelectorAll('.rev-cell').forEach(x=>x.onclick=()=>{const i=+x.dataset.i;if(turn===1&&b[i]===0&&valid(i,1)){b[i]=1;score++;$('liveScore').textContent=score;turn=2;$('revStatus').textContent='IA joue…';setTimeout(()=>{const vs=b.map((v,j)=>v===0&&valid(j,2)?j:-1).filter(j=>j>=0);if(vs.length){const k=vs[Math.floor(Math.random()*vs.length)];b[k]=2;score+=2}else $('revStatus').textContent='L’IA passe son tour.';turn=1;draw()},250);draw()}})};draw();bindGameReset(reset);activeGameCleanup=()=>{}}
  function renderMines(stage){let n=8,total=n*n,mines=new Set(),open=new Set(),flags=new Set(),first=true,over=false;const build=()=>{mines=new Set();while(mines.size<10){const i=Math.floor(Math.random()*total);if(i!==first)mines.add(i)}};const near=i=>{let r=Math.floor(i/n),c=i%n,s=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const j=(r+dr)*n+c+dc;if(r+dr>=0&&r+dr<n&&c+dc>=0&&c+dc<n&&mines.has(j))s++}return s};const reset=()=>{open=new Set();flags=new Set();first=true;over=false;draw()};const draw=()=>{stage.innerHTML=gameToolbar('Mines Pro','mines','Record')+`<div class="mines-board">${Array.from({length:total},(_,i)=>`<button class="mine-cell ${open.has(i)?'open':''}" data-i="${i}">${open.has(i)?(mines.has(i)?'💣':near(i)||''):flags.has(i)?'⚑':''}</button>`).join('')}</div><div class="game-status" id="mineStatus">10 mines · clic gauche pour ouvrir, appui long pour drapeau.</div>`;stage.querySelectorAll('.mine-cell').forEach(x=>{let timer;x.addEventListener('pointerdown',()=>timer=setTimeout(()=>{const i=+x.dataset.i;if(!open.has(i)&&!over){flags.has(i)?flags.delete(i):flags.add(i);draw()}},420));x.addEventListener('pointerup',()=>{clearTimeout(timer);const i=+x.dataset.i;if(over||flags.has(i))return;if(first){first=false;build()}if(mines.has(i)){over=true;open.add(i);$('mineStatus').textContent='Mine ! Partie terminée.'}else{open.add(i);if(open.size>=total-mines.size){over=true;$('mineStatus').textContent='Champ nettoyé ! 🏆';setGameScore('mines',open.size)}}draw()})});bindGameReset(reset)};draw();activeGameCleanup=()=>{}}
  function renderSudoku(stage){const solved=[5,3,4,6,7,8,9,1,2,6,7,2,1,9,5,3,4,8,1,9,8,3,4,2,5,6,7,8,5,9,7,6,1,4,2,3,4,2,6,8,5,3,7,9,1,7,1,3,9,2,4,8,5,6,9,6,1,5,3,7,2,8,4,2,8,7,4,1,9,6,3,5,3,4,5,2,8,6,1,7,9];let puzzle=solved.map((v,i)=>i%3===0||i%7===0?v:0);const reset=()=>{puzzle=solved.map((v,i)=>i%3===0||i%7===0?v:0);draw()};const draw=()=>{stage.innerHTML=gameToolbar('Sudoku Master','sudoku','Score')+`<div class="sudoku-board">${puzzle.map((v,i)=>`<input class="sudoku-cell" data-i="${i}" value="${v||''}" inputmode="numeric" maxlength="1" ${v?'readonly':''}>`).join('')}</div><button class="primary big" id="checkSudoku">Vérifier la grille</button><div class="game-status" id="sudokuStatus">Complétez la grille puis vérifiez.</div>`;stage.querySelector('#checkSudoku').onclick=()=>{const vals=[...stage.querySelectorAll('.sudoku-cell')].map(x=>Number(x.value));const ok=vals.every((v,i)=>v===solved[i]);$('sudokuStatus').textContent=ok?'Sudoku résolu ! 🏆':'Il reste des erreurs ou des cases vides.';if(ok){setGameScore('sudoku',1);$('liveScore').textContent=1}};bindGameReset(reset)};draw();activeGameCleanup=()=>{}}

  document.addEventListener("click", async e => {
    const gameTab = e.target.closest("[data-game]");
    if (gameTab && $("gameStage")) { e.preventDefault(); return startGame(gameTab.dataset.game); }
    const actionEl = e.target.closest("[data-action]");
    if (actionEl) {
      e.preventDefault();
      if (pageLoading && !["close-modal","new-logout"].includes(actionEl.dataset.action)) return;
    } else {
      const routeEl = e.target.closest("[data-route]");
      if (routeEl) { e.preventDefault(); if (pageLoading) return; navigate(routeEl.dataset.route); return; }
      return;
    }
    const action = actionEl.dataset.action, id = actionEl.dataset.id;
    const notificationId = actionEl.dataset.notification;
    if (action === "new-logout") return newLogout();
    if (action === "open-publisher") return openPublisher();
    if (action === "close-publisher") { closeModal(); state.composerOpen=false; state.composerDraftText=""; state.composerFile=null; state.composerBackground="plain"; state.composerLocation=""; return; }
    if (action === "select-publisher-bg") {
      state.composerBackground=actionEl.dataset.bg||"plain";
      document.querySelectorAll(".publisher-bg").forEach(x=>x.classList.toggle("selected",x===actionEl));
      return;
    }
    if (action === "publish-post-news") return publishPostNews();
    if (action === "publisher-photo") return $("postFile")?.click();
    if (action === "quick-publisher-photo") {
      const input=$("quickPostFile");
      if(!input)return;
      input.onchange=()=>{
        const file=input.files?.[0];
        if(!file)return;
        openPublisher();
        const pf=$("postFile");
        if(pf){
          try{
            const dt=new DataTransfer();
            dt.items.add(file);
            pf.files=dt.files;
            pf.dispatchEvent(new Event("change",{bubbles:true}));
          }catch(_){}
        }
      };
      input.click();
      return;
    }
    if (action === "publisher-clear-media") {
      const pf=$("postFile");
      if(pf)pf.value="";
      state.composerFile=null;
      const box=$("publisherMediaPreview");
      if(box)box.innerHTML="";
      if($("composerFileName"))$("composerFileName").textContent="Aucun média sélectionné";
      return;
    }
    if (action === "publisher-music") return openPublisherMusic();
    if (action === "publisher-tag") return openPublisherTag();
    if (action === "publisher-location") return openPublisherLocation();
    if (action === "publisher-mood") return openMoodComposer();
    if (action === "publisher-message") { state.composerMeta={...(state.composerMeta||{}),receive_messages:true}; return toast("Les messages directs seront activés sur cette publication."); }
    if (action === "publisher-event") return openPublisherField("event");
    if (action === "publisher-live") return openLiveSetup();
    if (action === "close-publisher-field") { closeModal(); if(state.composerOpen) setTimeout(openPublisher,40); return; }
    if (action === "publisher-location-apply") {
      const input=$("publisherPlaceInput"); if(!input?.dataset.placeValid || input.dataset.placeValid!=="true") return toast("Sélectionnez un lieu réel dans les résultats.");
      const value=input.value.trim(); state.composerLocation=value; state.composerMeta={...(state.composerMeta||{}),location:value,location_lat:input.dataset.placeLat||null,location_lon:input.dataset.placeLon||null};
      state.composerDraftText=(state.composerDraftText.trim()?state.composerDraftText.trim()+"\n":"")+`📍 ${value}`; closeModal(); if(state.composerOpen)setTimeout(()=>openPublisher(),40); return;
    }
    if (action === "select-publisher-tag") {
      const tid=actionEl.dataset.id,name=actionEl.dataset.name||"Membre"; const current=Array.isArray(state.composerMeta?.tagged_users)?state.composerMeta.tagged_users:[];
      const next=current.filter(x=>x.id!==tid); if(next.length===current.length)next.push({id:tid,name});
      state.composerMeta={...(state.composerMeta||{}),tagged_users:next,tag:next.map(x=>x.name).join(", ")};
      actionEl.classList.toggle("selected",next.some(x=>x.id===tid)); return;
    }
    if (action === "select-publisher-music") {
      const track=publisherMusicCatalog().find(x=>x.id===actionEl.dataset.musicId); if(!track)return;
      state.composerMeta={...(state.composerMeta||{}),music:track.title,music_id:track.id,music_style:track.style,music_seed:track.seed,music_bpm:track.bpm};
      playGeneratedMusic(track); toast(`${track.title} sélectionnée`); closeModal(); if(state.composerOpen)setTimeout(()=>openPublisher(),40); return;
    }
    if (action === "play-post-music") {
      const seed=Number(actionEl.dataset.musicSeed||1), idm=actionEl.dataset.musicId||`ai-${seed}`; const track=publisherMusicCatalog().find(x=>x.id===idm)||publisherMusicCatalog()[seed-1]||publisherMusicCatalog()[0]; playGeneratedMusic(track); toast(`Lecture : ${track.title}`); return;
    }
    if (action === "post-receive-message") {
      const ownerId=actionEl.dataset.ownerId; if(!ownerId)return; return startConversation(ownerId);
    }
    if (action === "publisher-field-apply") {
      const field=actionEl.dataset.field, value=$("publisherFieldInput")?.value.trim()||"";
      if(!value)return toast("Saisissez une valeur.");
      const prefix=field==="music"?`♫ ${value}`:field==="tag"?`👥 ${value}`:field==="location"?`📍 ${value}`:field==="event"?`📅 ${value}`:`❓ ${value}`;
      state.composerMeta={...(state.composerMeta||{}), [field]:value};
      if(field==="location") state.composerLocation=value;
      state.composerDraftText=(prefix+(state.composerDraftText.trim()?`\n${state.composerDraftText.trim()}`:"")).slice(0,5000);
      closeModal();
      if(state.composerOpen) setTimeout(()=>openPublisher(),40);
      return;
    }
    if (notificationId && action !== "mark-read") { await sb.from("notifications").update({is_read:true}).eq("id",notificationId).eq("user_id",state.user.id); updateBadges(); }
    if (action === "search-category") { searchCategory = actionEl.dataset.category || "accounts"; return searchPage($("searchInput")?.value || "", searchCategory); }
    if (action === "select-mood") { document.querySelectorAll(".mood-choice").forEach(x=>x.classList.remove("selected")); actionEl.classList.add("selected"); return; }
    if (action === "select-payment-method") { document.querySelectorAll(".payment-method").forEach(x=>x.classList.remove("active")); actionEl.classList.add("active"); return; }
    if (action === "apply-mood") { const v=document.querySelector(".mood-choice.selected")?.dataset.moodValue||""; const extra=$("moodExtra")?.value.trim()||""; if(!v&&!extra)return toast("Choisissez une humeur ou écrivez un message."); state.composerMeta={...(state.composerMeta||{}),mood:[v,extra].filter(Boolean).join(" — ").trim()}; const t=$("postText"); if(t)t.value=[v,extra].filter(Boolean).join(" — ").trim(); closeModal(); if(state.composerOpen) setTimeout(openPublisher,40); t?.focus(); return toast("Humeur ajoutée à votre publication"); }
    if (action === "more-question") return openPublisherField("question");
    if (action === "more-location") return openPublisherField("location");
    if (action === "more-file") { closeModal(); $("postFile")?.click(); return; }
    if (action === "more-style") { closeModal(); toast("Style premium prêt pour votre publication"); return; }
    if (action === "toggle-caption") return toggleCaption(actionEl);
    if (action === "confirm-live-start") { state.composerMeta={...(state.composerMeta||{}),live_title:$("liveTitleInput")?.value?.trim()||"Direct Tafaß"}; closeModal(); return startLiveFromPublisher(); }
    if (action === "watch-live") return watchLive(id);
    if (action === "end-live") return endLive();
    if (action === "close-live-viewer") { if(liveChannel){try{await sb.removeChannel(liveChannel);}catch(_){}} if(liveCommentsChannel){try{await sb.removeChannel(liveCommentsChannel);}catch(_){} liveCommentsChannel=null;} liveChannel=null; liveViewerPc?.close(); liveViewerPc=null; liveSessionId=null; liveRole=null; liveViewerId=null; liveCommentRows=[]; closeModal(); return; }
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

    if (action === "page-exit-mode") { closeModal(); state.activePage=null; state.entityBackRoute=null; state.navStack=["home"]; state.route="home"; restoreAccountNavigation(); syncIdentityUI(); return navigate("home",{replaceStack:true}); }
    if (action === "page-manage-current") { return editPage(state.activePage?.id); }
    if (action === "page-settings") return pageSettings(id || state.activePage?.id);
    if (action === "page-name-history") return pageNameHistory(id);
    if (action === "page-settings-save") return pageSettings(id);
    if (action === "save-page-settings") { const pgId=id||state.activePage?.id; const key=`tafass_page_settings_${pgId}`; const values={}; document.querySelectorAll('[data-page-setting]').forEach(x=>values[x.dataset.pageSetting]=x.checked); localStorage.setItem(key,JSON.stringify(values)); closeModal(); toast('Paramètres de la Page enregistrés.'); return; }
    if (action === "close-entity") { closeModal(); return navigate(actionEl.dataset.routeBack || "pages"); }
    if (action === "page-manage-back") { const pageId=actionEl.dataset.id || ""; closeModal(); return pageId ? openPageDetail(pageId) : navigate("pages"); }
    if (action === "page-back") return goBack();
    if (action === "toggle-page-follow") return togglePageFollow(id);
    if (action === "edit-page") return editPage(id);
    if (action === "save-page-edit") return savePageEdit(id);
    if (action === "page-member-menu") return pageMemberMenu(id, actionEl.dataset.entityId);
    if (action === "set-page-role") { const r=await sb.from('page_members').update({role:actionEl.dataset.role}).eq('page_id',actionEl.dataset.entityId).eq('user_id',id); if(r.error)return toast(r.error.message); closeModal(); toast('Rôle mis à jour.'); return openPageDetail(actionEl.dataset.entityId); }
    if (action === "remove-page-member") { const r=await sb.from('page_members').delete().eq('page_id',actionEl.dataset.entityId).eq('user_id',id); if(r.error)return toast(r.error.message); closeModal(); toast('Gestionnaire retiré.'); return openPageDetail(actionEl.dataset.entityId); }
    if (action === "page-contact") {
      const pg=(await sb.from('pages').select('id,name,owner_id').eq('id',id).maybeSingle()).data;
      if(!pg)return toast('Page introuvable.');
      openModal(`<div class="modal-box interaction-modal page-contact-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • CONTACT</span><h3>Contacter ${esc(pg.name)}</h3><p class="muted">Votre message sera envoyé à l’équipe de la Page.</p><textarea id="pageContactText" class="premium-input" maxlength="2000" placeholder="Écrivez votre message…"></textarea><button class="primary big" data-action="page-contact-send" data-id="${esc(id)}">Envoyer le message</button></div>`);
      setTimeout(()=>$('pageContactText')?.focus(),50); return;
    }
    if (action === "page-contact-send") {
      const text=$('pageContactText')?.value.trim(); if(!text)return toast('Écrivez un message.');
      const r=await sb.from('page_messages').insert({page_id:id,sender_id:state.user.id,message:text}); if(r.error)return toast(r.error.message);
      closeModal(); toast('Message envoyé à la Page.'); return;
    }
    if (action === "page-inbox") return pageInbox(id);
    if (action === "page-inbox-reply") { const text=$('pageReplyText')?.value.trim(); if(!text)return toast('Écrivez un message.'); const r=await sb.from('page_messages').insert({page_id:id,sender_id:state.user.id,message:text}); if(r.error)return toast(r.error.message); $('pageReplyText').value=''; toast('Réponse envoyée.'); return pageInbox(id); }
    if (action === "page-tab") return pageTab(id, actionEl.dataset.tab || "posts");
    if (action === "page-about-tab") return pageTab(id,'about');
    if (action === "page-admin-tab") return pageTab(id,'team');
    if (action === "page-publish") {
      const content=$('pagePostText')?.value.trim(); const file=$('pagePostMedia')?.files?.[0];
      if(!content && !file)return toast('Ajoutez un texte ou un média.');
      const btn=actionEl; setLoading(btn,true,'Publier');
      let media_url=null, media_type=null;
      if(file){ const ext=(file.name.split('.').pop()||'bin').toLowerCase(); const path=`${state.user.id}/page-post-${id}-${crypto.randomUUID()}.${ext}`; const up=await sb.storage.from('posts').upload(path,file,{upsert:false,contentType:file.type||undefined}); if(up.error){setLoading(btn,false,'Publier');return toast(up.error.message);} media_url=sb.storage.from('posts').getPublicUrl(path).data.publicUrl; media_type=file.type||''; }
      const r=await sb.from('page_posts').insert({page_id:id,user_id:state.user.id,content:content||'',media_url,media_type,visibility:'public'});
      setLoading(btn,false,'Publier'); if(r.error)return toast(r.error.message); toast('Publication publiée.'); return openPageDetail(id);
    }
    if (action === "page-post-like") return pagePostReaction(id, actionEl.dataset.entityId);
    if (action === "page-post-comment") return pagePostComment(id, actionEl.dataset.entityId);
    if (action === "page-send-comment") {
      const text=$('pageCommentInput')?.value.trim(); if(!text)return toast('Écrivez un commentaire.');
      const r=await sb.from('page_post_comments').insert({page_post_id:id,user_id:state.user.id,content:text}); if(r.error)return toast(r.error.message); closeModal(); toast('Commentaire publié.'); return openPageDetail(actionEl.dataset.entityId);
    }
    if (action === "share-page-post") return pagePostShare(id, actionEl.dataset.entityId);
    if (action === "group-post-like") return groupPostReaction(id, actionEl.dataset.entityId);
    if (action === "group-post-comment") return groupPostComment(id, actionEl.dataset.entityId);
    if (action === "group-send-comment") {
      const text=$('groupCommentInput')?.value.trim(); if(!text)return toast('Écrivez un commentaire.');
      const r=await sb.from('group_post_comments').insert({group_post_id:id,user_id:state.user.id,content:text}); if(r.error)return toast(r.error.message); closeModal(); toast('Commentaire publié.'); return reopenGroupDetail(actionEl.dataset.entityId);
    }
    if (action === "share-group-post") return groupPostShare(id, actionEl.dataset.entityId);

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
    if (action === "accept-role-request") return respondRoleRequest(id,true);
    if (action === "reject-role-request") return respondRoleRequest(id,false);
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
    if (action === "reply-message") { closeModal(); return replyConversationMessage(id); }
    if (action === "cancel-message-reply") return cancelMessageReply();
    if (action === "message-menu") return messageActionMenu(id);
    if (action === "edit-message") return editConversationMessage(id);
    if (action === "save-message-edit") return saveConversationMessageEdit(id);
    if (action === "delete-message") return deleteConversationMessage(id);
    if (action === "confirm-delete-message") return confirmDeleteConversationMessage(id);
    if (action === "open-conversation") return openConversation(id);
    if (action === "mark-read") return markRead();
    if (action === "theme") return toggleTheme();
    if (action === "settings-focus-search") { $("settingsSearch")?.focus(); return; }
    if (action === "open-games") return gamesModal();
    if (action === "capture-exact-location") return captureExactLocation();
    if (action === "close-games") { if (activeGameCleanup) { activeGameCleanup(); activeGameCleanup=null; } return closeModal(); }
    if (["save-profile-lock","save-privacy-assistance","save-find-contact-settings","save-notification-settings","save-family-settings","save-story-settings","save-publication-settings","save-public-content-settings","save-media-settings","save-time-settings","save-reaction-settings","save-audience-setting","save-followers-settings","save-profile-identification","save-online-settings","save-location-settings","save-professional-settings","save-accessibility-settings","save-effects-settings"].includes(action)) {
      if (action === "save-audience-setting") {
        const key = actionEl.dataset.audienceKey || "default_post_audience";
        const patch = {}; patch[key] = $("audienceValue")?.value || "public";
        return saveSettingsTable("audience_settings", patch, "Audience enregistrée");
      }
      return saveSettingsDetail(action);
    }
    if (action === "unblock-from-settings") {
      const r=await sb.from("blocked_profiles").delete().eq("blocker_id",state.user.id).eq("blocked_id",id);
      if(r.error) return toast(r.error.message);
      await logActivity("profile_unblocked","Compte débloqué","profile",id);
      blockedCache.loadedAt=0; await getBlockedIds(true); toast("Compte débloqué");
      return openAdvancedSetting("blocking");
    }
    if (action === "revoke-connected-app") {
      const r=await sb.from("connected_apps").update({status:"revoked",revoked_at:new Date().toISOString()}).eq("id",id).eq("user_id",state.user.id);
      if(r.error) return toast(r.error.message);
      toast("Connexion révoquée");
      return openAdvancedSetting("apps-web");
    }
    if (action === "revoke-professional-integration") {
      const r=await sb.from("professional_integrations").update({status:"revoked",revoked_at:new Date().toISOString()}).eq("id",id).eq("user_id",state.user.id);
      if(r.error) return toast(r.error.message);
      toast("Intégration révoquée");
      return openAdvancedSetting("professional-integrations");
    }
    if (action === "payment-review") { const method=document.querySelector(".payment-method.active")?.dataset.paymentMethod||"Airtel Money"; return submitPaymentRequest(method,$("paymentAmount")?.value||"",$("paymentPhone")?.value||""); }
    if (action === "close-payment") return servicePage("payment");
    if (action === "payment-settings") return servicePage("payment");
    if (action === "activity-settings") return servicePage("activity");

    if (action === "close-business-suite") { state.businessSuiteOpen=false; return closeModal(); }
    if (action === "business-refresh") return pageBusinessSuite();
    if (action === "business-open-messages") {
      closeModal(); state.businessSuiteOpen=false; return navigate("messages");
    }
    if (action === "business-open-pages") {
      closeModal(); state.businessSuiteOpen=false; return navigate("pages");
    }
    if (action === "business-open-team") {
      const first=(await sb.from("pages").select("id").eq("owner_id",state.user.id).order("created_at",{ascending:false}).limit(1)).data?.[0];
      if(!first)return toast("Créez une Page pour gérer une équipe.");
      return openPageDetail(first.id);
    }
    if (action === "business-open-settings") {
      const first=(await sb.from("pages").select("id").eq("owner_id",state.user.id).order("created_at",{ascending:false}).limit(1)).data?.[0];
      if(!first)return toast("Créez une Page pour ouvrir ses paramètres.");
      return pageSettings(first.id);
    }
    if (action === "create-story") return createStory();
    if (action === "story-create") return storyComposer();
    if (action === "open-story") {
      const s=(await sb.from("stories").select("*").eq("id",id).maybeSingle()).data;
      if(!s)return toast("Story introuvable ou expirée.");
      await sb.from("story_views").upsert({story_id:s.id,user_id:state.user.id},{onConflict:"story_id,user_id"});
      return openModal(`<div class="modal-box story-view-modal"><button class="modal-close" data-action="close-modal">×</button><span class="eyebrow">TAFAß • STORY</span><div class="story-view-content">${s.media_type==="video"?`<video src="${esc(s.media_url)}" controls autoplay playsinline></video>`:s.media_type==="text"?`<div class="story-view-text">${esc(s.text_overlay||"")}</div>`:`<img src="${esc(s.media_url)}" alt="Story">`}</div>${s.text_overlay&&s.media_type!=="text"?`<p class="story-view-caption">${esc(s.text_overlay)}</p>`:""}<small class="muted">Expire automatiquement après 24 heures.</small></div>`);
    }
    if (action === "save-advanced-visibility") return saveUserSetting({profile_visibility:$("advancedVisibility")?.value||"public"});

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
    if (["family-center","audience-defaults","reaction-settings","accessibility-settings","media-settings","time-management","effects-settings","profile-lock","professional-mode","post-privacy","story-privacy","page-privacy","followers-public","profile-identification","blocking","online-status","location-settings","apps-web","professional-integrations","information-management","terms","privacy-policy","cookies","community-standards","about-tafass","find-contact-settings","notifications-settings"].includes(action)) return openAdvancedSetting(action);
    if (action === "privacy-settings") return openPrivacySettings();
    if (action === "save-privacy") return saveUserSetting({ profile_visibility: $("privacyVisibility").value });
    if (action === "save-setting-toggle") { const key=actionEl.dataset.settingKey; return saveUserSetting({ [key]: !!$("settingToggle")?.checked }); }
    if (action === "save-search-privacy") return saveUserSetting({ allow_search_by_phone: !!$("allowSearchPhone")?.checked, allow_search_by_email: !!$("allowSearchEmail")?.checked });
    if (action === "save-language") return saveUserSetting({ language: $("languageSelect")?.value || "fr" });
    if (["friend-settings","message-settings","search-privacy-settings","language-settings","message-notification-settings","friend-notification-settings","reaction-notification-settings","comment-notification-settings"].includes(action)) return openSettingControl(action);
    if (action === "page-add-member") { return openModal(`<div class="modal-box page-edit-modal"><button class="page-close" data-action="close-modal">×</button><span class="page-eyebrow">TAFAß · ÉQUIPE</span><h2>Ajouter un gestionnaire</h2><p class="muted">Recherchez un membre par @username ou e-mail.</p><input id="pageManagerLookup" class="premium-input" placeholder="@username ou email"><select id="pageManagerRole" class="premium-input"><option value="editor">Éditeur</option><option value="admin">Administrateur</option></select><button class="primary big" data-action="add-page-member" data-id="${esc(id)}">Ajouter</button></div>`); }
    if (action === "add-page-member") { const q=$('pageManagerLookup')?.value.trim().replace(/^@/,''); if(!q)return toast('Entrez un username ou e-mail.'); let u=(await sb.from('profiles').select('id,first_name,last_name,username,email,avatar_url').or(`username.eq.${q},email.eq.${q}`).limit(1)).data?.[0]; if(!u)return toast('Membre introuvable.'); if(u.id===state.user.id)return toast('Vous ne pouvez pas vous inviter vous-même.'); const role=$('pageManagerRole')?.value||'editor'; const r=await sb.from('page_role_requests').insert({page_id:id,target_user_id:u.id,requested_by:state.user.id,role}); if(r.error)return toast(r.error.message); await sb.from('notifications').insert({user_id:u.id,actor_id:state.user.id,type:'page_role_request',title:'Nouvelle demande de rôle',message:`Vous êtes invité à devenir ${role==='admin'?'administrateur':'éditeur'} d’une Page Tafaß.`,entity_type:'page_role_request',entity_id:r.data?.[0]?.id||id}); closeModal(); toast('Demande envoyée. Le membre doit accepter ou refuser.'); return openPageDetail(id); }
    if (action === "invite-group") { return openModal(`<div class="modal-box page-edit-modal"><button class="page-close" data-action="close-modal">×</button><span class="page-eyebrow">TAFAß · GROUPE</span><h2>Inviter un membre</h2><p class="muted">Recherchez un membre par @username ou e-mail.</p><input id="groupInviteLookup" class="premium-input" placeholder="@username ou email"><button class="primary big" data-action="add-group-member" data-id="${esc(id)}">Inviter</button></div>`); }
    if (action === "add-group-member") { const q=$('groupInviteLookup')?.value.trim().replace(/^@/,''); if(!q)return toast('Entrez un username ou e-mail.'); const u=(await sb.from('profiles').select('id,username,email').or(`username.eq.${q},email.eq.${q}`).limit(1)).data?.[0]; if(!u)return toast('Membre introuvable.'); if(u.id===state.user.id)return toast('Vous êtes déjà dans ce groupe.'); const fr=(await sb.from('friendships').select('id').or(`and(user_id.eq.${state.user.id},friend_id.eq.${u.id}),and(user_id.eq.${u.id},friend_id.eq.${state.user.id})`).maybeSingle()).data; if(!fr)return toast('Vous pouvez inviter uniquement un ami accepté.'); const r=await sb.from('notifications').insert({user_id:u.id,actor_id:state.user.id,type:'group_join',title:'Invitation à rejoindre un groupe',message:'Vous êtes invité à rejoindre un groupe Tafaß.',entity_type:'group',entity_id:id}); if(r.error)return toast(r.error.message); closeModal(); toast('Invitation envoyée.'); return openGroupDetail(id); }
    if (action === "toggle-group-member") return toggleGroupMember(id);
    if (action === "edit-group") return editGroup(id);
    if (action === "save-group-edit") return saveGroupEdit(id);
    if (action === "group-member-role") return groupMemberRole(id, actionEl.dataset.entityId);
    if (action === "set-group-role") { const role=actionEl.dataset.role; if(role==='member'){ const r=await sb.from('group_members').update({role}).eq('group_id',actionEl.dataset.entityId).eq('user_id',id); if(r.error)return toast(r.error.message); closeModal(); toast('Rôle du membre mis à jour.'); return openGroupDetail(actionEl.dataset.entityId); } const r=await sb.from('group_role_requests').insert({group_id:actionEl.dataset.entityId,target_user_id:id,requested_by:state.user.id,role}); if(r.error)return toast(r.error.message); await sb.from('notifications').insert({user_id:id,actor_id:state.user.id,type:'group_role_request',title:'Nouvelle demande de rôle',message:`Vous êtes invité à devenir ${role==='admin'?'administrateur':'modérateur'} du groupe.`,entity_type:'group_role_request',entity_id:r.data?.[0]?.id}); closeModal(); toast('Demande envoyée. Le membre doit accepter ou refuser.'); return openGroupDetail(actionEl.dataset.entityId); }
    if (action === "remove-group-member") { const r=await sb.from('group_members').delete().eq('group_id',actionEl.dataset.entityId).eq('user_id',id); if(r.error)return toast(r.error.message); closeModal(); toast('Membre retiré.'); return openGroupDetail(actionEl.dataset.entityId); }
    if (action === "group-chat") return groupChat(id);
    if (action === "group-tab") return groupTab(id, actionEl.dataset.tab || "posts");
    if (action === "group-members-tab") return groupTab(id,'members');
    if (action === "group-about-tab") return groupTab(id,'about');
    if (action === "create-group") return openModal(`<div class="modal-box entity-create-modal-v2"><button class="modal-close" data-action="close-modal">×</button><div class="create-hero-v2 group"><span class="create-icon-v2 group-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M2.8 20c.6-4 2.5-6 5.2-6s4.6 2 5.2 6M13.5 15c3-.2 5 1.5 5.7 5"/></svg></span><div><span class="eyebrow">TAFAß • GROUPES</span><h3>Créer un groupe</h3><p>Créez votre espace communautaire avec une identité claire.</p></div></div><div class="create-grid-v2"><label class="create-field-v2 wide"><span>Nom du groupe</span><input id="newGroupName" maxlength="80" placeholder="Ex. Passion Madagascar"></label><label class="create-field-v2 wide"><span>Description</span><textarea id="newGroupDesc" maxlength="500" placeholder="Présentez votre groupe…"></textarea></label><label class="create-upload-v2"><span>Avatar du groupe</span><input id="newGroupAvatar" type="file" accept="image/jpeg,image/png,image/webp"><small>Optionnel • avatar par défaut automatique</small></label><label class="create-upload-v2"><span>Photo de couverture</span><input id="newGroupCover" type="file" accept="image/jpeg,image/png,image/webp"><small>Optionnel</small></label></div><button class="primary big create-submit-v2" data-action="save-group"><span>＋</span> Créer le groupe</button></div>`);
    if (action === "save-group") {
      const limit=await sb.rpc("tafa_can_create_group",{p_user_id:state.user.id}); if(limit.error)return toast(limit.error.message); if(limit.data===false)return toast("Limite atteinte : 5 groupes maximum sur 15 jours. Vous pourrez en créer un nouveau après la période de 15 jours.");
      const name=$("newGroupName")?.value.trim(); if(!name)return toast("Entrez un nom.");
      const r=await sb.from("groups").insert({owner_id:state.user.id,name,description:$("newGroupDesc")?.value.trim()||"",privacy:"public"}).select().single();
      if(r.error)return toast(r.error.message);
      const g=r.data;
      await sb.from("group_members").insert({group_id:g.id,user_id:state.user.id,role:"admin"});
      const patch={};
      const coverFile=$("newGroupCover")?.files?.[0] || $("newGroupAvatar")?.files?.[0];
      if(coverFile){ const ext=(coverFile.name.split('.').pop()||'jpg').toLowerCase(); const path=`${state.user.id}/group-${g.id}-cover-${crypto.randomUUID()}.${ext}`; const up=await sb.storage.from('posts').upload(path,coverFile,{upsert:false,contentType:coverFile.type||'image/jpeg'}); if(up.error){ toast('Groupe créé. Image non envoyée : '+up.error.message); } else patch.cover_url=sb.storage.from('posts').getPublicUrl(path).data.publicUrl; }
      if(Object.keys(patch).length) await sb.from('groups').update(patch).eq('id',g.id).eq('owner_id',state.user.id);
      closeModal(); toast("Groupe créé"); return genericListPage("groups");
    }
    if (action === "pages-tab") { state.pagesTab=actionEl.dataset.tab||"mine"; return pagesHub(); }
    if (action === "groups-tab") { state.groupsTab=actionEl.dataset.tab||"mine"; closeModal(); return groupsHub(); }
    if (action === "group-sort") { state.groupSort=actionEl.dataset.sort||"recent"; closeModal(); return groupsHub(); }
    if (action === "group-sort-menu") return groupSortMenu();
    if (action === "page-switch") {
      const pg=(await fetchPageById(id)).data; if(!pg)return toast("Page introuvable.");
      closeModal(); state.activePage={...pg}; state.navStack=["home"]; state.route="home"; syncIdentityUI(); history.replaceState(null,"","#home"); toast(`Mode ${pg.name} activé.`); return render();
    }
    if (action === "page-business") return pageBusinessSuite();
    if (action === "create-page") { state.businessSuiteOpen=false; return openModal(`<div class="modal-box entity-create-modal-v2"><button class="modal-close" data-action="close-modal">×</button><div class="create-hero-v2 page"><span class="create-icon-v2 page-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg></span><div><span class="eyebrow">TAFAß • PAGES</span><h3>Créer une Page</h3><p>Donnez à votre Page une identité professionnelle et claire.</p></div></div><div class="create-grid-v2"><label class="create-field-v2 wide"><span>Nom de la Page</span><input id="newPageName" maxlength="80" placeholder="Nom de la Page"></label><label class="create-field-v2"><span>Catégorie</span><select id="newPageCategory" aria-label="Catégorie de la Page"><option value="" selected disabled>Choisir une catégorie</option>${pageCategoryOptions()}</select><small class="create-select-hint">Plus de 50 catégories disponibles • choisissez une catégorie.</small></label><label class="create-upload-v2"><span>Avatar de la Page</span><input id="newPageAvatar" type="file" accept="image/jpeg,image/png,image/webp"><small>Optionnel • avatar par défaut automatique</small></label><label class="create-field-v2 wide"><span>Présentation</span><textarea id="newPageBio" maxlength="500" placeholder="Présentez votre Page…"></textarea></label><label class="create-upload-v2 wide"><span>Photo de couverture</span><input id="newPageCover" type="file" accept="image/jpeg,image/png,image/webp"><small>Optionnel</small></label></div><button class="primary big create-submit-v2" data-action="save-page"><span>＋</span> Créer la Page</button></div>`); }
    if (action === "save-page") {
      const limit=await sb.rpc("tafa_can_create_page",{p_user_id:state.user.id}); if(limit.error)return toast(limit.error.message); if(limit.data===false)return toast("Limite atteinte : 3 Pages maximum sur 15 jours. Vous pourrez en créer une nouvelle après la période de 15 jours.");
      const name=$("newPageName")?.value.trim(); if(!name)return toast("Entrez un nom.");
      const r=await sb.from("pages").insert({owner_id:state.user.id,name,category:$("newPageCategory")?.value.trim()||"Autre",bio:$("newPageBio")?.value.trim()||""}).select().single();
      if(r.error)return toast(r.error.message);
      const pg=r.data;
      await sb.from("page_members").upsert({page_id:pg.id,user_id:state.user.id,role:"owner"},{onConflict:"page_id,user_id"});
      const patch={};
      for(const [input,key] of [["newPageAvatar","logo_url"],["newPageCover","cover_url"]]){ const file=$(input)?.files?.[0]; if(!file) continue; const ext=(file.name.split('.').pop()||'jpg').toLowerCase(); const path=`${state.user.id}/page-${pg.id}-${key}-${crypto.randomUUID()}.${ext}`; const up=await sb.storage.from('posts').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'}); if(up.error){ toast('Page créée. Image non envoyée : '+up.error.message); break; } patch[key]=sb.storage.from('posts').getPublicUrl(path).data.publicUrl; }
      if(Object.keys(patch).length) await sb.from('pages').update(patch).eq('id',pg.id).eq('owner_id',state.user.id);
      closeModal(); toast("Page créée"); return genericListPage("pages");
    }
    if (action === "page-profile") { state.entityBackRoute = state.route || "pages"; return openPageDetail(id); }
    if (action === "page-open") { state.entityBackRoute = pageModeActive() && state.activePage?.id===id ? "home" : (state.route || "pages"); return openPageDetail(id); }
    if (action === "page-more") return pageMore(id);
    if (action === "page-invite-friends") return pageInviteFriends(id);
    if (action === "page-role-request") return sendPageRoleRequest(id, actionEl.dataset.entityId);
    if (action === "role-request-accept") return respondRoleRequest(id, true);
    if (action === "role-request-reject") return respondRoleRequest(id, false);
    if (action === "send-page-invites") return sendPageInvites(id);
    if (action === "page-share") return pageShare(id);
    if (action === "page-copy-link") return pageCopyLink(id);
    if (action === "page-report") return pageReport(id);
    if (action === "group-more") return groupMore(id);
    if (action === "group-share") { closeModal(); return groupShare(id); }
    if (action === "group-copy-link") return groupCopyLink(id);
    if (action === "group-open") {
      state.entityBackRoute = state.route || "groups";
      const x=(await fetchGroupById(id)).data;
      if(!x)return toast("Groupe introuvable");
      const [m,c,members,owner,posts]=await Promise.all([
        sb.from("group_members").select("id,role").eq("group_id",id).eq("user_id",state.user.id).maybeSingle(),
        sb.from("group_members").select("id",{count:"exact",head:true}).eq("group_id",id),
        sb.from("group_members").select("user_id,role,profiles(first_name,last_name,username,avatar_url)").eq("group_id",id).limit(40),
        sb.from("profiles").select("first_name,last_name,username,avatar_url,email,phone,country,city_current,bio").eq("id",x.owner_id).maybeSingle(),
        sb.from("group_posts").select("*,group_post_reactions(id,user_id,reaction_type),group_post_comments(id,user_id,content,created_at,profiles(first_name,last_name,username,avatar_url)),group_post_shares(id,user_id)").eq("group_id",id).order("created_at",{ascending:false}).limit(30)
      ]);
      const ownerMe=x.owner_id===state.user.id, isMember=!!m.data, myGroupRole=m.data?.role||null, isGroupAdmin=ownerMe || myGroupRole==='admin', canPost=isMember||ownerMe;
      const makeGroupPostRow=(p)=>{ const rr=p.group_post_reactions||[], cc=p.group_post_comments||[], mine=rr.some(r=>r.user_id===state.user.id), author=p.profiles||{}; const preview=cc.slice(-2).map(c=>`<div class="page-comment-row">${avatarHTML(c.profiles||{},'avatar page-comment-avatar')}<div><b>${esc(nameOf(c.profiles||{}))}</b><span>${esc(c.content||'')}</span></div></div>`).join(''); return `<article class="entity-post premium-entity-post"><div class="entity-post-top"><div>${avatarHTML(author,"avatar tiny-avatar")}<span><b>${esc(p.user_id===state.user.id?"Vous":nameOf(author)||x.name)}</b><small>${timeAgo(p.created_at)} · ${esc(x.name)}</small></span></div>${(p.user_id===state.user.id||isGroupAdmin)?`<button class="icon-mini" data-action="delete-group-post" data-id="${esc(p.id)}" data-entity-id="${esc(id)}" aria-label="Supprimer">×</button>`:""}</div>${p.content?`<div class="post-body">${esc(p.content)}</div>`:""}${p.media_url?`${String(p.media_type||'').startsWith('video')?`<video class="post-media" src="${esc(p.media_url)}" controls playsinline></video>`:`<img class="post-media" src="${esc(p.media_url)}" alt="Publication du groupe" loading="lazy">`}`:""}<div class="page-post-stats"><span>${rr.length} réactions</span><span>${cc.length} commentaires</span><span>${(p.group_post_shares||[]).length} partages</span></div><div class="entity-post-actions"><button class="${mine?'active':''}" data-action="group-post-like" data-id="${esc(p.id)}" data-entity-id="${esc(id)}">${mine?'♥':'♡'} J’aime</button><button data-action="group-post-comment" data-id="${esc(p.id)}" data-entity-id="${esc(id)}">💬 Commenter</button><button data-action="share-group-post" data-id="${esc(p.id)}" data-entity-id="${esc(id)}">↗ Partager</button></div>${preview?`<div class="page-comments-preview">${preview}</div>`:''}</article>`; };
      const allGroupPosts=posts.data||[], postRows=allGroupPosts.map(makeGroupPostRow).join("")||`<div class="entity-empty-state"><span>◎</span><b>Votre communauté commence ici</b><small>Publiez, échangez et retrouvez les nouveaux contenus en temps réel.</small></div>`, videoRows=allGroupPosts.filter(p=>String(p.media_type||"").startsWith("video")).map(makeGroupPostRow).join("")||`<div class="entity-empty-state"><span>▶</span><b>Aucune vidéo</b><small>Les vidéos publiées dans ce groupe apparaîtront ici.</small></div>`;
      const memberRows=(members.data||[]).map(v=>`<div class="entity-member-row">${avatarHTML(v.profiles||{},"avatar tiny-avatar")}<div class="grow"><b>${esc(v.profiles?nameOf(v.profiles):"Membre")}</b><small>${esc(v.role||"member")}</small></div>${isGroupAdmin&&v.user_id!==state.user.id?`<button class="member-more" data-action="group-member-role" data-id="${esc(v.user_id)}" data-entity-id="${esc(id)}">•••</button>`:""}</div>`).join("")||`<div class="muted">Aucun membre pour le moment.</div>`;
      return openModal(`<div class="modal-box entity-detail-modal premium-entity-detail group-detail fb-style-detail">
        <button class="entity-back-btn" data-action="close-entity" data-route-back="${esc(state.entityBackRoute || "groups")}" aria-label="Retour aux Groupes"><span>‹</span><small>Groupes</small></button>
        <div class="detail-cover premium-cover" ${x.cover_url?`style="background-image:url('${esc(x.cover_url)}')"`:''}><div class="cover-gradient"></div><span class="verified-chip">${x.privacy==='private'?'🔒 PRIVÉ':'🌐 PUBLIC'}</span></div>
        <div class="detail-head-wrap">${entityAvatarHTML(x,"group","detail-logo premium-detail-logo")}</div>
        <div class="detail-main"><span class="eyebrow">TAFAß • GROUPE COMMUNAUTAIRE</span><h3>${esc(x.name)}</h3><p class="entity-description">${esc(x.description||"Aucune description pour le moment.")}</p>
        <div class="detail-stats premium-stats"><span><b>${c.count||0}</b><small>Membres</small></span><span><b>${posts.data?.length||0}</b><small>Publications</small></span><span><b>${esc(x.privacy==='private'?'Privé':'Public')}</b><small>Confidentialité</small></span><span><b>${esc(owner.data?nameOf(owner.data):"Propriétaire du groupe")}</b><small>Administrateur</small></span></div>
        <div class="group-action-bar"><button class="primary" data-action="toggle-group-member" data-id="${esc(id)}">${isMember?"✓ Membre":"＋ Rejoindre"}</button>${isMember?`<button class="secondary-pill" data-action="group-chat" data-id="${esc(id)}">💬 Discussion</button>`:""}<button class="secondary-pill" data-action="group-share" data-id="${esc(id)}">↗ Partager</button>${isGroupAdmin?`<button class="secondary-pill" data-action="edit-group" data-id="${esc(id)}">⚙ Gérer</button>`:""}<button class="member-more" data-action="group-more" data-id="${esc(id)}" aria-label="Plus">•••</button></div>
        ${canPost?`<div class="entity-composer premium-composer"><div class="composer-label"><span>◎</span><b>Partager avec le groupe</b></div><textarea id="groupPostText" maxlength="5000" placeholder="Quoi de neuf dans la communauté ?"></textarea><div class="composer-tools"><label class="media-pick">＋ Média<input id="groupPostMedia" type="file" accept="image/*,video/*" hidden></label><span id="groupPostMediaName" class="muted">Aucun fichier</span><button class="primary composer-publish" data-action="group-publish" data-id="${esc(id)}">Publier</button></div></div>`:`<div class="join-callout"><b>Rejoignez le groupe</b><span>pour publier, commenter et participer aux discussions.</span><button class="primary" data-action="toggle-group-member" data-id="${esc(id)}">Rejoindre le groupe</button></div>`}
        <div class="entity-tabs group-tabs"><button class="active" data-tab="posts" data-action="group-tab" data-id="${esc(id)}">Publications</button><button data-tab="videos" data-action="group-tab" data-id="${esc(id)}">Vidéos</button><button data-tab="events" data-action="group-tab" data-id="${esc(id)}">Événements</button><button data-tab="members" data-action="group-tab" data-id="${esc(id)}">Membres</button><button data-tab="about" data-action="group-tab" data-id="${esc(id)}">À propos</button></div>
        <section class="group-tab-panel entity-feed-section" data-tab="posts"><div class="section-heading"><div><span class="eyebrow">COMMUNAUTÉ</span><h4>Publications</h4></div><span class="live-dot">● EN DIRECT</span></div><div class="entity-posts">${postRows}</div></section>
        <section class="group-tab-panel entity-feed-section hidden" data-tab="videos"><div class="section-heading"><div><span class="eyebrow">MÉDIAS</span><h4>Vidéos</h4></div></div><div class="entity-posts">${videoRows}</div></section>
        <section class="group-tab-panel entity-feed-section hidden" data-tab="events"><div class="group-events-empty"><div>📅</div><b>Événements</b><span>Aucun événement n’est programmé pour ce groupe.</span></div></section>
        <section class="group-tab-panel entity-members-section premium-about hidden" data-tab="members"><div class="section-heading"><div><span class="eyebrow">COMMUNAUTÉ</span><h4>Membres (${c.count||0})</h4></div>${isMember?`<button class="small-action" data-action="invite-group" data-id="${esc(id)}">＋ Inviter</button>`:""}</div>${memberRows}</section>
        <section class="group-tab-panel entity-about premium-about hidden" data-tab="about"><span class="eyebrow">INFORMATIONS</span><h4>À propos du groupe</h4><p>Créé le ${new Date(x.created_at).toLocaleDateString()} · Communauté ${esc(x.privacy||"publique")}.</p>${owner.data?.city_current?`<p>📍 ${esc(owner.data.city_current)}</p>`:""}</section>
        <div class="detail-actions premium-detail-actions">${isGroupAdmin?`<button class="ghost-action" data-action="edit-group" data-id="${esc(id)}">Modifier le groupe</button>`:""}<button class="primary big" data-action="toggle-group-member" data-id="${esc(id)}">${isMember?"Quitter le groupe":"Rejoindre le groupe"}</button></div>
        </div></div>`);
    }
    if (action === "group-publish") {
      const content=$('groupPostText')?.value.trim(); const file=$("groupPostMedia")?.files?.[0]; if(!content && !file)return toast("Ajoutez un texte ou un média.");
      let media_url=null, media_type=null;
      if(file){ const ext=(file.name.split('.').pop()||'bin').toLowerCase(); const path=`${state.user.id}/group-post-${id}-${crypto.randomUUID()}.${ext}`; const up=await sb.storage.from('posts').upload(path,file,{upsert:false,contentType:file.type||undefined}); if(up.error)return toast(up.error.message); media_url=sb.storage.from('posts').getPublicUrl(path).data.publicUrl; media_type=file.type||''; }
      const r=await sb.from("group_posts").insert({group_id:id,user_id:state.user.id,content:content||"",media_url,media_type}).select().single(); if(r.error)return toast(r.error.message); toast("Publication publiée dans le groupe");
      return document.querySelector(`[data-action="group-open"][data-id="${id}"]`)?.click() || closeModal();
    }
    if (action === "delete-page-post") { const r=await sb.from("page_posts").delete().eq("id",id); if(r.error)return toast(r.error.message); toast("Publication supprimée"); return openPageDetail(actionEl.dataset.entityId); }
  });

  // Auth UI — bound explicitly so login/signup/recovery remain clickable even while the app is loading.
  const bindAuthUI = () => {
    const loginForm=$("loginForm");
    if(loginForm && !loginForm.dataset.bound){
      loginForm.dataset.bound="1";
      loginForm.addEventListener("submit", async e=>{
        e.preventDefault();
        const email=($("loginEmail")?.value||"").trim(), password=$("loginPassword")?.value||"";
        if(!email){$("authMsg").textContent="Saisissez votre adresse e-mail ou votre numéro.";return;}
        if(!password){$("authMsg").textContent="Saisissez votre mot de passe.";return;}
        const btn=loginForm.querySelector('button[type="submit"]'); setLoading(btn,true,"Connexion"); $("authMsg").textContent="Connexion en cours…";
        try{
          let authEmail=email;
          if(!email.includes("@")){
            const normalized=normalizePhone(email,COUNTRY_META.MG);
            const lookup=await sb.from("profiles").select("email").eq("phone",normalized).maybeSingle();
            if(lookup.error||!lookup.data?.email) throw new Error("Compte introuvable. Utilisez l’adresse e-mail associée à votre compte.");
            authEmail=lookup.data.email;
          }
          const {error}=await sb.auth.signInWithPassword({email:authEmail,password});
          if(error) throw error;
          $("authMsg").textContent="";
        }catch(err){$("authMsg").textContent=err?.message||"Connexion impossible.";}
        finally{setLoading(btn,false,"Connexion");}
      });
    }
    const signupForm=$("signupForm");
    if(signupForm && !signupForm.dataset.bound){
      signupForm.dataset.bound="1";
      signupForm.addEventListener("submit", async e=>{
        e.preventDefault();
        const first=$("firstName")?.value.trim()||"",last=$("lastName")?.value.trim()||"",email=$("signupEmail")?.value.trim()||"",password=$("signupPassword")?.value||"",confirm=$("signupPasswordConfirm")?.value||"";
        if(!validateSignupStep(1)||!validateSignupStep(2)||!validateSignupStep(3)||!validateSignupStep(4))return;
        if(password!==confirm)return toast("Les deux mots de passe ne correspondent pas.");
        if(!$("terms")?.checked)return toast("Acceptez les conditions pour continuer.");
        const phone=normalizePhone($("phone")?.value||"",COUNTRY_META.MG); if(!COUNTRY_META.MG.test.test(phone))return toast("Numéro malgache invalide. Exemple : 330000000.");
        const btn=signupForm.querySelector('button[type="submit"]');setLoading(btn,true,"Créer mon compte");$("signupMsg").textContent="Création du compte…";
        try{
          const meta={first_name:first,last_name:last,phone,phone_code:"+261",country:"Madagascar",birth:$("birth")?.value||null};
          const {data,error}=await sb.auth.signUp({email,password,data:meta});
          if(error)throw error;
          if(data.session){
            const pr=await sb.from("profiles").upsert({id:data.user.id,...meta,email,updated_at:new Date().toISOString()},{onConflict:"id"});
            if(pr.error)throw pr.error;
            state.user=data.user;await enterApp();
          }else{$("signupMsg").textContent="Compte créé. Vérifiez votre e-mail si la confirmation est activée.";showLogin();$("loginEmail").value=email;}
        }catch(err){$("signupMsg").textContent=err?.message||"Création du compte impossible.";}
        finally{setLoading(btn,false,"Créer mon compte");}
      });
    }
    $("forgotPasswordForm")?.addEventListener("submit",sendPasswordReset);
    $("resetPasswordForm")?.addEventListener("submit",saveResetPassword);
    $("showSignup")?.addEventListener("click",showSignup);
    $("signupBackToLogin")?.addEventListener("click",showLogin);
    $("signupConnect")?.addEventListener("click",showLogin);
    $("showLogin")?.addEventListener("click",showLogin);
    $("forgotPassword")?.addEventListener("click",showForgotPassword);
    $("forgotBackLogin")?.addEventListener("click",showLogin);
    document.querySelectorAll("[data-password-toggle]").forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound="1";btn.addEventListener("click",()=>{const input=$(btn.dataset.passwordToggle);if(!input)return;input.type=input.type==="password"?"text":"password";});});
    document.querySelectorAll(".signup-next").forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound="1";btn.addEventListener("click",()=>{const n=Number(btn.dataset.nextStep);if(validateSignupStep(n-1))setSignupStep(n);});});
    document.querySelectorAll(".signup-prev").forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound="1";btn.addEventListener("click",()=>setSignupStep(Number(btn.dataset.prevStep)));});
    document.querySelectorAll("[data-oauth]").forEach(btn=>{if(btn.dataset.bound)return;btn.dataset.bound="1";btn.addEventListener("click",()=>signInWithProvider(btn.dataset.oauth));});
  };
  bindAuthUI();

  $("themeBtn").addEventListener("click", toggleTheme);
  syncThemeButton();
  $("modal").addEventListener("click", e => { if (e.target.id === "modal") { if(liveRole==="broadcaster" && liveSessionId) return toast("Terminez le direct pour quitter."); closeModal(); } });
  document.addEventListener("change", e => {
    if (state.route === "settings" && state.settingsDetailAction) {
      const autoMap = {
        "profile-lock":"save-profile-lock", "privacy-settings":"save-privacy-assistance", "find-contact-settings":"save-find-contact-settings",
        "notifications-settings":"save-notification-settings", "family-center":"save-family-settings", "story-privacy":"save-story-settings",
        "post-privacy":"save-publication-settings", "followers-public":"save-public-content-settings", "media-settings":"save-media-settings",
        "time-management":"save-time-settings", "reaction-settings":"save-reaction-settings", "profile-identification":"save-profile-identification",
        "online-status":"save-online-settings", "location-settings":"save-location-settings", "professional-mode":"save-professional-settings",
        "accessibility-settings":"save-accessibility-settings", "effects-settings":"save-effects-settings"
      };
      const saveAction = autoMap[state.settingsDetailAction];
      if (saveAction && e.target.closest(".settings-detail-page")) {
        clearTimeout(window.__tafassSettingsSaveTimer);
        window.__tafassSettingsSaveTimer = setTimeout(() => saveSettingsDetail(saveAction), 60);
      }
    }
    if(e.target.id==="pagePostMedia") $("pagePostMediaName")?.replaceChildren(document.createTextNode(e.target.files?.[0]?.name||"Aucun fichier"));
    if(e.target.id==="groupPostMedia") $("groupPostMediaName")?.replaceChildren(document.createTextNode(e.target.files?.[0]?.name||"Aucun fichier"));
  });
  $("globalSearch").addEventListener("keydown", e => { if (e.key === "Enter") { const q=e.target.value; navigate("search"); setTimeout(()=>{ const input=$("searchInput"); if(input){input.value=q; searchPage(q);} },0); } });
  window.addEventListener("hashchange", () => { const r=location.hash.slice(1); if(routes.includes(r) && r !== state.route) navigate(r); });
  document.addEventListener("contextmenu",e=>{ if(e.target.closest(".protected-media,.profile-page-premium.public-profile-page")) e.preventDefault(); });
  document.addEventListener("dragstart",e=>{ if(e.target.closest(".protected-media,.profile-page-premium.public-profile-page")) e.preventDefault(); });
  document.addEventListener("visibilitychange",()=>{
    const locked=document.documentElement.classList.contains("tafass-secure-content");
    document.documentElement.classList.toggle("tafass-private-blur",locked && document.visibilityState!=="visible");
  });

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

  function ensureLiveFeedRealtime(){
    if(state.liveFeedChannel || !state.user || !navigator.onLine) return;
    state.liveFeedChannel=sb.channel(`tafass-live-feed:${state.user.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"live_sessions"},()=>{ if(state.route==="home") renderFeed(); })
      .subscribe();
  }

  let authBootComplete = false;
  let authEventTimer = null;
  sb.auth.onAuthStateChange((event, session) => {
    if(authEventTimer) clearTimeout(authEventTimer);
    state.user = session?.user || null;
    if (event === "PASSWORD_RECOVERY") {
      setTimeout(() => showResetPassword(), 0);
      return;
    }
    // TOKEN_REFRESHED must never rebuild the application or send a valid user
    // back to the authentication page. Only real sign-in/out transitions do.
    if (event === "TOKEN_REFRESHED") return;
    if (event === "SIGNED_OUT") {
      state.user=null;
      if(state.loggingOut) return;
      $("app")?.classList.add("hidden");
      showLogin();
      return;
    }
    if (!["SIGNED_IN","INITIAL_SESSION","USER_UPDATED"].includes(event)) return;
    authEventTimer=setTimeout(async()=>{
      if(state.loggingOut || !state.user) return;
      try{
        await enterApp();
      }catch(err){
        console.error("Tafaß auth/app:",err);
        state.entering=false;
        // Keep the valid session. A transient database/render error must not
        // masquerade as a logout.
        if(!authBootComplete && !state.user) showLogin();
        else { $("auth")?.classList.add("hidden"); $("app")?.classList.remove("hidden"); }
      }finally{
        authBootComplete=true;
      }
    },20);
  });

  (async () => {
    try {
      const { data } = await sb.auth.getSession();
      state.user = data.session?.user || null;
      if (state.user) ensureLiveFeedRealtime();
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

  // PWA shell: cache-first for local assets, network-first for Supabase.
  if("serviceWorker" in navigator && location.protocol !== "file:"){
    window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js",{scope:"./"}).catch(e=>console.warn("Tafaß service worker:",e)));
  }

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
  window.addEventListener("unhandledrejection", e => {
    console.warn("Tafaß unhandled rejection:", e.reason);
    if(!navigator.onLine) networkBanner("Hors connexion — reconnexion automatique dès que le réseau revient.","offline");
  });
  window.addEventListener("error", e => {
    if(e?.message) console.warn("Tafaß runtime error:", e.message);
  });
  const markMediaForPerformance = root => {
    root?.querySelectorAll?.("img:not([loading]), video:not([preload])").forEach(el => {
      if(el.tagName === "IMG" && !el.closest(".splash-screen,.auth-screen")) el.loading="lazy";
      if(el.tagName === "VIDEO") el.preload="metadata";
    });
  };
  markMediaForPerformance(document);
  new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => { if(n.nodeType===1) markMediaForPerformance(n); }))).observe(document.body,{childList:true,subtree:true});

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && liveRole === "broadcaster" && liveSessionId) { e.preventDefault(); toast("Terminez le direct pour quitter."); return; }
    if (isFormField(e.target)) return;
    const key = String(e.key || "").toLowerCase();
    if ((e.ctrlKey || e.metaKey) && ["c", "x", "a", "u", "s"].includes(key)) {
      e.preventDefault();
    }
  });
})();
