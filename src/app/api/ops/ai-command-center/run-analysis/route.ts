import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { assertTrustedBrowserOrigin, jsonNoStore } from "@/lib/http-security";
import { formatInsightRunMessage, recalculateGymInsights } from "@/lib/ai-insights";
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

    const result = await recalculateGymInsights(
      supabase,
      currentGym.data.membership.gymId
    );

    if (result.error) {
      return jsonNoStore(
        {
          ok: false,
          message: result.error.message
        },
        {
          status: 400
        }
      );
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ai-command-center");
    revalidatePath("/dashboard/automations");

    return jsonNoStore({
      ok: true,
      message: formatInsightRunMessage(result)
    });
  } catch (error) {
    return jsonNoStore(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Unable to run analysis."
      },
      {
        status: 400
      }
    );
  }
}
