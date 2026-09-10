import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const papiApiKey = Deno.env.get('PAPI_API_KEY')!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession:false } });
const BADGE_PRICE_MGA = 25000;
const PROVIDERS = new Set(['MVOLA','ORANGE_MONEY','AIRTEL_MONEY']);
const corsHeaders = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...corsHeaders}})}

Deno.serve(async req=>{
  try{
    if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
    if(req.method!=='POST') return json({ok:false,error:'POST required'},405);
    if(!papiApiKey) return json({ok:false,error:'PAPI_API_KEY is not configured in Supabase.'},503);
    const auth=req.headers.get('Authorization')||'';
    if(!auth.startsWith('Bearer ')) return json({ok:false,error:'Authentication required'},401);
    const {data:{user},error:userError}=await admin.auth.getUser(auth.slice(7));
    if(userError||!user) return json({ok:false,error:'Authentication required'},401);
    const body=await req.json().catch(()=>({}));
    const requestId=String(body.request_id||'').trim();
    const provider=String(body.provider||'MVOLA').trim().toUpperCase();
    if(!requestId) return json({ok:false,error:'request_id requis.'},400);
    if(!PROVIDERS.has(provider)) return json({ok:false,error:'Méthode Papi non disponible.'},400);

    const {data:request,error:reqError}=await admin.from('tafa_verification_requests').select('id,user_id,status,payment_status,payment_reference').eq('id',requestId).maybeSingle();
    if(reqError||!request||String(request.user_id)!==String(user.id)) return json({ok:false,error:'Demande de vérification introuvable.'},404);
    if(String(request.status).toLowerCase()!=='pending') return json({ok:false,error:'Cette demande n’est plus payable.'},409);
    if(String(request.payment_status||'').toUpperCase()==='SUCCESS') return json({ok:true,already_paid:true,reference:request.payment_reference||''});

    const existing=await admin.from('tafab_papi_badge_payments').select('id,reference,payment_link,payment_status').eq('request_id',requestId).eq('payment_status','PENDING').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(existing.data?.payment_link) return json({ok:true,paymentLink:existing.data.payment_link,reference:existing.data.reference,payment_id:existing.data.id});

    const reference=String(request.payment_reference||`TAFASS-BADGE-${requestId.slice(0,8)}-${crypto.randomUUID().replaceAll('-','').slice(0,16)}`);
    const {data:profile}=await admin.from('profiles').select('first_name,last_name,username,email,phone').eq('id',user.id).maybeSingle();
    const clientName=String([profile?.first_name,profile?.last_name].filter(Boolean).join(' ')||profile?.username||user.user_metadata?.full_name||user.email||'Utilisateur Tafaß').slice(0,120);
    const notificationUrl=`${supabaseUrl.replace(/\/$/,'')}/functions/v1/tafa-papi-notify`;
    const inserted=await admin.from('tafab_papi_badge_payments').insert({request_id:requestId,user_id:user.id,reference,amount_mga:BADGE_PRICE_MGA,provider,payment_status:'PENDING'}).select('id').single();
    if(inserted.error) return json({ok:false,error:inserted.error.message},500);

    const payload:any={amount:BADGE_PRICE_MGA,clientName,reference,description:'Demande de badge bleu Tafaß',notificationUrl,validDuration:60,provider,isTestMode:false};
    if(profile?.email||user.email) payload.payerEmail=String(profile?.email||user.email).slice(0,160);
    if(profile?.phone||user.user_metadata?.phone) payload.payerPhone=String(profile?.phone||user.user_metadata?.phone).trim().slice(0,30);
    const response=await fetch('https://app.papi.mg/dashboard/api/payment-links',{method:'POST',headers:{'Content-Type':'application/json','Token':papiApiKey},body:JSON.stringify(payload)});
    const text=await response.text(); let data:any={}; try{data=JSON.parse(text)}catch{data={raw:text}}
    if(!response.ok){await admin.from('tafab_papi_badge_payments').update({payment_status:'FAILED',message:String(data?.error?.message||data?.message||text).slice(0,500),updated_at:new Date().toISOString()}).eq('id',inserted.data.id);return json({ok:false,error:String(data?.error?.message||data?.message||'Papi a refusé la création du paiement.')},502)}
    const d=data?.data||data; const paymentLink=String(d?.paymentLink||'').trim(); const notificationToken=String(d?.notificationToken||'').trim();
    if(!paymentLink||!notificationToken){await admin.from('tafab_papi_badge_payments').update({payment_status:'FAILED',message:'Réponse Papi incomplète.',updated_at:new Date().toISOString()}).eq('id',inserted.data.id);return json({ok:false,error:'Papi n’a pas retourné le lien de paiement attendu.'},502)}
    await admin.from('tafab_papi_badge_payments').update({payment_link:paymentLink,notification_token:notificationToken,updated_at:new Date().toISOString()}).eq('id',inserted.data.id);
    await admin.from('tafa_verification_requests').update({payment_status:'PENDING',payment_reference:reference,payment_method:provider}).eq('id',requestId);
    return json({ok:true,payment_id:inserted.data.id,request_id:requestId,reference,paymentLink,amount:BADGE_PRICE_MGA,provider});
  }catch(e){return json({ok:false,error:e instanceof Error?e.message:'Unexpected error'},500)}
});
