import { NextRequest, NextResponse } from "next/server";
import {
  parseSelectedItems
} from "@/lib/http-security";
import {
  createMemberRouteContext,
  failureJson,
  requireAuthenticatedMember,
  successJson
} from "@/lib/member-api";
import { getAuthenticatedMemberFromToken } from "@/lib/member-auth";
import { createFridgeUnlockSession } from "@/lib/fridge-wallet";

type UnlockRequestBody = {
  selectedItems?: Array<{
    productId?: string;
    quantity?: number;
  }>;
};

export async function POST(request: NextRequest) {
  const context = createMemberRouteContext(request, "fridge-unlock");
  const auth = await requireAuthenticatedMember(context, {
    enforceTrustedOrigin: true
  });

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json().catch(() => null)) as UnlockRequestBody | null;
    const selectedItems = parseSelectedItems(body?.selectedItems);
    const { admin, member } = auth.data;
    const session = await createFridgeUnlockSession({
      admin,
      member,
      selectedItems
    });

    return successJson(context, session);
  } catch (error) {
    return failureJson(
      context,
      error instanceof Error ? error.message : "Fridge unlock failed.",
      400,
      error
    );
  }
}
