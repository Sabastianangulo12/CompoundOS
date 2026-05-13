import Stripe from "stripe";
import { assertEnv, env } from "@/lib/env";

let stripeClient: Stripe | null = null;

export function getStripe() {
  assertEnv(["STRIPE_SECRET_KEY", "NEXT_PUBLIC_APP_URL"], "Stripe");

  if (!stripeClient) {
    stripeClient = new Stripe(env.stripeSecretKey);
  }

  return stripeClient;
}

export function getAppUrl() {
  assertEnv(["NEXT_PUBLIC_APP_URL"], "Application URL");

  return env.appUrl.replace(/\/$/, "");
}
