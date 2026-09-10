import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession:false } });
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}})}
Deno.serve(async req=>{
  try{
    if(req.method!=='POST') return json({ok:false,error:'POST required'},405);
    const body:any=await req.json().catch(()=>({}));
    const reference=String(body.paymentReference||'').trim();
    const token=String(body.notificationToken||'').trim();
    const status=String(body.paymentStatus||'').trim().toUpperCase();
    const amount=Math.round(Number(body.amount||0));
    if(!reference||!token) return json({ok:false,error:'Notification Papi incomplète'},400);
    if(reference.startsWith('TAFASS-BADGE-')){
      const {data,error}=await admin.rpc('tafa_apply_papi_badge_payment',{p_reference:reference,p_notification_token:token,p_payment_status:status,p_payment_method:String(body.paymentMethod||'').trim(),p_amount_mga:amount,p_merchant_payment_reference:String(body.merchantPaymentReference||'').trim()});
      if(error) return json({ok:false,error:error.message},403);
      return json({ok:true,result:data});
    }
    const {data,error}=await admin.rpc('tafab_apply_papi_coin_payment',{p_reference:reference,p_notification_token:token,p_payment_status:status,p_payment_method:String(body.paymentMethod||'').trim(),p_amount_mga:amount,p_fee_mga:Math.round(Number(body.fee||0)),p_merchant_payment_reference:String(body.merchantPaymentReference||'').trim(),p_message:String(body.message||'').trim()});
    if(error) return json({ok:false,error:error.message},403);
    return json({ok:true,result:data});
  }catch(e){return json({ok:false,error:e instanceof Error?e.message:'Unexpected error'},500)}
});
