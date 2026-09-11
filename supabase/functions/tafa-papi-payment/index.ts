import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const papiApiKey = Deno.env.get('PAPI_API_KEY')!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const PACKAGES: Record<string,{amount:number,coins:number}> = {
  '2000': { amount: 2000, coins: 10000 },
  '10000': { amount: 10000, coins: 50000 },
  '20000': { amount: 20000, coins: 100000 },
  '50000': { amount: 50000, coins: 250000 },
};
const PROVIDERS = new Set(['MVOLA','AIRTEL_MONEY','ORANGE_MONEY']);

const corsHeaders = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS'
};

function json(body: unknown, status=200){
  return new Response(JSON.stringify(body), { status, headers: { 'content-type':'application/json', ...corsHeaders } });
}

Deno.serve(async req => {
  try {
    if(req.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
    if(req.method !== 'POST') return json({ok:false,error:'POST required'},405);
    if(!papiApiKey) return json({ok:false,error:'PAPI_API_KEY is not configured in Supabase.'},503);

    const auth = req.headers.get('Authorization') || '';
    if(!auth.startsWith('Bearer ')) return json({ok:false,error:'Authentication required'},401);
    const token = auth.slice(7);
    const {data:{user},error:userError} = await admin.auth.getUser(token);
    if(userError || !user) return json({ok:false,error:'Authentication required'},401);

    const body = await req.json().catch(()=>({}));
    const amountKey = String(Math.round(Number(body.amount || 0)));
    const pack = PACKAGES[amountKey];
    if(!pack) return json({ok:false,error:'Pack de coins invalide.'},400);

    const provider = String(body.provider || '').trim().toUpperCase();
    if(provider && !PROVIDERS.has(provider)) return json({ok:false,error:'Méthode Papi non disponible.'},400);

    const {data:profile} = await admin.from('profiles').select('first_name,last_name,username,email,phone').eq('id',user.id).maybeSingle();
    const clientName = String([profile?.first_name,profile?.last_name].filter(Boolean).join(' ') || profile?.username || user.user_metadata?.full_name || user.email || 'Utilisateur Tafaß').slice(0,120);
    const payerEmail = String(profile?.email || user.email || '').slice(0,160) || undefined;
    const payerPhone = String(profile?.phone || user.user_metadata?.phone || '').trim().slice(0,30) || undefined;
    const reference = `TAFASS-COINS-${user.id.slice(0,8)}-${crypto.randomUUID().replaceAll('-','').slice(0,16)}`;
    const notificationUrl = `${supabaseUrl.replace(/\/$/,'')}/functions/v1/tafa-papi-notify`;

    const insert = await admin.from('tafab_papi_payments').insert({
      user_id:user.id, reference, amount_mga:pack.amount, coins:pack.coins,
      provider:provider || null, payment_status:'PENDING'
    }).select('id').single();
    if(insert.error) return json({ok:false,error:insert.error.message},500);

    const payload:any = {
      amount: pack.amount,
      clientName,
      reference,
      description: `Achat de ${pack.coins.toLocaleString('fr-FR')} coins Tafaß`,
      notificationUrl,
      validDuration: 1,
      isTestMode: false
    };
    if(provider) payload.provider = provider;
    if(payerEmail) payload.payerEmail = payerEmail;
    if(payerPhone) payload.payerPhone = payerPhone;

    const response = await fetch('https://app.papi.mg/dashboard/api/payment-links', {
      method:'POST',
      headers:{'Content-Type':'application/json','Token':papiApiKey},
      body:JSON.stringify(payload)
    });
    const text = await response.text();
    let data:any={}; try{ data=JSON.parse(text); }catch{ data={raw:text}; }

    if(!response.ok){
      await admin.from('tafab_papi_payments').update({payment_status:'FAILED',message:String(data?.error?.message||data?.message||text).slice(0,500),updated_at:new Date().toISOString()}).eq('id',insert.data.id);
      return json({ok:false,error:String(data?.error?.message||data?.message||'Papi a refusé la création du paiement.')},502);
    }

    const d=data?.data||data;
    const paymentLink=String(d?.paymentLink||'').trim();
    const notificationToken=String(d?.notificationToken||'').trim();
    if(!paymentLink || !notificationToken){
      await admin.from('tafab_papi_payments').update({payment_status:'FAILED',message:'Réponse Papi incomplète.',updated_at:new Date().toISOString()}).eq('id',insert.data.id);
      return json({ok:false,error:'Papi n’a pas retourné le lien de paiement attendu.'},502);
    }

    await admin.from('tafab_papi_payments').update({payment_link:paymentLink,notification_token:notificationToken,updated_at:new Date().toISOString()}).eq('id',insert.data.id);
    return json({ok:true,payment_id:insert.data.id,reference,paymentLink,coins:pack.coins,amount:pack.amount});
  }catch(e){
    return json({ok:false,error:e instanceof Error?e.message:'Unexpected error'},500);
  }
});
