import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { syncStripeInvoice, syncStripeSubscription } from "@/lib/stripe-sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!env.stripeWebhookSecret) {
    return NextResponse.json(
      {
        error: "STRIPE_WEBHOOK_SECRET is not configured."
      },
      {
        status: 500
      }
    );
  }

  const rawBody = await request.text();
  const signature = (await headers()).get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      {
        error: "Missing Stripe signature."
      },
      {
        status: 400
      }
    );
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Webhook verification failed."
      },
      {
        status: 400
      }
    );
  }

  const supabase = createSupabaseAdminClient();
  const existingEventResult = await supabase
    .from("stripe_webhook_events")
    .select("id, processed_at")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existingEventResult.error) {
    return NextResponse.json(
      {
        error: existingEventResult.error.message
      },
      {
        status: 500
      }
    );
  }

  if (existingEventResult.data?.processed_at) {
    return NextResponse.json({
      received: true,
      duplicate: true
    });
  }

  if (!existingEventResult.data) {
    const insertResult = await supabase.from("stripe_webhook_events").insert({
      stripe_event_id: event.id,
      event_type: event.type
    });

    if (insertResult.error) {
      if (insertResult.error.code === "23505") {
        return NextResponse.json({
          received: true,
          duplicate: true
        });
      }

      return NextResponse.json(
        {
          error: insertResult.error.message
        },
        {
          status: 500
        }
      );
    }
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await syncStripeSubscription(supabase, event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        await syncStripeInvoice(supabase, event.data.object as Stripe.Invoice);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Webhook processing failed."
      },
      {
        status: 500
      }
    );
  }

  const processedResult = await supabase
    .from("stripe_webhook_events")
    .update({
      processed_at: new Date().toISOString()
    })
    .eq("stripe_event_id", event.id);

  if (processedResult.error) {
    return NextResponse.json(
      {
        error: processedResult.error.message
      },
      {
        status: 500
      }
    );
  }

  return NextResponse.json({
    received: true
  });
}
