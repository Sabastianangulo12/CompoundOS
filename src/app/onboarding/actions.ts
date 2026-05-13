"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveGymMembership } from "@/lib/gym-users";

function withMessage(message: string) {
  return `/onboarding/create-gym?message=${encodeURIComponent(message)}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function createGymAction(formData: FormData) {
  const gymName = String(formData.get("gymName") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const slug = slugify(slugInput);

  if (!gymName || !slugInput) {
    redirect(withMessage("Gym name and slug are required."));
  }

  if (!slug) {
    redirect(withMessage("Choose a slug with letters or numbers."));
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const membership = await getActiveGymMembership(supabase, user.id);

  if (membership.error) {
    redirect(withMessage(membership.error.message));
  }

  if (membership.data) {
    redirect("/dashboard");
  }

  const { error: createGymError } = await supabase.rpc(
    "create_gym_with_owner_membership",
    {
      gym_name: gymName,
      gym_slug: slug
    }
  );

  if (createGymError) {
    const message =
      createGymError.code === "23505"
        ? "That slug is already taken."
        : createGymError.message;
    redirect(withMessage(message));
  }

  redirect("/dashboard");
}
