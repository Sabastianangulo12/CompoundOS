const MEMBER_QR_PREFIX = "tclc-member";

export function buildMemberQrValue(memberId: string, gymId?: string | null) {
  const normalizedMemberId = memberId.trim();
  const normalizedGymId = gymId?.trim();

  if (!normalizedGymId) {
    return `${MEMBER_QR_PREFIX}:${normalizedMemberId}`;
  }

  return `${MEMBER_QR_PREFIX}:${normalizedGymId}:${normalizedMemberId}`;
}
