import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("TAFASS_VAPID_PUBLIC_KEY")!;
const vapidPrivateKey = Deno.env.get("TAFASS_VAPID_PRIVATE_KEY")!;
const vapidSubject =
  Deno.env.get("TAFASS_VAPID_SUBJECT") || "mailto:admin@tafass.com";

const admin = createClient(supabaseUrl, serviceRole, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "content-type": "application/json",
    },
  });
}

function actorName(profile: any) {
  const full = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return full || profile?.username || "Un membre de Tafaß";
}

function routeFor(n: any) {
  const type = String(n?.type || "").toLowerCase();
  const entity = String(n?.entity_type || "").toLowerCase();
  const notificationId = String(n?.id || "");
  const entityId = String(n?.entity_id || n?.post_id || "");

  let route = "notifications";
  const params = new URLSearchParams({
    push: "1",
    route,
    ...(notificationId ? { notification: notificationId } : {})
  });

  if (entity === "conversation" || type.includes("message")) {
    route = "messages";
    params.set("route", route);
    const id = String(n?.entity_id || "");
    if (id) params.set("conversation", id);
  } else if (entity === "post" || n?.post_id) {
    route = "home";
    params.set("route", route);
    const id = String(n?.post_id || n?.entity_id || "");
    if (id) params.set("post", id);
  } else if (entity === "page") {
    route = "pages";
    params.set("route", route);
    if (entityId) params.set("entity", entityId);
    params.set("entity_type", "page");
  } else if (entity === "group") {
    route = "groups";
    params.set("route", route);
    if (entityId) params.set("entity", entityId);
    params.set("entity_type", "group");
  } else if (entity === "profile") {
    route = "profile";
    params.set("route", route);
    if (entityId) params.set("entity", entityId);
    params.set("entity_type", "profile");
  } else if (
    type.includes("friend") ||
    type.includes("follow") ||
    type.includes("request")
  ) {
    route = "friends";
    params.set("route", route);
  }

  return `https://tafab-ofisialy-mg.vercel.app/#${route}?${params.toString()}`;
}

function pushTargetFor(n: any) {
  const type = String(n?.type || "").toLowerCase();
  const entityType = String(n?.entity_type || "").toLowerCase();

  if (entityType === "conversation" || type.includes("message")) {
    return {
      route: "messages",
      notificationId: n?.id || "",
      conversationId: n?.entity_id || "",
      entityType: "conversation"
    };
  }

  if (entityType === "post" || n?.post_id) {
    return {
      route: "home",
      notificationId: n?.id || "",
      postId: n?.post_id || n?.entity_id || "",
      entityType: "post"
    };
  }

  if (entityType === "page") {
    return {
      route: "pages",
      notificationId: n?.id || "",
      entityId: n?.entity_id || "",
      entityType: "page"
    };
  }

  if (entityType === "group") {
    return {
      route: "groups",
      notificationId: n?.id || "",
      entityId: n?.entity_id || "",
      entityType: "group"
    };
  }

  if (entityType === "profile") {
    return {
      route: "profile",
      notificationId: n?.id || "",
      entityId: n?.entity_id || "",
      entityType: "profile"
    };
  }

  return {
    route:
      type.includes("friend") ||
      type.includes("follow") ||
      type.includes("request")
        ? "friends"
        : "notifications",
    notificationId: n?.id || "",
    entityId: n?.entity_id || "",
    entityType
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }

  try {
    if (
      !supabaseUrl ||
      !serviceRole ||
      !vapidPublicKey ||
      !vapidPrivateKey
    ) {
      return json(
        { error: "Push server configuration is incomplete." },
        500
      );
    }

    const expectedSecret =
      Deno.env.get("TAFA_PUSH_WEBHOOK_SECRET") || "";

    if (expectedSecret) {
      const supplied =
        req.headers.get("x-webhook-secret") || "";

      if (supplied !== expectedSecret) {
        return json(
          { error: "Invalid webhook secret." },
          401
        );
      }
    }

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublicKey,
      vapidPrivateKey
    );

    const payload = await req.json().catch(() => ({}));

    const record =
      payload?.record ||
      payload?.new ||
      payload;

    const userId =
      String(record?.user_id || "").trim();

    if (!userId) {
      return json(
        { error: "record.user_id is required." },
        400
      );
    }

    // Read subscriptions separately so database errors are never
    // incorrectly reported as "no_subscription".
    const subscriptionResult = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", userId);

    if (subscriptionResult.error) {
      console.error(
        "Tafaß push subscription query failed:",
        subscriptionResult.error
      );

      return json(
        {
          ok: false,
          error: "subscription_query_failed",
          details: subscriptionResult.error.message,
        },
        500
      );
    }

    const subscriptions = subscriptionResult.data ?? [];

    const actorResult = record?.actor_id
      ? await admin
        .from("profiles")
        .select("first_name,last_name,username")
        .eq("id", record.actor_id)
        .maybeSingle()
      : { data: null, error: null };

    if (actorResult.error) {
      console.error(
        "Tafaß actor profile query failed:",
        actorResult.error
      );
    }

    const actor = actorResult.data;

    if (!subscriptions.length) {
      return json({
        ok: true,
        sent: 0,
        reason: "no_subscription",
      });
    }

    const name = actorName(actor);

    const rawTitle = String(
      record?.title ||
      "Nouvelle notification"
    ).trim();

    let action = String(
      record?.message ||
      "Vous avez une nouvelle notification."
    ).trim();

    if (record?.actor_id && actor) {
      const stripped = action
        .replace(
          /^un membre\s+/i,
          ""
        )
        .replace(
          /^une personne\s+/i,
          ""
        );

      if (
        !action
          .toLowerCase()
          .startsWith(name.toLowerCase())
      ) {
        const lower =
          stripped.charAt(0).toLowerCase() +
          stripped.slice(1);

        action = `${name} ${lower}`.trim();
      }
    }

    const pushTarget = pushTargetFor(record);

    const body = JSON.stringify({
      title: "Tafaß",
      body: action || rawTitle,

      icon:
        `https://tafab-ofisialy-mg.vercel.app/assets/tafass-notification-icon.png`,

      badge:
        `https://tafab-ofisialy-mg.vercel.app/assets/tafass-notification-icon.png`,

      url: routeFor(record),

      route: pushTarget.route,
      notification_id: pushTarget.notificationId || null,
      conversation_id: pushTarget.conversationId || null,
      post_id: pushTarget.postId || null,
      entity_id: pushTarget.entityId || null,
      entity_type: pushTarget.entityType || null,

      tag:
        `tafass-${record?.id || crypto.randomUUID()}`
    });

    let sent = 0;

    for (const sub of subscriptions) {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(
          pushSub,
          body,
          {
            TTL: 120,
            urgency: "high",
          }
        );

        sent++;
      } catch (e) {
        const status = Number(
          (e as any)?.statusCode || 0
        );

        if (
          status === 404 ||
          status === 410
        ) {
          await admin
            .from("push_subscriptions")
            .delete()
            .eq("id", sub.id);
        }

        console.error(
          "Tafaß push send failed",
          status,
          String(
            (e as any)?.message || e
          ).slice(0, 500)
        );
      }
    }

    return json({
      ok: true,
      sent,
      total: subscriptions.length,
    });

  } catch (e) {
    console.error(
      "Tafaß push function error",
      e
    );

    return json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Internal error",
      },
      500
    );
  }
});