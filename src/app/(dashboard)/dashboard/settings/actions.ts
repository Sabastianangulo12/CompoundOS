"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { memberSignupDefaultsTag } from "@/lib/member-intake";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedRoles = ["owner", "manager", "coach", "staff"] as const;

function settingsMessage(message: string) {
  return `/dashboard/settings?message=${encodeURIComponent(message)}`;
}

function canManageStaff(role: string) {
  return role === "owner";
}

export async function updateGymProfileAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const defaultWaiverTitle = String(formData.get("defaultWaiverTitle") ?? "").trim();
  const defaultWaiverBody = String(formData.get("defaultWaiverBody") ?? "").trim();
  const requireWaiverOnSignup = String(formData.get("requireWaiverOnSignup") ?? "") === "true";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!name || !slug || !timezone) {
    redirect(settingsMessage("Gym name, slug, and timezone are required."));
  }

  if (requireWaiverOnSignup && (!defaultWaiverTitle || !defaultWaiverBody)) {
    redirect(settingsMessage("Add a waiver title and waiver text before requiring waivers on signup."));
  }

  const { error } = await supabase
    .from("gyms")
    .update({
      name,
      slug,
      timezone,
      default_waiver_title: defaultWaiverTitle || null,
      default_waiver_body: defaultWaiverBody || null,
      require_waiver_on_signup: requireWaiverOnSignup
    })
    .eq("id", currentGym.data.membership.gymId);

  if (error) {
    redirect(settingsMessage(error.message));
  }

  revalidateTag(memberSignupDefaultsTag(currentGym.data.membership.gymId));
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  redirect(settingsMessage("Gym settings updated."));
}

export async function updateGymStaffMembershipAction(formData: FormData) {
  const gymUserId = String(formData.get("gymUserId") ?? "").trim();
  const nextRole = String(formData.get("role") ?? "").trim();
  const nextActive = String(formData.get("isActive") ?? "").trim() === "true";
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!canManageStaff(currentGym.data.membership.role)) {
    redirect(settingsMessage("Only gym owners can manage staff access."));
  }

  if (!gymUserId || !allowedRoles.includes(nextRole as (typeof allowedRoles)[number])) {
    redirect(settingsMessage("Staff role update is invalid."));
  }

  const gymUserResult = await supabase
    .from("gym_users")
    .select("id, user_id, role, is_active")
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", gymUserId)
    .maybeSingle();

  if (gymUserResult.error || !gymUserResult.data) {
    redirect(settingsMessage(gymUserResult.error?.message ?? "Staff membership not found."));
  }

  if (gymUserResult.data.user_id === currentGym.data.user.id && !nextActive) {
    redirect(settingsMessage("You cannot deactivate your own owner access."));
  }

  const ownerCountResult = await supabase
    .from("gym_users")
    .select("id", { count: "exact", head: true })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("role", "owner")
    .eq("is_active", true);

  if (ownerCountResult.error) {
    redirect(settingsMessage(ownerCountResult.error.message));
  }

  const lastActiveOwner =
    gymUserResult.data.role === "owner" &&
    (ownerCountResult.count ?? 0) <= 1 &&
    (!nextActive || nextRole !== "owner");

  if (lastActiveOwner) {
    redirect(settingsMessage("The gym must keep at least one active owner."));
  }

  const { error } = await supabase
    .from("gym_users")
    .update({
      role: nextRole as (typeof allowedRoles)[number],
      is_active: nextActive
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", gymUserId);

  if (error) {
    redirect(settingsMessage(error.message));
  }

  revalidatePath("/dashboard/settings");
  redirect(settingsMessage("Staff access updated."));
}

export async function addGymStaffMembershipByEmailAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!canManageStaff(currentGym.data.membership.role)) {
    redirect(settingsMessage("Only gym owners can add staff access."));
  }

  if (!email || !allowedRoles.includes(role as (typeof allowedRoles)[number])) {
    redirect(settingsMessage("Staff email or role is invalid."));
  }

  const profileResult = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("email", email)
    .maybeSingle();

  if (profileResult.error) {
    redirect(settingsMessage(profileResult.error.message));
  }

  if (!profileResult.data) {
    redirect(
      settingsMessage(
        "No existing user profile matches that email yet. Ask them to create an account first."
      )
    );
  }

  const existingMembershipResult = await supabase
    .from("gym_users")
    .select("id")
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("user_id", profileResult.data.id)
    .maybeSingle();

  if (existingMembershipResult.error) {
    redirect(settingsMessage(existingMembershipResult.error.message));
  }

  if (existingMembershipResult.data) {
    const { error } = await supabase
      .from("gym_users")
      .update({
        role: role as (typeof allowedRoles)[number],
        is_active: true
      })
      .eq("gym_id", currentGym.data.membership.gymId)
      .eq("id", existingMembershipResult.data.id);

    if (error) {
      redirect(settingsMessage(error.message));
    }

    revalidatePath("/dashboard/settings");
    redirect(settingsMessage("Existing staff access was reactivated and updated."));
  }

  const { error } = await supabase.from("gym_users").insert({
    gym_id: currentGym.data.membership.gymId,
    user_id: profileResult.data.id,
    role: role as (typeof allowedRoles)[number],
    is_active: true
  });

  if (error) {
    redirect(settingsMessage(error.message));
  }

  revalidatePath("/dashboard/settings");
  redirect(settingsMessage("Staff access added."));
}
