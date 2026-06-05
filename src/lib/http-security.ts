import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/$/, "");
}

function getConfiguredOrigins() {
  const configured = [
    env.appUrl,
    process.env.MEMBER_WEB_ORIGIN ?? "",
    "http://localhost:3000",
    "http://localhost:3100",
    "http://localhost:19007",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3100",
    "http://127.0.0.1:19007"
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizeOrigin);

  return new Set(configured);
}

export function assertTrustedBrowserOrigin(request: NextRequest) {
  const origin = request.headers.get("origin")?.trim();

  if (!origin) {
    return;
  }

  const normalizedOrigin = normalizeOrigin(origin);

  if (!getConfiguredOrigins().has(normalizedOrigin)) {
    throw new Error(`Origin ${normalizedOrigin} is not allowed for this request.`);
  }
}

export function extractBearerToken(request: NextRequest) {
  return request.headers.get("authorization")?.replace("Bearer ", "").trim() ?? "";
}

export function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function parsePositiveInteger(value: unknown, fallback?: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    if (typeof fallback === "number") {
      return fallback;
    }

    throw new Error("A positive whole number is required.");
  }

  return parsed;
}

export function parseBoundedString(
  value: unknown,
  options: {
    label: string;
    minLength?: number;
    maxLength: number;
  }
) {
  const normalized = String(value ?? "").trim();
  const minLength = options.minLength ?? 1;

  if (normalized.length < minLength) {
    throw new Error(`${options.label} is required.`);
  }

  if (normalized.length > options.maxLength) {
    throw new Error(`${options.label} is too long.`);
  }

  return normalized;
}

export type ParsedSelectedItem = {
  productId: string;
  quantity: number;
};

export function parseSelectedItems(
  value: unknown,
  options?: {
    maxItems?: number;
    maxQuantityPerItem?: number;
    maxTotalQuantity?: number;
  }
) {
  const maxItems = options?.maxItems ?? 25;
  const maxQuantityPerItem = options?.maxQuantityPerItem ?? 10;
  const maxTotalQuantity = options?.maxTotalQuantity ?? 50;

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Select at least one item.");
  }

  if (value.length > maxItems) {
    throw new Error(`A maximum of ${maxItems} items can be submitted at once.`);
  }

  const seen = new Set<string>();
  let totalQuantity = 0;

  const parsed = value.map((raw) => {
    const item = raw as { productId?: unknown; quantity?: unknown };
    const productId = String(item?.productId ?? "").trim();

    if (!productId) {
      throw new Error("Each selected item must include a product id.");
    }

    if (seen.has(productId)) {
      throw new Error("Duplicate products are not allowed in a single request.");
    }

    seen.add(productId);

    const quantity = parsePositiveInteger(item?.quantity);

    if (quantity > maxQuantityPerItem) {
      throw new Error(`Item quantity cannot exceed ${maxQuantityPerItem}.`);
    }

    totalQuantity += quantity;

    return {
      productId,
      quantity
    } satisfies ParsedSelectedItem;
  });

  if (totalQuantity > maxTotalQuantity) {
    throw new Error(`Total quantity cannot exceed ${maxTotalQuantity}.`);
  }

  return parsed;
}
