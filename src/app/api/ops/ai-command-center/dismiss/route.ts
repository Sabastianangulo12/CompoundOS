import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import {
  assertTrustedBrowserOrigin,
  jsonNoStore,
  parseBoundedString
} from "@/lib/http-security";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    assertTrustedBrowserOrigin(request);

    const supabase = await createSupabaseServerClient();
    const currentGym = await getCurrentGymContext(supabase);

    if (!currentGym.data) {
      return jsonNoStore(
        {
          ok: false,
          message: currentGym.error?.message ?? buildGymAccessMessage()
        },
        {
          status: 401
        }
      );
    }

    const payload = (await request.json().catch(() => ({}))) as {
      insightId?: unknown;
    };
    const insightId = parseBoundedString(payload.insightId, {
      label: "Insight id",
      maxLength: 120
    });

    const { error } = await supabase
      .from("ai_insights")
      .update({
        status: "dismissed"
      })
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("id", insightId);

    if (error) {
      return jsonNoStore(
        {
          ok: false,
          message: error.message
        },
        {
          status: 400
        }
      );
    }

    revalidatePath("/dashboard/ai-command-center");
    revalidatePath("/dashboard/automations");

    return jsonNoStore({
      ok: true,
      message: "Insight dismissed."
    });
  } catch (error) {
    return jsonNoStore(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to dismiss insight."
      },
      {
        status: 400
      }
    );
  }
}
