const MEMBER_QR_PREFIX = "tclc-member";

export function buildMemberQrValue(memberId: string, gymId?: string | null) {
  const normalizedMemberId = memberId.trim();
  const normalizedGymId = gymId?.trim();

  if (!normalizedGymId) {
    return `${MEMBER_QR_PREFIX}:${normalizedMemberId}`;
  }

  return `${MEMBER_QR_PREFIX}:${normalizedGymId}:${normalizedMemberId}`;
}

export function parseMemberQrValue(rawValue: string) {
  const value = rawValue.trim();

  if (!value) {
    return null;
  }

  if (!value.startsWith(`${MEMBER_QR_PREFIX}:`)) {
    return {
      memberId: value,
      gymId: null,
      format: "legacy" as const
    };
  }

  const parts = value.split(":");

  if (parts.length === 2) {
    return {
      memberId: parts[1] ?? "",
      gymId: null,
      format: "structured" as const
    };
  }

  if (parts.length >= 3) {
    return {
      memberId: parts[2] ?? "",
      gymId: parts[1] ?? null,
      format: "structured" as const
    };
  }

  return null;
}
