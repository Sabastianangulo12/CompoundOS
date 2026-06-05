import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedMemberFromToken } from "@/lib/member-auth";
import { getActiveFridgeProducts } from "@/lib/fridge-wallet";

export async function GET(request: NextRequest) {
  const token = request.headers
    .get("authorization")
    ?.replace("Bearer ", "")
    .trim();

  if (!token) {
    return NextResponse.json(
      { error: "Missing authorization token." },
      { status: 401 }
    );
  }

  try {
    const { admin, member } = await getAuthenticatedMemberFromToken(token);
    const products = await getActiveFridgeProducts(admin, member.gym_id);
    return NextResponse.json(products);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Wallet products could not be loaded."
      },
      { status: 400 }
    );
  }
}
