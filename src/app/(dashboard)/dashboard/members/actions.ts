"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { getMemberByIdForGym, isMemberStatus, memberStatuses } from "@/lib/members";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function membersPath(pathname = "/dashboard/members") {
  return pathname;
}

function membersMessage(pathname: string, message: string) {
  return `${pathname}?message=${encodeURIComponent(message)}`;
}

function readMemberPayload(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const emailValue = String(formData.get("email") ?? "").trim();
  const phoneValue = String(formData.get("phone") ?? "").trim();
  const joinedAtValue = String(formData.get("joinedAt") ?? "").trim();
  const statusValue = String(formData.get("status") ?? "").trim();

  if (!firstName || !lastName) {
    return {
      error: "First name and last name are required."
    } as const;
  }

  if (!isMemberStatus(statusValue)) {
    return {
      error: `Status must be one of: ${memberStatuses.join(", ")}.`
    } as const;
  }

  return {
    error: null,
    data: {
      first_name: firstName,
      last_name: lastName,
      email: emailValue || null,
      phone: phoneValue || null,
      joined_at: joinedAtValue || null,
      status: statusValue
    }
  } as const;
}

export async function createMemberAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  const payload = readMemberPayload(formData);

  if (payload.error) {
    redirect(membersMessage("/dashboard/members/new", payload.error));
  }

  const { error } = await supabase.from("members").insert({
    gym_id: currentGym.data.membership.gymId,
    ...payload.data
  });

  if (error) {
    redirect(membersMessage("/dashboard/members/new", error.message));
  }

  revalidatePath(membersPath());
  redirect(membersMessage(membersPath(), "Member created."));
}

export async function updateMemberAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!memberId) {
    redirect(membersMessage(membersPath(), "Member not found."));
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    redirect(
      membersMessage(
        membersPath(),
        existingMember.error?.message ?? "Member not found."
      )
    );
  }

  const payload = readMemberPayload(formData);

  if (payload.error) {
    redirect(membersMessage(`/dashboard/members/${memberId}/edit`, payload.error));
  }

  const { error } = await supabase
    .from("members")
    .update(payload.data)
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", memberId);

  if (error) {
    redirect(membersMessage(`/dashboard/members/${memberId}/edit`, error.message));
  }

  revalidatePath(membersPath());
  redirect(membersMessage(membersPath(), "Member updated."));
}

export async function archiveMemberAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!memberId) {
    redirect(membersMessage(membersPath(), "Member not found."));
  }

  const { error } = await supabase
    .from("members")
    .update({
      status: "canceled"
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", memberId);

  if (error) {
    redirect(membersMessage(membersPath(), error.message));
  }

  revalidatePath(membersPath());
  redirect(membersMessage(membersPath(), "Member archived."));
}

