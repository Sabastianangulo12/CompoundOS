"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createMemberCardSetupUrl } from "@/lib/member-billing";
import {
  cancelMemberMembership,
  freezeMemberMembership,
  resumeMemberMembership
} from "@/lib/member-billing";
import { getMembershipPlanByIdForGym } from "@/lib/revenue";
import { getMemberByIdForGym, isMemberStatus, memberStatuses } from "@/lib/members";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function membersPath(pathname = "/dashboard/members") {
  return pathname;
}

function membersMessage(pathname: string, message: string) {
  return `${pathname}?message=${encodeURIComponent(message)}`;
}

function nullableValue(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function readMemberPayload(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const emailValue = nullableValue(formData.get("email"));
  const phoneValue = nullableValue(formData.get("phone"));
  const joinedAtValue = nullableValue(formData.get("joinedAt"));
  const dateOfBirthValue = nullableValue(formData.get("dateOfBirth"));
  const addressLine1Value = nullableValue(formData.get("addressLine1"));
  const addressLine2Value = nullableValue(formData.get("addressLine2"));
  const cityValue = nullableValue(formData.get("city"));
  const stateRegionValue = nullableValue(formData.get("stateRegion"));
  const postalCodeValue = nullableValue(formData.get("postalCode"));
  const emergencyContactNameValue = nullableValue(formData.get("emergencyContactName"));
  const emergencyContactPhoneValue = nullableValue(formData.get("emergencyContactPhone"));
  const emergencyContactRelationshipValue = nullableValue(
    formData.get("emergencyContactRelationship")
  );
  const medicalNotesValue = nullableValue(formData.get("medicalNotes"));
  const waiverRequired = String(formData.get("waiverRequired") ?? "") === "true";
  const waiverTitleValue = nullableValue(formData.get("waiverTitle"));
  const waiverBodyValue = nullableValue(formData.get("waiverBody"));
  const waiverSignatureNameValue = nullableValue(formData.get("waiverSignatureName"));
  const waiverSignedAtValue = nullableValue(formData.get("waiverSignedAt"));
  const statusValue = String(formData.get("status") ?? "").trim();
  const membershipPlanIdValue = nullableValue(formData.get("membershipPlanId"));

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

  if (waiverRequired && (!waiverTitleValue || !waiverBodyValue)) {
    return {
      error: "A required waiver needs both a title and waiver text."
    } as const;
  }

  if (waiverSignatureNameValue && !waiverSignedAtValue) {
    return {
      error: "Add a signed-on date when a waiver signature name is provided."
    } as const;
  }

  if (waiverSignedAtValue && !waiverSignatureNameValue) {
    return {
      error: "Add the signed-by name when a waiver signed date is provided."
    } as const;
  }

  return {
    error: null,
    data: {
      first_name: firstName,
      last_name: lastName,
      email: emailValue,
      phone: phoneValue,
      date_of_birth: dateOfBirthValue,
      address_line_1: addressLine1Value,
      address_line_2: addressLine2Value,
      city: cityValue,
      state_region: stateRegionValue,
      postal_code: postalCodeValue,
      emergency_contact_name: emergencyContactNameValue,
      emergency_contact_phone: emergencyContactPhoneValue,
      emergency_contact_relationship: emergencyContactRelationshipValue,
      medical_notes: medicalNotesValue,
      waiver_required: waiverRequired,
      waiver_title: waiverTitleValue,
      waiver_body: waiverBodyValue,
      waiver_signature_name: waiverSignatureNameValue,
      waiver_signed_at: waiverSignedAtValue
        ? new Date(`${waiverSignedAtValue}T12:00:00Z`).toISOString()
        : null,
      joined_at: joinedAtValue,
      status: statusValue
    },
    membershipPlanId: membershipPlanIdValue
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

  const memberInsert = await supabase.from("members").insert({
    gym_id: currentGym.data.membership.gymId,
    ...payload.data
  }).select("id, joined_at, status").single();

  if (memberInsert.error || !memberInsert.data) {
    redirect(membersMessage("/dashboard/members/new", memberInsert.error?.message ?? "Member could not be created."));
  }

  if (payload.membershipPlanId) {
    const planResult = await getMembershipPlanByIdForGym(
      supabase,
      currentGym.data.membership.gymId,
      payload.membershipPlanId
    );

    if (planResult.error || !planResult.data) {
      redirect(
        membersMessage(
          `/dashboard/members/${memberInsert.data.id}/edit`,
          planResult.error?.message ?? "Selected plan was not found."
        )
      );
    }

    const currentPeriodStart = payload.data.joined_at
      ? new Date(`${payload.data.joined_at}T12:00:00Z`)
      : new Date();
    const currentPeriodEnd = new Date(currentPeriodStart);
    currentPeriodEnd.setDate(
      currentPeriodEnd.getDate() +
        (planResult.data.billing_interval === "weekly" ? 7 : 30)
    );

    const subscriptionInsert = await supabase.from("subscriptions").insert({
      gym_id: currentGym.data.membership.gymId,
      member_id: memberInsert.data.id,
      membership_plan_id: payload.membershipPlanId,
      status: "active",
      current_period_start: currentPeriodStart.toISOString(),
      current_period_end: currentPeriodEnd.toISOString()
    });

    if (subscriptionInsert.error) {
      redirect(
        membersMessage(
          `/dashboard/members/${memberInsert.data.id}/edit`,
          subscriptionInsert.error.message
        )
      );
    }
  }

  revalidatePath(membersPath());
  revalidatePath("/dashboard/revenue");
  redirect(
    membersMessage(
      `/dashboard/members/${memberInsert.data.id}/edit`,
      payload.membershipPlanId
        ? "Member created. Continue with billing and card setup below."
        : "Member created. Assign billing options below when ready."
    )
  );
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
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const targetPath = redirectTo || membersPath();
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
    redirect(membersMessage(targetPath, "Member not found."));
  }

  const { error } = await supabase
    .from("members")
    .update({
      status: "canceled"
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", memberId);

  if (error) {
    redirect(membersMessage(targetPath, error.message));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/revenue");
  revalidatePath("/dashboard/reports");
  revalidatePath(membersPath());
  revalidatePath(targetPath);
  redirect(membersMessage(targetPath, "Member archived."));
}

export async function freezeMemberMembershipAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const targetPath = redirectTo || `/dashboard/members/${memberId}/edit`;
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
    redirect(membersMessage(targetPath, "Member not found."));
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    redirect(
      membersMessage(
        targetPath,
        existingMember.error?.message ?? "Member not found."
      )
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    await freezeMemberMembership(admin, existingMember.data, 4);
  } catch (error) {
    redirect(
      membersMessage(
        targetPath,
        error instanceof Error ? error.message : "Freeze failed."
      )
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/revenue");
  revalidatePath("/dashboard/reports");
  revalidatePath(membersPath());
  revalidatePath(targetPath);
  redirect(membersMessage(targetPath, "Membership frozen for 4 weeks."));
}

export async function resumeMemberMembershipAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const targetPath = redirectTo || `/dashboard/members/${memberId}/edit`;
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
    redirect(membersMessage(targetPath, "Member not found."));
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    redirect(
      membersMessage(
        targetPath,
        existingMember.error?.message ?? "Member not found."
      )
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    await resumeMemberMembership(admin, existingMember.data);
  } catch (error) {
    redirect(
      membersMessage(
        targetPath,
        error instanceof Error ? error.message : "Renewal failed."
      )
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/revenue");
  revalidatePath("/dashboard/reports");
  revalidatePath(membersPath());
  revalidatePath(targetPath);
  redirect(membersMessage(targetPath, "Membership renewed."));
}

export async function cancelMemberMembershipAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const targetPath = redirectTo || `/dashboard/members/${memberId}/edit`;
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
    redirect(membersMessage(targetPath, "Member not found."));
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    redirect(
      membersMessage(
        targetPath,
        existingMember.error?.message ?? "Member not found."
      )
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    await cancelMemberMembership(admin, existingMember.data, {
      reason: "staff_canceled",
      notifyMember: true
    });
  } catch (error) {
    redirect(
      membersMessage(
        targetPath,
        error instanceof Error ? error.message : "Cancellation failed."
      )
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/revenue");
  revalidatePath("/dashboard/reports");
  revalidatePath(membersPath());
  revalidatePath(targetPath);
  redirect(membersMessage(targetPath, "Membership canceled."));
}

export async function addMemberNoteAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const targetPath = redirectTo || `/dashboard/members/${memberId}/edit`;
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
    redirect(membersMessage(targetPath, "Member not found."));
  }

  if (!body) {
    redirect(membersMessage(targetPath, "Note body is required."));
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    redirect(
      membersMessage(
        targetPath,
        existingMember.error?.message ?? "Member not found."
      )
    );
  }

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(membersMessage(targetPath, authError?.message ?? "User not found."));
  }

  const { error } = await supabase.from("member_notes").insert({
    gym_id: currentGym.data.membership.gymId,
    member_id: memberId,
    author_user_id: user.id,
    body
  });

  if (error) {
    redirect(membersMessage(targetPath, error.message));
  }

  revalidatePath("/dashboard/front-desk");
  revalidatePath("/dashboard/reports");
  revalidatePath(targetPath);
  redirect(membersMessage(targetPath, "Staff note added."));
}

export async function archiveMemberNoteAction(formData: FormData) {
  const noteId = String(formData.get("noteId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const targetPath = redirectTo || `/dashboard/members/${memberId}/edit`;
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!noteId || !memberId) {
    redirect(membersMessage(targetPath, "Note not found."));
  }

  const { error } = await supabase
    .from("member_notes")
    .update({
      is_archived: true
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("member_id", memberId)
    .eq("id", noteId);

  if (error) {
    redirect(membersMessage(targetPath, error.message));
  }

  revalidatePath("/dashboard/front-desk");
  revalidatePath("/dashboard/reports");
  revalidatePath(targetPath);
  redirect(membersMessage(targetPath, "Staff note archived."));
}

export async function createMemberFollowUpTaskAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const detailsValue = String(formData.get("details") ?? "").trim();
  const taskTypeValue = String(formData.get("taskType") ?? "general").trim();
  const priorityValue = String(formData.get("priority") ?? "medium").trim();
  const dueAtValue = String(formData.get("dueAt") ?? "").trim();
  const targetPath = redirectTo || `/dashboard/members/${memberId}/edit`;
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
    redirect(membersMessage(targetPath, "Member not found."));
  }

  if (!title) {
    redirect(membersMessage(targetPath, "Task title is required."));
  }

  if (!["low", "medium", "high"].includes(priorityValue)) {
    redirect(membersMessage(targetPath, "Priority is invalid."));
  }

  if (!["general", "billing", "retention", "front_desk"].includes(taskTypeValue)) {
    redirect(membersMessage(targetPath, "Task type is invalid."));
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    redirect(
      membersMessage(
        targetPath,
        existingMember.error?.message ?? "Member not found."
      )
    );
  }

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect(membersMessage(targetPath, authError?.message ?? "User not found."));
  }

  const { error } = await supabase.from("member_follow_up_tasks").insert({
    gym_id: currentGym.data.membership.gymId,
    member_id: memberId,
    author_user_id: user.id,
    title,
    details: detailsValue || null,
    task_type: taskTypeValue as "general" | "billing" | "retention" | "front_desk",
    priority: priorityValue as "low" | "medium" | "high",
    due_at: dueAtValue ? new Date(dueAtValue).toISOString() : null
  });

  if (error) {
    redirect(membersMessage(targetPath, error.message));
  }

  revalidatePath("/dashboard/front-desk");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/revenue");
  revalidatePath(targetPath);
  redirect(membersMessage(targetPath, "Follow-up task created."));
}

export async function startMemberCardSetupAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const targetPath = redirectTo || `/dashboard/members/${memberId}/edit`;
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
    redirect(membersMessage(targetPath, "Member not found."));
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    redirect(
      membersMessage(
        targetPath,
        existingMember.error?.message ?? "Member not found."
      )
    );
  }

  let setupUrl: string;
  try {
    const admin = createSupabaseAdminClient();
    setupUrl = await createMemberCardSetupUrl(admin, existingMember.data);
  } catch (error) {
    redirect(
      membersMessage(
        targetPath,
        error instanceof Error ? error.message : "Card setup could not start."
      )
    );
  }

  redirect(setupUrl);
}

export async function completeMemberFollowUpTaskAction(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "").trim();
  const memberId = String(formData.get("memberId") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "").trim();
  const targetPath = redirectTo || `/dashboard/members/${memberId}/edit`;
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!taskId || !memberId) {
    redirect(membersMessage(targetPath, "Task not found."));
  }

  const { error } = await supabase
    .from("member_follow_up_tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString()
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("member_id", memberId)
    .eq("id", taskId);

  if (error) {
    redirect(membersMessage(targetPath, error.message));
  }

  revalidatePath("/dashboard/front-desk");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/revenue");
  revalidatePath(targetPath);
  redirect(membersMessage(targetPath, "Follow-up task completed."));
}
