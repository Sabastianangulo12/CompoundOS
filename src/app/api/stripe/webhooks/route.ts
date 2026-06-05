import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { env } from "@/lib/env";
import { syncMemberCardSetupSession } from "@/lib/member-billing";
import {
  createOpsRequestContext,
  getDurationMs,
  logOpsEvent,
  serializeError
} from "@/lib/observability";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import {
  syncStripeCheckoutSession,
  syncStripeInvoice,
  syncStripeSubscription,
  updateGymStripeState
} from "@/lib/stripe-sync";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = createOpsRequestContext("stripe-webhook");

  if (!env.stripeWebhookSecret) {
    logOpsEvent("error", "stripe-webhook-missing-secret", {
      requestId: context.requestId
    });
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
    logOpsEvent("warn", "stripe-webhook-missing-signature", {
      requestId: context.requestId
    });
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
    logOpsEvent("warn", "stripe-webhook-verification-failed", {
      requestId: context.requestId,
      durationMs: getDurationMs(context),
      ...serializeError(error)
    });
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
    logOpsEvent("error", "stripe-webhook-existing-event-query-failed", {
      requestId: context.requestId,
      eventId: event.id,
      eventType: event.type,
      ...serializeError(existingEventResult.error)
    });
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
    logOpsEvent("info", "stripe-webhook-duplicate", {
      requestId: context.requestId,
      eventId: event.id,
      eventType: event.type,
      durationMs: getDurationMs(context)
    });
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
        logOpsEvent("info", "stripe-webhook-duplicate-race", {
          requestId: context.requestId,
          eventId: event.id,
          eventType: event.type
        });
        return NextResponse.json({
          received: true,
          duplicate: true
        });
      }

      logOpsEvent("error", "stripe-webhook-insert-failed", {
        requestId: context.requestId,
        eventId: event.id,
        eventType: event.type,
        ...serializeError(insertResult.error)
      });

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
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.mode === "setup" && session.metadata?.flow === "member_card_setup") {
          await syncMemberCardSetupSession(supabase, {
            session
          });
        }
        if (session.mode === "subscription") {
          await syncStripeCheckoutSession(supabase, session.id);
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        await syncStripeInvoice(supabase, event.data.object as Stripe.Invoice);
        break;
      }
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const gymId = account.metadata?.gymId;

        if (gymId) {
          await updateGymStripeState(supabase, gymId, account);
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    logOpsEvent("error", "stripe-webhook-processing-failed", {
      requestId: context.requestId,
      eventId: event.id,
      eventType: event.type,
      durationMs: getDurationMs(context),
      ...serializeError(error)
    });
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
    logOpsEvent("error", "stripe-webhook-mark-processed-failed", {
      requestId: context.requestId,
      eventId: event.id,
      eventType: event.type,
      ...serializeError(processedResult.error)
    });
    return NextResponse.json(
      {
        error: processedResult.error.message
      },
      {
        status: 500
      }
    );
  }

  logOpsEvent("info", "stripe-webhook-processed", {
    requestId: context.requestId,
    eventId: event.id,
    eventType: event.type,
    durationMs: getDurationMs(context)
  });

  return NextResponse.json({
    received: true
  });
}
