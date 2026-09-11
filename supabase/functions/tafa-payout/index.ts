import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

type Provider = 'mvola'|'orange_money'|'airtel_money';
type ProviderConfig = { url?: string; token?: string; apiKey?: string; authHeader?: string; adapter?: string };

const cfg: Record<Provider, ProviderConfig> = {
  mvola: {
    url: Deno.env.get('PAYOUT_MVOLA_URL'),
    token: Deno.env.get('PAYOUT_MVOLA_TOKEN'),
    apiKey: Deno.env.get('PAYOUT_MVOLA_API_KEY'),
    authHeader: Deno.env.get('PAYOUT_MVOLA_AUTH_HEADER') || 'Authorization',
    adapter: Deno.env.get('PAYOUT_MVOLA_ADAPTER') || 'normalized'
  },
  orange_money: {
    url: Deno.env.get('PAYOUT_ORANGE_URL'),
    token: Deno.env.get('PAYOUT_ORANGE_TOKEN'),
    apiKey: Deno.env.get('PAYOUT_ORANGE_API_KEY'),
    authHeader: Deno.env.get('PAYOUT_ORANGE_AUTH_HEADER') || 'Authorization',
    adapter: Deno.env.get('PAYOUT_ORANGE_ADAPTER') || 'normalized'
  },
  airtel_money: {
    url: Deno.env.get('PAYOUT_AIRTEL_URL'),
    token: Deno.env.get('PAYOUT_AIRTEL_TOKEN'),
    apiKey: Deno.env.get('PAYOUT_AIRTEL_API_KEY'),
    authHeader: Deno.env.get('PAYOUT_AIRTEL_AUTH_HEADER') || 'Authorization',
    adapter: Deno.env.get('PAYOUT_AIRTEL_ADAPTER') || 'normalized'
  }
};

function json(body: unknown, status=200){
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function providerName(p: string){
  return ({mvola:'MVola', orange_money:'Orange Money', airtel_money:'Airtel Money'} as Record<string,string>)[p] || p;
}

function normalizePhone(raw: string){
  const digits = String(raw || '').replace(/[^0-9+]/g, '');
  if (digits.startsWith('+261')) return '0' + digits.slice(4);
  if (digits.startsWith('261')) return '0' + digits.slice(3);
  return digits;
}

function validateMadagascarMobile(provider: Provider, rawPhone: string){
  const phone = normalizePhone(rawPhone);
  if (!/^0\d{9}$/.test(phone)) return { ok:false, phone, error:'Numéro Mobile Money malgache invalide.' };
  const prefix = phone.slice(0,3);
  const allowed: Record<Provider,string[]> = {
    mvola: ['034','038'],
    orange_money: ['032','037'],
    airtel_money: ['033']
  };
  if (!allowed[provider].includes(prefix))
    return { ok:false, phone, error:`Le numéro ${phone} ne correspond pas au préfixe ${providerName(provider)} configuré.` };
  return { ok:true, phone };
}

function buildProviderRequest(provider: Provider, c: ProviderConfig, payload: any){
  if (c.adapter !== 'normalized') {
    throw new Error(`Adapter ${c.adapter} non installé pour ${providerName(provider)}. Ajoutez l'adapter officiel correspondant au contrat API.`);
  }
  const headers: Record<string,string> = { 'content-type':'application/json' };
  if (c.token) headers[c.authHeader || 'Authorization'] = c.authHeader === 'Authorization' ? `Bearer ${c.token}` : c.token;
  if (c.apiKey) headers['x-api-key'] = c.apiKey;
  return { headers, body: JSON.stringify(payload) };
}

async function updateFailure(table: string, requestId: string, attempts: number, err: string){
  await admin.from(table).update({
    status:'failed', payout_attempts:attempts, last_attempt_at:new Date().toISOString(), last_payout_error:err.slice(0,500)
  }).eq('id', requestId);
}

Deno.serve(async req => {
  try {
    if(req.method !== 'POST') return json({ok:false,error:'POST required'},405);
    const auth = req.headers.get('Authorization') || '';
    if(!auth.startsWith('Bearer ')) return json({ok:false,error:'Authentication required'},401);
    const token = auth.slice(7);
    const {data:{user},error:userError} = await admin.auth.getUser(token);
    if(userError || !user) return json({ok:false,error:'Authentication required'},401);

    const body=await req.json().catch(()=>({}));
    const requestId=String(body.request_id||'').trim();
    const kind=String(body.kind||'creator').toLowerCase()==='platform'?'platform':'creator';
    if(!requestId) return json({ok:false,error:'request_id required'},400);

    const {data:isAdmin,error:adminError}=await admin.rpc('tafa_is_admin',{p_user_id:user.id});
    if(adminError || !isAdmin) return json({ok:false,error:'Admin access required'},403);

    let row:any;
    if(kind==='platform'){
      const {data,error}=await admin.from('tafa_admin_withdrawals_v74')
        .select('id,admin_user_id,amount_mga,status,payout_method_id,payout_attempts')
        .eq('id',requestId).eq('admin_user_id',user.id).maybeSingle();
      if(error || !data) return json({ok:false,error:'Retrait plateforme introuvable'},404);
      row=data;
    }else{
      const {data,error}=await admin.from('tafab_withdrawal_requests')
        .select('id,user_id,amount_mga,status,payout_method_id,payout_attempts')
        .eq('id',requestId).maybeSingle();
      if(error || !data) return json({ok:false,error:'Retrait créateur introuvable'},404);
      row=data;
    }

    if(!['pending','approved','failed','processing'].includes(String(row.status)))
      return json({ok:false,error:`Retrait déjà traité: ${row.status}`},409);

    const methodOwnerId = kind==='platform' ? user.id : String(row.user_id||'');
    const {data:pm,error:pmError}=await admin.from('tafab_creator_payout_methods')
      .select('provider,phone,account_name').eq('id',row.payout_method_id).eq('user_id',methodOwnerId).maybeSingle();
    if(pmError || !pm) return json({ok:false,error:'Moyen Mobile Money introuvable'},400);

    const provider=String(pm.provider) as Provider;
    if(!['mvola','orange_money','airtel_money'].includes(provider))
      return json({ok:false,error:'Le retrait automatique accepte uniquement MVola, Orange Money ou Airtel Money.'},400);

    const phoneCheck=validateMadagascarMobile(provider, String(pm.phone||''));
    if(!phoneCheck.ok) return json({ok:false,error:phoneCheck.error,provider},400);

    const c=cfg[provider];
    if(!c?.url || (!c?.token && !c?.apiKey)){
      const err=`Provider ${providerName(provider)} non configuré en production. Le montant reste réservé en attente de configuration.`;
      const table=kind==='platform'?'tafa_admin_withdrawals_v74':'tafab_withdrawal_requests';
      await admin.from(table).update({status:'pending',last_payout_error:err,last_attempt_at:new Date().toISOString()}).eq('id',requestId);
      return json({ok:false,status:'pending',error:err,provider},503);
    }

    const markRpc=kind==='platform'?'tafa_mark_platform_payout_processing':'tafa_mark_creator_payout_processing';
    const {error:markError}=await admin.rpc(markRpc,{p_request_id:requestId});
    if(markError) return json({ok:false,error:markError.message},409);

    const idem=`tafass-payout-${kind}-${requestId}`;
    const payload={
      reference: requestId,
      amount: Number(row.amount_mga),
      currency: 'MGA',
      provider,
      beneficiary: { name:pm.account_name, phone:phoneCheck.phone },
      metadata: { platform:kind==='platform', tafass_request_id:requestId, idempotency_key:idem }
    };

    let providerRequest;
    try { providerRequest=buildProviderRequest(provider,c,payload); }
    catch(e){
      const err=e instanceof Error?e.message:'Provider adapter unavailable';
      const table=kind==='platform'?'tafa_admin_withdrawals_v74':'tafab_withdrawal_requests';
      await admin.from(table).update({status:'pending',last_attempt_at:new Date().toISOString(),last_payout_error:err.slice(0,500)}).eq('id',requestId);
      return json({ok:false,status:'pending',error:err,provider},503);
    }

    const response=await fetch(c.url,{method:'POST',headers:{...providerRequest.headers,'idempotency-key':idem},body:providerRequest.body});
    const text=await response.text();
    let data:any={}; try{data=JSON.parse(text)}catch{data={raw:text};}

    const table=kind==='platform'?'tafa_admin_withdrawals_v74':'tafab_withdrawal_requests';
    const attempts=(row.payout_attempts||0)+1;
    if(!response.ok){
      const err=String(data?.message||data?.error||text||`HTTP ${response.status}`).slice(0,500);
      await updateFailure(table,requestId,attempts,err);
      return json({ok:false,status:'failed',error:'Le prestataire a refusé le paiement.',provider_status:response.status,provider},502);
    }

    const reference=String(data?.transactionId||data?.transaction_id||data?.transactionReference||data?.reference||data?.id||'').trim();
    const providerStatus=String(data?.status||data?.paymentStatus||data?.transactionStatus||'processing').toLowerCase();
    if(['pending','processing','accepted','queued','initiated'].includes(providerStatus)){
      await admin.from(table).update({status:'processing',payout_attempts:attempts,last_attempt_at:new Date().toISOString(),provider_reference:reference||null,last_payout_error:null}).eq('id',requestId);
      return json({ok:false,status:'processing',reference:reference||null,provider_status:providerStatus,provider});
    }

    if(!reference || !['success','succeeded','paid','completed'].includes(providerStatus)){
      const err='Réponse fournisseur sans confirmation de paiement.';
      await admin.from(table).update({status:'failed',payout_attempts:attempts,last_attempt_at:new Date().toISOString(),provider_reference:reference||null,last_payout_error:err}).eq('id',requestId);
      return json({ok:false,status:'failed',error:err,provider_status:providerStatus,provider},502);
    }

    const finalizeRpc=kind==='platform'?'tafa_finalize_platform_payout':'tafa_finalize_creator_payout';
    const {error:finalizeError}=await admin.rpc(finalizeRpc,{p_request_id:requestId,p_external_reference:reference,p_provider_status:providerStatus});
    if(finalizeError){
      await admin.from(table).update({status:'processing',provider_reference:reference,last_payout_error:`Finalisation Tafaß échouée: ${finalizeError.message}`}).eq('id',requestId);
      return json({ok:false,status:'processing',reference,error:'Paiement externe confirmé mais finalisation Tafaß échouée. Conserver la référence.'},500);
    }
    return json({ok:true,status:'paid',reference,provider_status:providerStatus,provider});
  }catch(e){
    return json({ok:false,error:e instanceof Error?e.message:'Unexpected error'},500);
  }
});
