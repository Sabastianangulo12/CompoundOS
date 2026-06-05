import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithMessage(request: Request, message: string) {
  const target = new URL("/dashboard/ai-command-center", request.url);
  target.searchParams.set("message", message);
  return NextResponse.redirect(target);
}

export async function POST(request: Request) {
  const formData = new URLSearchParams(await request.text());
  const insightId = String(formData.get("insightId") ?? "").trim();
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

  if (!insightId) {
    return redirectWithMessage(request, "Insight not found.");
  }

  const { error } = await supabase
    .from("ai_insights")
    .update({
      status: "dismissed"
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", insightId);

  if (error) {
    return redirectWithMessage(request, error.message);
  }

  revalidatePath("/dashboard/ai-command-center");
  revalidatePath("/dashboard/automations");

  return redirectWithMessage(request, "Insight dismissed.");
}
