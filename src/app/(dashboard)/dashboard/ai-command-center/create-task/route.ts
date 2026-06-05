import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { getMemberByIdForGym } from "@/lib/members";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function redirectWithMessage(request: Request, pathname: string, message: string) {
  const target = new URL(pathname, request.url);
  target.searchParams.set("message", message);
  return NextResponse.redirect(target);
}

export async function POST(request: Request) {
  const formData = new URLSearchParams(await request.text());
  const memberId = String(formData.get("memberId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const detailsValue = String(formData.get("details") ?? "").trim();
  const taskTypeValue = String(formData.get("taskType") ?? "general").trim();
  const priorityValue = String(formData.get("priority") ?? "medium").trim();
  const targetPath = redirectTo || "/dashboard/ai-command-center";
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

  if (!memberId) {
    return redirectWithMessage(request, targetPath, "Member not found.");
  }

  if (!title) {
    return redirectWithMessage(request, targetPath, "Task title is required.");
  }

  if (!["low", "medium", "high"].includes(priorityValue)) {
    return redirectWithMessage(request, targetPath, "Priority is invalid.");
  }

  if (!["general", "billing", "retention"].includes(taskTypeValue)) {
    return redirectWithMessage(request, targetPath, "Task type is invalid.");
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    return redirectWithMessage(
      request,
      targetPath,
      existingMember.error?.message ?? "Member not found."
    );
  }

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return redirectWithMessage(
      request,
      targetPath,
      authError?.message ?? "User not found."
    );
  }

  const { error } = await supabase.from("member_follow_up_tasks").insert({
    gym_id: currentGym.data.membership.gymId,
    member_id: memberId,
    author_user_id: user.id,
    title,
    details: detailsValue || null,
    task_type: taskTypeValue as "general" | "billing" | "retention",
    priority: priorityValue as "low" | "medium" | "high",
    due_at: null
  });

  if (error) {
    return redirectWithMessage(request, targetPath, error.message);
  }

  revalidatePath("/dashboard/front-desk");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/revenue");
  revalidatePath("/dashboard/ai-command-center");

  return redirectWithMessage(request, targetPath, "Follow-up task created.");
}
