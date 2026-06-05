import { NextResponse } from "next/server";
import { buildGymAccessMessage, getCurrentGymContext } from "@/lib/gym-users";
import { formatCurrencyFromCents } from "@/lib/revenue";
import { toOneRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function escapeCsv(value: unknown) {
  const text = String(value ?? "");

  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function csvRow(values: unknown[]) {
  return values.map(escapeCsv).join(",");
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const currentGym = await getCurrentGymContext(supabase);

  if (!currentGym.data) {
    return NextResponse.json(
      {
        error:
          currentGym.error?.message ?? buildGymAccessMessage()
      },
      {
        status: 401
      }
    );
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 30);
  const fromIso = from ? new Date(from).toISOString() : defaultFrom.toISOString();
  const toIso = to ? new Date(to).toISOString() : now.toISOString();

  const { data, error } = await supabase
    .from("payments")
    .select(
      `
        *,
        members (
          id,
          first_name,
          last_name,
          email
        )
      `
    )
    .eq("gym_id", currentGym.data.membership.gymId)
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json(
      {
        error: error.message
      },
      {
        status: 500
      }
    );
  }

  const header = [
    "payment_id",
    "created_at",
    "paid_at",
    "due_at",
    "member_name",
    "member_email",
    "status",
    "payment_type",
    "accounting_category",
    "amount",
    "late_fee",
    "tax",
    "discount",
    "refunded_amount",
    "payment_method",
    "invoice_number",
    "stripe_invoice_id",
    "stripe_payment_intent_id",
    "stripe_refund_id",
    "manual_note",
    "description"
  ];
  const rows = (data ?? []).map((payment) => {
    const member = toOneRelation(payment.members);
    const memberName = member ? `${member.first_name} ${member.last_name}` : "";

    return csvRow([
      payment.id,
      payment.created_at,
      payment.paid_at,
      payment.due_at,
      memberName,
      member?.email ?? "",
      payment.status,
      payment.payment_type,
      payment.accounting_category,
      formatCurrencyFromCents(payment.amount_cents),
      formatCurrencyFromCents(payment.late_fee_cents),
      formatCurrencyFromCents(payment.tax_cents),
      formatCurrencyFromCents(payment.discount_cents),
      formatCurrencyFromCents(payment.refunded_amount_cents),
      payment.payment_method_label,
      payment.invoice_number,
      payment.stripe_invoice_id,
      payment.stripe_payment_intent_id,
      payment.stripe_refund_id,
      payment.manual_payment_note,
      payment.description
    ]);
  });

  const csv = [csvRow(header), ...rows].join("\r\n");
  const filename = `billing-accounting-${currentGym.data.membership.gymSlug}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
