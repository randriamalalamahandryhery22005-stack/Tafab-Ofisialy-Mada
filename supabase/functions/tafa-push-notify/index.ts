import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:your-email@example.com";
const webhookSecret = Deno.env.get("TAFA_PUSH_WEBHOOK_SECRET") || "";

const admin = createClient(supabaseUrl, serviceRoleKey);
webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const actionByType: Record<string,string> = {
  reaction: "a réagi à votre publication.",
  comment: "a commenté votre publication.",
  post_share: "a partagé votre publication.",
  share: "a partagé votre publication.",
  friend_request: "vous a envoyé une demande d’amitié.",
  friendship: "est maintenant votre ami(e).",
  follow: "a commencé à vous suivre.",
  message: "vous a envoyé un message.",
  call: "vous appelle.",
  marketplace_order: "a passé une commande.",
  group_invite: "vous a invité dans un groupe.",
  group_join: "a rejoint votre groupe.",
  page_follow: "a commencé à suivre votre page.",
  general: "vous a envoyé une nouvelle notification."
};

function actorName(p: any) {
  const full = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
  return full || p?.username || p?.email?.split("@")[0] || "Quelqu’un";
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({error:"POST required"}), {status:405, headers:{"content-type":"application/json"}});
    }

    const incomingSecret = req.headers.get("x-tafa-push-secret") || "";
    if (!webhookSecret || incomingSecret !== webhookSecret) {
      return new Response(JSON.stringify({error:"Unauthorized"}), {status:401, headers:{"content-type":"application/json"}});
    }
    const payload = await req.json();
    const rec = payload?.record || payload?.new || payload;
    if (!rec?.user_id || rec?.is_read === true) {
      return new Response(JSON.stringify({ok:true, skipped:true}), {headers:{"content-type":"application/json"}});
    }

    const { data: subscriptions, error: subError } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", rec.user_id);

    if (subError) throw subError;
    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ok:true, sent:0}), {headers:{"content-type":"application/json"}});
    }

    let actor: any = null;
    if (rec.actor_id) {
      const q = await admin
        .from("profiles")
        .select("id,first_name,last_name,username,email")
        .eq("id", rec.actor_id)
        .maybeSingle();
      actor = q.data || null;
    }

    const type = String(rec.type || "general").toLowerCase();
    const action = actionByType[type] || actionByType.general;
    const name = actorName(actor);
    const body = actor ? `${name} ${action}` : String(rec.message || action);
    const title = "Tafaß";
    const origin = supabaseUrl.replace(/\/$/, "");
    const notification = JSON.stringify({
      title,
      body,
      icon: `${origin}/assets/tafass-logo-premium.svg`,
      badge: `${origin}/assets/tafass-logo-premium.svg`,
      url: "./",
      tag: `tafass-${String(rec.id || Date.now())}`,
      notification_id: rec.id || null,
      type
    });

    let sent = 0;
    const stale: string[] = [];

    for (const sub of subscriptions) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      };
      try {
        await webpush.sendNotification(subscription, notification, { TTL: 60 * 60 });
        sent++;
      } catch (e) {
        const status = Number((e as any)?.statusCode || 0);
        if (status === 404 || status === 410) stale.push(sub.id);
        console.warn("Tafaß push send failed:", status, (e as any)?.message || e);
      }
    }

    if (stale.length) {
      await admin.from("push_subscriptions").delete().in("id", stale);
    }

    return new Response(JSON.stringify({ok:true, sent, removed:stale.length}), {
      headers: {"content-type":"application/json"}
    });
  } catch (e) {
    console.error("Tafaß push notification:", e);
    return new Response(JSON.stringify({ok:false,error:String((e as any)?.message || e)}), {
      status:500,
      headers: {"content-type":"application/json"}
    });
  }
});
