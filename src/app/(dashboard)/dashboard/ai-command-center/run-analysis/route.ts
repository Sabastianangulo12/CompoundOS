import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { formatInsightRunMessage, recalculateGymInsights } from "@/lib/ai-insights";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithMessage(request: Request, pathname: string, message: string) {
  const target = new URL(pathname, request.url);
  target.searchParams.set("message", message);
  return NextResponse.redirect(target);
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    return NextResponse.redirect(
      new URL(
        currentGym.error
          ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
          : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`,
        request.url
      )
    );
  }

  const result = await recalculateGymInsights(
    supabase,
    currentGym.data.membership.gymId
  );

  if (result.error) {
    return redirectWithMessage(
      request,
      "/dashboard/ai-command-center",
      result.error.message
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ai-command-center");
  revalidatePath("/dashboard/automations");

  return redirectWithMessage(
    request,
    "/dashboard/ai-command-center",
    formatInsightRunMessage(result)
  );
}
