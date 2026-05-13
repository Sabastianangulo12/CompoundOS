"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { getMemberByIdForGym } from "@/lib/members";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function checkInsMessage(message: string, memberSearch?: string) {
  const params = new URLSearchParams();

  if (memberSearch) {
    params.set("memberSearch", memberSearch);
  }

  params.set("message", message);

  return `/dashboard/check-ins?${params.toString()}`;
}

function checkInScanMessage(message: string, qrValue?: string) {
  const params = new URLSearchParams();

  if (qrValue) {
    params.set("qrValue", qrValue);
  }

  params.set("message", message);

  return `/dashboard/check-ins/scan?${params.toString()}`;
}

export async function createManualCheckInAction(formData: FormData) {
  const memberId = String(formData.get("memberId") ?? "").trim();
  const memberSearch = String(formData.get("memberSearch") ?? "").trim();
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
    redirect(checkInsMessage("Select a member to check in.", memberSearch));
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    redirect(
      checkInsMessage(
        existingMember.error?.message ?? "Member not found for this gym.",
        memberSearch
      )
    );
  }

  const { error } = await supabase.from("check_ins").insert({
    gym_id: currentGym.data.membership.gymId,
    member_id: memberId,
    check_in_method: "manual"
  });

  if (error) {
    redirect(checkInsMessage(error.message, memberSearch));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/check-ins");
  revalidatePath(`/dashboard/members/${memberId}/edit`);
  redirect(checkInsMessage("Check-in recorded.", memberSearch));
}

export async function createQrCheckInAction(formData: FormData) {
  const qrValue = String(formData.get("qrValue") ?? "").trim();
  const memberId = qrValue;
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
    redirect(checkInScanMessage("Enter a member QR value to record a check-in.", qrValue));
  }

  const existingMember = await getMemberByIdForGym(
    supabase,
    currentGym.data.membership.gymId,
    memberId
  );

  if (existingMember.error || !existingMember.data) {
    redirect(
      checkInScanMessage(
        existingMember.error?.message ?? "Scanned member was not found for this gym.",
        qrValue
      )
    );
  }

  const { error } = await supabase.from("check_ins").insert({
    gym_id: currentGym.data.membership.gymId,
    member_id: memberId,
    check_in_method: "qr"
  });

  if (error) {
    redirect(checkInScanMessage(error.message, qrValue));
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/check-ins");
  revalidatePath("/dashboard/check-ins/scan");
  revalidatePath(`/dashboard/members/${memberId}/edit`);
  redirect(checkInScanMessage("QR check-in recorded.", memberId));
}
