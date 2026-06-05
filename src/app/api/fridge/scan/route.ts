import { NextRequest, NextResponse } from "next/server";
import {
  assertTrustedBrowserOrigin,
  jsonNoStore,
  parseBoundedString
} from "@/lib/http-security";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { unlockFridgeSession } from "@/lib/fridge-wallet";

type ScanRequestBody = {
  qrToken?: string;
  fridgeLabel?: string;
};

export async function POST(request: NextRequest) {
  try {
    assertTrustedBrowserOrigin(request);
    const body = (await request.json().catch(() => null)) as ScanRequestBody | null;
    const qrToken = parseBoundedString(body?.qrToken, {
      label: "QR token",
      maxLength: 256
    });
    const fridgeLabel = body?.fridgeLabel
      ? parseBoundedString(body.fridgeLabel, {
          label: "Fridge label",
          maxLength: 80
        })
      : "Smart Fridge";

    const admin = createSupabaseAdminClient();
    const session = await unlockFridgeSession({
      admin,
      qrToken,
      fridgeLabel
    });

    return jsonNoStore({
      approved: true,
      sessionId: session.id,
      status: session.status
    });
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : "Fridge unlock denied." },
      { status: 400 }
    );
  }
}
