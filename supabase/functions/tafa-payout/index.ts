import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const cfg: Record<string,{url?:string,token?:string}> = {
  mvola: { url:Deno.env.get('PAYOUT_MVOLA_URL'), token:Deno.env.get('PAYOUT_MVOLA_TOKEN') },
  orange_money: { url:Deno.env.get('PAYOUT_ORANGE_URL'), token:Deno.env.get('PAYOUT_ORANGE_TOKEN') },
  airtel_money: { url:Deno.env.get('PAYOUT_AIRTEL_URL'), token:Deno.env.get('PAYOUT_AIRTEL_TOKEN') },
  bank: { url:Deno.env.get('PAYOUT_BANK_URL'), token:Deno.env.get('PAYOUT_BANK_TOKEN') },
};

function json(body: unknown, status=200){ return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}}); }

Deno.serve(async req => {
  try {
    if(req.method !== 'POST') return json({ok:false,error:'POST required'},405);
    const auth = req.headers.get('Authorization') || '';
    if(!auth.startsWith('Bearer ')) return json({ok:false,error:'Authentication required'},401);
    const token = auth.slice(7);
    const {data:{user},error:userError} = await admin.auth.getUser(token);
    if(userError || !user) return json({ok:false,error:'Authentication required'},401);
    const {data:isAdmin,error:adminError}=await admin.rpc('tafa_is_admin',{p_user_id:user.id});
    if(adminError || !isAdmin) return json({ok:false,error:'Admin access required'},403);

    const body=await req.json().catch(()=>({}));
    const requestId=String(body.request_id||'').trim();
    if(!requestId) return json({ok:false,error:'request_id required'},400);

    const {data:reqRow,error:reqError}=await admin.from('tafab_withdrawal_requests')
      .select('id,user_id,amount_mga,status,payout_method_id,payout_attempts')
      .eq('id',requestId).maybeSingle();
    if(reqError || !reqRow) return json({ok:false,error:'Retrait introuvable'},404);
    if(!['pending','approved'].includes(reqRow.status)) return json({ok:false,error:`Retrait déjà traité: ${reqRow.status}`},409);

    const {data:pm,error:pmError}=await admin.from('tafab_creator_payout_methods')
      .select('provider,phone,account_name,bank_name,bank_account').eq('id',reqRow.payout_method_id).maybeSingle();
    if(pmError || !pm) return json({ok:false,error:'Moyen de paiement introuvable'},400);
    const provider=String(pm.provider);
    const c=cfg[provider];
    if(!c?.url || !c?.token){
      await admin.from('tafab_withdrawal_requests').update({payout_attempts:(reqRow.payout_attempts||0)+1,last_payout_error:`Provider ${provider} non configuré`}).eq('id',requestId);
      return json({ok:false,error:`Le provider ${provider} n'est pas encore configuré en production.`},503);
    }

    const idem=`tafass-payout-${requestId}`;
    const payload={
      reference: requestId,
      amount: Number(reqRow.amount_mga),
      currency: 'MGA',
      provider,
      beneficiary: provider==='bank' ? {name:pm.account_name,bank:pm.bank_name,account:pm.bank_account} : {name:pm.account_name,phone:pm.phone}
    };
    const response=await fetch(c.url,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${c.token}`,'idempotency-key':idem},body:JSON.stringify(payload)});
    const text=await response.text();
    let data:any={}; try{data=JSON.parse(text)}catch{data={raw:text};}
    if(!response.ok){
      await admin.from('tafab_withdrawal_requests').update({payout_attempts:(reqRow.payout_attempts||0)+1,last_payout_error:String(data?.message||data?.error||text).slice(0,500)}).eq('id',requestId);
      return json({ok:false,error:'Le prestataire a refusé le paiement.',provider_status:response.status},502);
    }
    const reference=String(data?.transactionId||data?.transaction_id||data?.reference||data?.id||'').trim();
    const providerStatus=String(data?.status||'success').toLowerCase();
    if(!reference || !['success','succeeded','paid','completed'].includes(providerStatus)){
      await admin.from('tafab_withdrawal_requests').update({payout_attempts:(reqRow.payout_attempts||0)+1,last_payout_error:'Réponse fournisseur sans confirmation de paiement'}).eq('id',requestId);
      return json({ok:false,error:'Paiement envoyé mais non confirmé par le prestataire.'},502);
    }
    const {error:finalizeError}=await admin.rpc('tafa_finalize_creator_payout',{p_request_id:requestId,p_external_reference:reference,p_provider_status:providerStatus});
    if(finalizeError) return json({ok:false,error:'Paiement externe confirmé mais finalisation Tafaß échouée. Conserver la référence: '+reference},500);
    return json({ok:true,reference,provider_status:providerStatus});
  }catch(e){ return json({ok:false,error:e instanceof Error?e.message:'Unexpected error'},500); }
});
