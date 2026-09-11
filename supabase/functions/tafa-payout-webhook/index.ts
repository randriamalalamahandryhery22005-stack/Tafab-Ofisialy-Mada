import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(url, serviceKey, { auth: { persistSession:false } });

function json(body: unknown, status=200){
  return new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json'}});
}

function constantTimeEqual(a:string,b:string){
  if(a.length!==b.length) return false;
  let v=0; for(let i=0;i<a.length;i++) v |= a.charCodeAt(i)^b.charCodeAt(i);
  return v===0;
}

async function hmacHex(secret:string, text:string){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

Deno.serve(async req=>{
  try{
    if(req.method!=='POST') return json({ok:false,error:'POST required'},405);
    const provider=String(req.headers.get('x-tafass-provider')||'').toLowerCase();
    const allowed=['mvola','orange_money','airtel_money'];
    if(!allowed.includes(provider)) return json({ok:false,error:'Provider webhook invalide'},400);

    const raw=await req.text();
    const secret=Deno.env.get(`PAYOUT_${provider==='orange_money'?'ORANGE':provider==='mvola'?'MVOLA':'AIRTEL'}_WEBHOOK_SECRET`)||'';
    if(!secret) return json({ok:false,error:'Webhook secret non configuré'},503);
    const received=req.headers.get('x-tafass-signature')||'';
    const expected=await hmacHex(secret,raw);
    if(!constantTimeEqual(received.replace(/^sha256=/i,''),expected)) return json({ok:false,error:'Signature invalide'},401);

    const body=JSON.parse(raw||'{}');
    const requestId=String(body.request_id||body.reference||body.merchant_reference||'').trim();
    const reference=String(body.transaction_reference||body.transactionId||body.transaction_id||body.reference_id||'').trim();
    const status=String(body.status||body.paymentStatus||body.transactionStatus||'').toLowerCase();
    const kind=String(body.kind||'creator').toLowerCase()==='platform'?'platform':'creator';
    if(!requestId) return json({ok:false,error:'request_id/reference manquant'},400);

    const table=kind==='platform'?'tafa_admin_withdrawals_v74':'tafab_withdrawal_requests';
    const {data:row,error:rowError}=await admin.from(table).select('id,status').eq('id',requestId).maybeSingle();
    if(rowError || !row) return json({ok:false,error:'Retrait introuvable'},404);
    if(row.status==='paid') return json({ok:true,status:'paid',reference:reference||null,idempotent:true});

    if(['pending','processing','accepted','queued','initiated'].includes(status)){
      await admin.from(table).update({status:'processing',provider_reference:reference||null,last_attempt_at:new Date().toISOString(),last_payout_error:null}).eq('id',requestId);
      return json({ok:true,status:'processing',reference:reference||null});
    }

    if(['success','succeeded','paid','completed'].includes(status) && reference){
      const fn=kind==='platform'?'tafa_finalize_platform_payout':'tafa_finalize_creator_payout';
      const {error}=await admin.rpc(fn,{p_request_id:requestId,p_external_reference:reference,p_provider_status:status});
      if(error) return json({ok:false,error:error.message},500);
      return json({ok:true,status:'paid',reference});
    }

    const err=String(body.message||body.error||'Paiement refusé par le prestataire').slice(0,500);
    await admin.from(table).update({status:'failed',last_attempt_at:new Date().toISOString(),provider_reference:reference||null,last_payout_error:err}).eq('id',requestId);
    return json({ok:true,status:'failed',reference:reference||null});
  }catch(e){ return json({ok:false,error:e instanceof Error?e.message:'Webhook error'},500); }
});
