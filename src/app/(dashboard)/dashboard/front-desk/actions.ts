"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { unlockFridgeSession } from "@/lib/fridge-wallet";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function frontDeskMessage(message: string) {
  return `/dashboard/front-desk?message=${encodeURIComponent(message)}`;
}

export async function createFridgeProductAction(formData: FormData) {
  const category = String(formData.get("category") ?? "drinks_fridge").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priceInput = String(formData.get("price") ?? "").trim();
  const sortOrder = Number(formData.get("sortOrder") ?? 0);
  const priceCents = Math.round(Number(priceInput) * 100);
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!name) {
    redirect(frontDeskMessage("Add a product name before saving."));
  }

  if (!Number.isFinite(priceCents) || priceCents < 0) {
    redirect(frontDeskMessage("Enter a valid product price."));
  }

  if (
    !["drinks_fridge", "meal_prep_fridge", "protein_candy", "tclc_merch"].includes(
      category
    )
  ) {
    redirect(frontDeskMessage("Choose a valid fridge folder."));
  }

  const { error } = await supabase.from("fridge_products").insert({
    gym_id: currentGym.data.membership.gymId,
    category: category as
      | "drinks_fridge"
      | "meal_prep_fridge"
      | "protein_candy"
      | "tclc_merch",
    name,
    description: description || null,
    price_cents: priceCents,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0
  });

  if (error) {
    redirect(frontDeskMessage(error.message));
  }

  revalidatePath("/dashboard/front-desk");
  redirect(frontDeskMessage("Fridge product added."));
}

export async function archiveFridgeProductAction(formData: FormData) {
  const productId = String(formData.get("productId") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!productId) {
    redirect(frontDeskMessage("Product not found."));
  }

  const { error } = await supabase
    .from("fridge_products")
    .update({
      is_active: false
    })
    .eq("gym_id", currentGym.data.membership.gymId)
    .eq("id", productId);

  if (error) {
    redirect(frontDeskMessage(error.message));
  }

  revalidatePath("/dashboard/front-desk");
  redirect(frontDeskMessage("Product archived."));
}

export async function unlockFridgeSessionAction(formData: FormData) {
  const qrToken = String(formData.get("qrToken") ?? "").trim();
  const fridgeLabel = String(formData.get("fridgeLabel") ?? "").trim();
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    redirect(
      currentGym.error
        ? `/login?message=${encodeURIComponent(currentGym.error.message)}`
        : `/onboarding/create-gym?message=${encodeURIComponent(buildGymAccessMessage())}`
    );
  }

  if (!qrToken) {
    redirect(frontDeskMessage("Paste a payment QR token to continue."));
  }

  const sessionLookup = await supabase
    .from("fridge_unlock_sessions")
    .select("id, gym_id")
    .eq("qr_token", qrToken)
    .maybeSingle();

  if (sessionLookup.error || !sessionLookup.data) {
    redirect(frontDeskMessage(sessionLookup.error?.message ?? "Fridge session not found."));
  }

  if (sessionLookup.data.gym_id !== currentGym.data.membership.gymId) {
    redirect(frontDeskMessage("That fridge session does not belong to the current gym."));
  }

  const admin = createSupabaseAdminClient();

  try {
    await unlockFridgeSession({
      admin,
      qrToken,
      fridgeLabel: fridgeLabel || "Front Desk Checkout"
    });
  } catch (error) {
    redirect(
      frontDeskMessage(
        error instanceof Error ? error.message : "Fridge unlock could not be approved."
      )
    );
  }

  revalidatePath("/dashboard/front-desk");
  redirect(frontDeskMessage("Payment scan approved."));
}
