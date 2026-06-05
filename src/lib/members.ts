import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { Database } from "@/types/database";

export const memberStatuses = [
  "lead",
  "active",
  "frozen",
  "canceled"
] as const;

export type MemberStatus = (typeof memberStatuses)[number];

export function isMemberStatus(value: string): value is MemberStatus {
  return memberStatuses.includes(value as MemberStatus);
}

export function normalizeMemberSearch(value: string | undefined) {
  return value?.trim() ?? "";
}

export async function getMemberByIdForGym(
  supabase: AppSupabaseClient,
  gymId: string,
  memberId: string
) {
  return supabase
    .from("members")
    .select("*")
    .eq("gym_id", gymId)
    .eq("id", memberId)
    .maybeSingle();
}
