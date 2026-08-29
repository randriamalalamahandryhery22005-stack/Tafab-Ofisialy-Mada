(() => {
"use strict";

const SUPABASE_URL="https://qvxmaeepwrprtoaipoir.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_OxmDXLn69jclSWnYtdjsxQ_TMfMI4X-";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,lock:async(_n,_t,fn)=>await fn()}
});
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const state={user:null,profile:null,route:"home",posts:[],channel:null,theme:localStorage.getItem("tafa-theme")||"light"};

const routes=["home","friends","search","profile","notifications","messages","videos","reels","pages","groups","saved","menu","settings"];
function toast(msg){const e=$("toast");e.textContent=msg;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2500)}
function avatarHTML(p,cls="avatar"){return p?.avatar_url?`<span class="${cls}"><img src="${esc(p.avatar_url)}"></span>`:`<span class="${cls}">${esc((p?.first_name||p?.username||"T").slice(0,1).toUpperCase())}</span>`}
function nameOf(p){return [p?.first_name,p?.last_name].filter(Boolean).join(" ")||p?.username||"Utilisateur"}

async function loadProfile(){
  if(!state.user)return;
  const {data,error}=await sb.from("profiles").select("*").eq("id",state.user.id).maybeSingle();
  if(error) console.warn(error);
  state.profile=data||{id:state.user.id,first_name:state.user.user_metadata?.first_name,last_name:state.user.user_metadata?.last_name,email:state.user.email};
  $("sideName").textContent=nameOf(state.profile);
  $("sideAvatar").outerHTML=avatarHTML(state.profile,"avatar");
  $("avatarBtn").outerHTML=`<button data-route="profile" id="avatarBtn" class="avatar avatar-sm">${state.profile.avatar_url?`<img src="${esc(state.profile.avatar_url)}">`:esc((nameOf(state.profile)[0]||"T"))}</button>`;
  bindNav();
}

async function loadPosts(){
  const {data,error}=await sb.from("posts").select("*").order("created_at",{ascending:false}).limit(30);
  if(error){console.warn(error);state.posts=[]}else state.posts=data||[];
  render();
}
async function postAuthor(id){
  const {data}=await sb.from("profiles").select("*").eq("id",id).maybeSingle();
  return data;
}
async function hydratePosts(){
  const ids=[...new Set(state.posts.map(p=>p.user_id).filter(Boolean))];
  if(!ids.length)return;
  const {data}=await sb.from("profiles").select("*").in("id",ids);
  const map=new Map((data||[]).map(x=>[x.id,x]));
  state.posts=state.posts.map(p=>({...p,author:map.get(p.user_id)}));
}
async function reactionsFor(postId){
  const {data}=await sb.from("post_reactions").select("reaction_type,user_id").eq("post_id",postId);
  return data||[];
}
async function commentsFor(postId){
  const {data}=await sb.from("comments").select("*").eq("post_id",postId).order("created_at",{ascending:true}).limit(50);
  return data||[];
}
async function renderFeed(){
  await hydratePosts();
  let html=`<div class="card composer">
    <div class="composer-top">${avatarHTML(state.profile)}<b>${esc(nameOf(state.profile))}</b></div>
    <textarea id="postText" placeholder="Quoi de neuf ?"></textarea>
    <div class="composer-actions"><label>📷 Photo/Vidéo <input id="postFile" type="file" accept="image/*,video/*" hidden></label><button class="primary" id="publishBtn">Publier</button></div>
  </div>`;
  if(!state.posts.length) html+=`<div class="card empty">Aucune publication pour le moment.<br>Publiez la première sur Tafaß.</div>`;
  for(const p of state.posts) html+=await postHTML(p);
  $("content").innerHTML=html;
  $("publishBtn")?.addEventListener("click",publishPost);
  document.querySelectorAll(".react-btn").forEach(b=>b.onclick=()=>showReactions(b.dataset.id));
  document.querySelectorAll(".share-btn").forEach(b=>b.onclick=()=>sharePost(b.dataset.id));
  document.querySelectorAll(".comment-btn").forEach(b=>b.onclick=()=>focusComment(b.dataset.id));
  document.querySelectorAll(".send-comment").forEach(b=>b.onclick=()=>addComment(b.dataset.id));
}
async function postHTML(p){
  const [rs,cs]=await Promise.all([reactionsFor(p.id),commentsFor(p.id)]);
  const counts={};rs.forEach(r=>counts[r.reaction_type]=(counts[r.reaction_type]||0)+1);
  const mine=rs.find(r=>r.user_id===state.user.id)?.reaction_type;
  const media=p.media_url? (p.media_type==="video"||p.media_type==="reel"?`<video class="post-media" src="${esc(p.media_url)}" controls></video>`:`<img class="post-media" src="${esc(p.media_url)}">`):"";
  const comments=cs.map(c=>`<div class="comment">${avatarHTML(null,"avatar") }<div class="bubble"><b>${esc(c.user_id===state.user.id?nameOf(state.profile):"Utilisateur")}</b><br>${esc(c.text||c.content||"")}</div></div>`).join("");
  return `<article class="post" id="post-${esc(p.id)}">
    <div class="post-head">${avatarHTML(p.author)}<div class="meta"><b>${esc(nameOf(p.author))}</b><br><small>${new Date(p.created_at||Date.now()).toLocaleString()}</small></div><button class="post-menu">⋯</button></div>
    <div class="post-body">${esc(p.content||"")}</div>${media}
    <div class="post-stats"><span>${Object.entries(counts).map(([k,v])=>`${esc(k)} ${v}`).join(" · ")||"Aucune réaction"}</span><span>${cs.length} commentaire(s) · ${Number(p.shares||0)} partage(s)</span></div>
    <div class="post-actions"><button class="react-btn" data-id="${esc(p.id)}">👍 ${mine||"Réagir"}</button><button class="comment-btn" data-id="${esc(p.id)}">💬 Commenter</button><button class="share-btn" data-id="${esc(p.id)}">↗ Partager</button></div>
    <div id="reaction-${esc(p.id)}"></div>
    <div class="comments">${comments}<div class="comment-form"><input id="comment-${esc(p.id)}" placeholder="Écrire un commentaire..."><button class="send-comment" data-id="${esc(p.id)}">Envoyer</button></div></div>
  </article>`;
}
async function showReactions(id){
  const box=$("reaction-"+id); if(!box)return;
  box.innerHTML=`<div class="reaction-picker">${["J’aime","J’adore","Solidaire","Haha","Waouh","Triste","En colère"].map(x=>`<button data-r="${esc(x)}">${esc(x)}</button>`).join("")}</div>`;
  box.querySelectorAll("button").forEach(b=>b.onclick=async()=>{await setReaction(id,b.dataset.r);box.innerHTML=""});
}
async function setReaction(postId,reaction){
  const {error}=await sb.rpc("tafa_set_post_reaction",{p_post_id:postId,p_reaction_type:reaction});
  if(error){toast(error.message);return}
  toast("Réaction enregistrée");await loadPosts();
}
async function addComment(postId){
  const input=$("comment-"+postId), text=input?.value.trim();if(!text)return;
  const {error}=await sb.from("comments").insert({post_id:postId,user_id:state.user.id,text,content:text});
  if(error){toast(error.message);return}
  input.value="";toast("Commentaire publié");await loadPosts();
}
function focusComment(id){$("comment-"+id)?.focus()}
async function sharePost(id){
  const {error}=await sb.rpc("tafa_increment_post_share",{p_post_id:id});
  if(error){const p=state.posts.find(x=>x.id===id);if(p){const r=await sb.from("posts").update({shares:Number(p.shares||0)+1}).eq("id",id);if(r.error){toast(r.error.message);return}}}
  toast("Publication partagée");await loadPosts();
}
async function publishPost(){
  if(!state.user)return;
  const content=$("postText").value.trim(), file=$("postFile").files[0];
  if(!content&&!file){toast("Écrivez quelque chose ou choisissez un média.");return}
  let media_url=null,media_type=null;
  if(file){
    const ext=file.name.split(".").pop().toLowerCase(), path=`${state.user.id}/${crypto.randomUUID()}.${ext}`;
    const up=await sb.storage.from("posts").upload(path,file,{upsert:false});
    if(up.error){toast("Upload: "+up.error.message);return}
    media_url=sb.storage.from("posts").getPublicUrl(path).data.publicUrl;
    media_type=file.type.startsWith("video/")?"reel":"image";
  }
  const row={user_id:state.user.id,content,media_url,media_type,visibility:"public"};
  const {error}=await sb.from("posts").insert(row);
  if(error){toast(error.message);return}
  $("postText").value="";$("postFile").value="";toast("Publication publiée");await loadPosts();
}
async function friendsPage(){
  const {data,error}=await sb.from("profiles").select("*").neq("id",state.user.id).limit(30);
  if(error){$("content").innerHTML=`<div class="card empty">${esc(error.message)}</div>`;return}
  $("content").innerHTML=`<div class="card"><h2>Amis & suggestions</h2><p class="muted">Découvrez des personnes sur Tafaß.</p>${(data||[]).map(p=>`<div class="list-row">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b><br><small class="muted">@${esc(p.username||"")}</small></div><button class="primary" data-friend="${esc(p.id)}">Ajouter</button></div>`).join("")}</div>`;
  document.querySelectorAll("[data-friend]").forEach(b=>b.onclick=async()=>{const {error}=await sb.from("friend_requests").insert({sender_id:state.user.id,receiver_id:b.dataset.friend,status:"pending"});toast(error?error.message:"Invitation envoyée");});
}
async function searchPage(q=""){
  const term=q.trim();
  let data=[];
  if(term){const r=await sb.from("profiles").select("*").or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,username.ilike.%${term}%`).limit(30);data=r.data||[]}
  $("content").innerHTML=`<div class="card"><h2>Rechercher</h2><input id="searchInput" value="${esc(term)}" placeholder="Compte, pseudo..."><div id="searchResults">${term?data.map(p=>`<div class="list-row">${avatarHTML(p)}<div class="grow"><b>${esc(nameOf(p))}</b><br><small class="muted">@${esc(p.username||"")}</small></div><button class="primary" data-view-profile="${esc(p.id)}">Voir</button></div>`).join("")||`<div class="empty">Aucun résultat.</div>`:`<div class="empty">Recherchez un utilisateur.</div>`}</div></div>`;
  $("searchInput").onkeydown=e=>{if(e.key==="Enter")searchPage(e.target.value)};
}
async function profilePage(){
  $("content").innerHTML=`<div class="hero"><div class="cover"></div><div class="profile-main">${avatarHTML(state.profile,"avatar profile-avatar")}<h2>${esc(nameOf(state.profile))}</h2><p class="muted">@${esc(state.profile.username||"")}</p><p>${esc(state.profile.bio||"Bienvenue sur Tafaß.")}</p><div class="profile-actions"><button class="primary" id="editProfile">Modifier le profil</button></div></div></div><div class="card"><h3>Publications</h3><div id="profilePosts"></div></div>`;
  $("editProfile").onclick=editProfile;
  const mine=state.posts.filter(p=>p.user_id===state.user.id); $("profilePosts").innerHTML=mine.length?mine.map(p=>`<div class="list-row"><div class="grow">${esc(p.content||"Publication")}</div></div>`).join(""):`<div class="empty">Aucune publication.</div>`;
}
function editProfile(){
  openModal(`<div class="modal-box"><h2>Modifier le profil</h2><div class="form-stack"><input id="pfFirst" value="${esc(state.profile.first_name||"")}" placeholder="Prénom"><input id="pfLast" value="${esc(state.profile.last_name||"")}" placeholder="Nom"><input id="pfUsername" value="${esc(state.profile.username||"")}" placeholder="Pseudo"><textarea id="pfBio" placeholder="Bio">${esc(state.profile.bio||"")}</textarea><button class="primary" id="saveProfile">Enregistrer</button></div></div>`);
  $("saveProfile").onclick=async()=>{const patch={first_name:$("pfFirst").value,last_name:$("pfLast").value,username:$("pfUsername").value.replace(/^@/,""),bio:$("pfBio").value};const {error}=await sb.from("profiles").update(patch).eq("id",state.user.id);if(error){toast(error.message);return}closeModal();await loadProfile();toast("Profil mis à jour");render()};
}
function openModal(html){$("modal").className="modal";$("modal").innerHTML=html}
function closeModal(){$("modal").className="modal hidden";$("modal").innerHTML=""}
$("modal").onclick=e=>{if(e.target.id==="modal")closeModal()}
function simplePage(title,body){$("content").innerHTML=`<div class="card"><h2>${title}</h2>${body}</div>`}
function menuPage(){simplePage("Menu",`<div class="menu-grid">${[["profile","👤 Profil"],["friends","♙ Amis"],["pages","▣ Pages"],["groups","◎ Groupes"],["videos","▶ Vidéos"],["reels","◉ Reels"],["saved","🔖 Enregistrements"],["settings","⚙ Paramètres"]].map(x=>`<button data-route="${x[0]}">${x[1]}</button>`).join("")}<button id="logout">↪ Se déconnecter</button></div>`);$("logout").onclick=logout}
async function render(){
  if(!state.user)return;
  document.querySelectorAll("[data-route]").forEach(x=>x.classList.toggle("active",x.dataset.route===state.route));
  if(state.route==="home")await renderFeed();
  else if(state.route==="friends")await friendsPage();
  else if(state.route==="search")await searchPage("");
  else if(state.route==="profile")await profilePage();
  else if(state.route==="menu")menuPage();
  else if(state.route==="notifications")simplePage("Notifications",`<div class="empty">Vos notifications apparaîtront ici en temps réel.</div>`);
  else if(state.route==="messages")simplePage("Messages",`<div class="empty">Vos conversations apparaîtront ici.</div>`);
  else if(state.route==="videos")simplePage("Vidéos",`<div class="empty">Les vidéos publiées sur Tafaß apparaîtront ici.</div>`);
  else if(state.route==="reels")simplePage("Reels",`<div class="empty">Les Reels apparaîtront ici.</div>`);
  else if(state.route==="pages")simplePage("Pages",`<div class="empty">Créez et gérez vos Pages Tafaß.</div>`);
  else if(state.route==="groups")simplePage("Groupes",`<div class="empty">Vos groupes apparaîtront ici.</div>`);
  else if(state.route==="saved")simplePage("Enregistrements",`<div class="empty">Vos publications enregistrées apparaîtront ici.</div>`);
  else if(state.route==="settings")simplePage("Paramètres",`<button class="primary" id="toggleTheme">Changer le thème</button>`);
  if($("toggleTheme"))$("toggleTheme").onclick=toggleTheme;
}
function bindNav(){document.querySelectorAll("[data-route]").forEach(x=>{x.onclick=()=>navigate(x.dataset.route)})}
function navigate(r){state.route=routes.includes(r)?r:"home";location.hash=state.route;render()}
function toggleTheme(){state.theme=state.theme==="dark"?"light":"dark";document.body.classList.toggle("dark",state.theme==="dark");localStorage.setItem("tafa-theme",state.theme)}
async function logout(){await sb.auth.signOut();location.reload()}
async function setupRealtime(){
  if(state.channel)sb.removeChannel(state.channel);
  state.channel=sb.channel("tafa-live")
    .on("postgres_changes",{event:"*",schema:"public",table:"posts"},()=>loadPosts())
    .on("postgres_changes",{event:"*",schema:"public",table:"comments"},()=>loadPosts())
    .on("postgres_changes",{event:"*",schema:"public",table:"post_reactions"},()=>loadPosts())
    .on("postgres_changes",{event:"*",schema:"public",table:"notifications"},()=>{})
    .subscribe();
}
async function enterApp(){
  $("auth").classList.add("hidden");$("signup").classList.add("hidden");$("app").classList.remove("hidden");
  document.body.classList.toggle("dark",state.theme==="dark");
  await loadProfile();await loadPosts();await setupRealtime();bindNav();
  $("globalSearch").onkeydown=e=>{if(e.key==="Enter"){state.route="search";renderSearchShortcut(e.target.value)}};
}
async function renderSearchShortcut(q){state.route="search";await searchPage(q)}
function showLogin(){ $("signup").classList.add("hidden");$("auth").classList.remove("hidden") }
function showSignup(){ $("auth").classList.add("hidden");$("signup").classList.remove("hidden") }
$("showSignup").onclick=showSignup;$("showLogin").onclick=showLogin;
$("loginForm").onsubmit=async e=>{e.preventDefault();$("authMsg").textContent="Connexion...";const {error}=await sb.auth.signInWithPassword({email:$("loginEmail").value,password:$("loginPassword").value});if(error)$("authMsg").textContent=error.message;else $("authMsg").textContent=""}
$("signupForm").onsubmit=async e=>{e.preventDefault();$("signupMsg").textContent="Création...";const first=$("firstName").value.trim(),last=$("lastName").value.trim(),username=$("username").value.trim().replace(/^@/,"");const {data,error}=await sb.auth.signUp({email:$("signupEmail").value,password:$("signupPassword").value,data:{first_name:first,last_name:last,username}});if(error){$("signupMsg").textContent=error.message;return}if(data.session){$("signupMsg").textContent="";return}$("signupMsg").textContent="Compte créé. Vérifiez votre e-mail si la confirmation est activée."}
sb.auth.onAuthStateChange(async(_event,session)=>{state.user=session?.user||null;if(state.user)await enterApp();else { $("app").classList.add("hidden");showLogin() }});
$("themeBtn").onclick=toggleTheme;
window.addEventListener("hashchange",()=>{const r=location.hash.slice(1);if(routes.includes(r)){state.route=r;render()}});
setTimeout(()=>{$("splash").style.opacity="0";setTimeout(()=>$("splash").remove(),350)},2200);
(async()=>{const {data}=await sb.auth.getSession();state.user=data.session?.user||null;if(state.user)await enterApp();else showLogin()})();
})();
