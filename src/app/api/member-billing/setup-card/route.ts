import { NextRequest, NextResponse } from "next/server";
import { hasStripeServerEnv } from "@/lib/env";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { createMemberCardSetupUrl } from "@/lib/member-billing";

export async function POST(request: NextRequest) {
  const context = createMemberRouteContext(request, "member-billing-setup-card");

  if (!hasStripeServerEnv()) {
    return failureJson(
      context,
      "Billing server setup is not complete yet. Ask staff to finish Stripe configuration before adding a card.",
      503
    );
  }

  const auth = await requireAuthenticatedMember(context, {
    enforceTrustedOrigin: true
  });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { admin, member } = auth.data;
    const url = await createMemberCardSetupUrl(admin, member);
    return successJson(context, { url });
  } catch (error) {
    return failureJson(
      context,
      error instanceof Error ? error.message : "Card setup failed.",
      400,
      error
    );
  }
}
