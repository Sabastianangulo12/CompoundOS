import { NextRequest, NextResponse } from "next/server";
import { confirmFridgePurchase, formatWalletCurrency } from "@/lib/fridge-wallet";
import {
  parseBoundedString,
  parseSelectedItems
} from "@/lib/http-security";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import {
  getDurationMs,
  logOpsEvent,
} from "@/lib/observability";

type ConfirmRequestBody = {
  sessionId?: string;
  selectedItems?: Array<{
    productId?: string;
    quantity?: number;
  }>;
};

export async function POST(request: NextRequest) {
  const context = createMemberRouteContext(request, "fridge-confirm");
  const auth = await requireAuthenticatedMember(context, {
    enforceTrustedOrigin: true
  });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json().catch(() => null)) as ConfirmRequestBody | null;
    const sessionId = parseBoundedString(body?.sessionId, {
      label: "Fridge session",
      maxLength: 64
    });

    const selectedItems = parseSelectedItems(body?.selectedItems);
    const { admin, member } = auth.data;
    const result = await confirmFridgePurchase({
      admin,
      member,
      sessionId,
      selectedItems
    });

    return successJson(context, {
      orderId: result.order.id,
      status: result.order.status,
      subtotal: formatWalletCurrency(result.order.subtotal_cents),
      receipt: result.receipt
    });
  } catch (error) {
    return failureJson(
      context,
      error instanceof Error ? error.message : "Purchase confirmation failed.",
      400,
      error
    );
  }
}
