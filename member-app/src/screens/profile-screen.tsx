import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import {
  Card,
  InfoRow,
  PrimaryButton,
  ScreenScroll,
  SectionTitle,
  SecondaryButton,
  TextField
} from "../components/ui";
import {
  cancelMembership,
  fetchMemberBillingSummary,
  freezeMembership,
  openBillingCardSetup,
  renewMembership,
  type MemberBillingSummary
} from "../lib/billing";
import { formatDateTime, formatMediumDate } from "../lib/format";
import type { MemberAppContext } from "../lib/member";
import type { MemberNotification } from "../lib/notifications";
import { colors } from "../theme";

function formatStatus(status: MemberAppContext["member"]["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ProfileScreen({
  context,
  dailyStepGoal,
  notifications,
  onUpdateDailyStepGoal,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  pushStatusMessage,
  onSignOut
}: {
  context: MemberAppContext;
  dailyStepGoal: number;
  notifications: MemberNotification[];
  onUpdateDailyStepGoal: (nextGoal: number) => Promise<void>;
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
  onMarkAllNotificationsRead: () => Promise<void>;
  pushStatusMessage: string | null;
  onSignOut: () => void;
}) {
  const [stepGoalInput, setStepGoalInput] = useState(String(dailyStepGoal));
  const [billing, setBilling] = useState<MemberBillingSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [billingPending, setBillingPending] = useState(false);
  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;
  const planAssignmentMessage =
    "Your gym controls plan assignment from the owner dashboard. If this is wrong, ask staff to update your membership plan there.";

  useEffect(() => {
    setStepGoalInput(String(dailyStepGoal));
  }, [dailyStepGoal]);

  useEffect(() => {
    void loadBilling();
  }, [context.member.id]);

  async function loadBilling() {
    setBillingLoading(true);
    const result = await fetchMemberBillingSummary();

    if (result.error || !result.data) {
      setBilling(null);
      setBillingMessage(result.error?.message ?? "Billing information could not be loaded.");
      setBillingLoading(false);
      return;
    }

    setBilling(result.data);
    setBillingMessage(null);
    setBillingLoading(false);
  }

  async function handleManageCard() {
    setBillingPending(true);
    const result = await openBillingCardSetup();
    setBillingPending(false);

    if (result.error) {
      Alert.alert("Card update failed", result.error.message);
      return;
    }

    setBillingMessage("Stripe card setup opened in your browser. Return here after saving.");
  }

  async function handleFreeze(weeks: number) {
    setBillingPending(true);
    const result = await freezeMembership(weeks);
    setBillingPending(false);

    if (result.error) {
      Alert.alert("Freeze failed", result.error.message);
      return;
    }

    await loadBilling();
    setBillingMessage(`Membership frozen until ${formatDate(result.data?.frozenUntil ?? null)}.`);
  }

  function handleFreezePrompt() {
    Alert.alert(
      "Freeze account",
      "You can freeze your account for 4 weeks until account is canceled.",
      [
        {
          text: "Not now",
          style: "cancel"
        },
        {
          text: "Continue",
          onPress: () => {
            void handleFreeze(4);
          }
        }
      ]
    );
  }

  async function handleRenewMembership() {
    setBillingPending(true);
    const result = await renewMembership();
    setBillingPending(false);

    if (result.error) {
      Alert.alert("Renewal failed", result.error.message);
      return;
    }

    await loadBilling();
    setBillingMessage("Your membership is active again.");
  }

  async function handleCancelMembership() {
    Alert.alert(
      "Cancel membership",
      "Canceling will revoke your access to the member app because you will no longer be an active member.",
      [
        {
          text: "Keep membership",
          style: "cancel"
        },
        {
          text: "Cancel membership",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBillingPending(true);
              const result = await cancelMembership();
              setBillingPending(false);

              if (result.error) {
                Alert.alert("Cancellation failed", result.error.message);
                return;
              }

              Alert.alert(
                "Membership canceled",
                "Your membership has been canceled and app access has been revoked."
              );
              onSignOut();
            })();
          }
        }
      ]
    );
  }

  const hasAssignedPlan = Boolean(billing?.membershipPlanName);
  const gymBillingReady = billing?.gymBillingReady ?? false;
  const canManageBilling = hasAssignedPlan;
  const canManageCard = hasAssignedPlan && gymBillingReady;

  return (
    <ScreenScroll>
      <SectionTitle
        title={`${context.member.first_name} ${context.member.last_name}`}
        subtitle={context.gym?.name ?? "Member profile"}
      />

      <Card>
        <InfoRow label="Status" value={formatStatus(context.member.status)} emphasis />
        <InfoRow label="Email" value={context.member.email ?? "No email"} />
        <InfoRow label="Phone" value={context.member.phone ?? "No phone"} />
        <InfoRow
          label="Joined"
          value={
            context.member.joined_at
              ? formatMediumDate(context.member.joined_at)
              : "Not set"
          }
        />
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
          Payment information
        </Text>
        {billingLoading ? (
          <Text style={{ color: colors.muted, fontSize: 14 }}>Loading billing information...</Text>
        ) : billing ? (
          <>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
              Cards can be added or updated here, but membership plans are assigned by staff from
              the dashboard.
            </Text>
            <InfoRow
              label="Membership status"
              value={formatStatus(billing.membershipStatus)}
              emphasis
            />
            <InfoRow
              label="Plan"
              value={billing.membershipPlanName ?? "No active membership plan"}
            />
            <InfoRow
              label="Billing cycle"
              value={formatBillingCycle(billing.billingCycle, billing.currentPeriodEnd)}
            />
            <InfoRow
              label="Card on file"
              value={
                billing.hasCardOnFile
                  ? `${formatCardBrand(billing.cardBrand)} ending in ${billing.cardLast4 ?? "----"}`
                  : "No card saved"
              }
            />
            {!hasAssignedPlan ? (
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                {planAssignmentMessage} Card updates, freezes, and cancellations stay limited
                until a plan is assigned.
              </Text>
            ) : null}
            {hasAssignedPlan && !gymBillingReady ? (
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                {billing.gymBillingMessage ??
                  "Gym billing is not ready yet. Ask staff to finish Stripe setup before adding a card."}
              </Text>
            ) : null}
            {billing.frozenUntil ? (
              <InfoRow label="Frozen until" value={formatDate(billing.frozenUntil)} />
            ) : null}
            <PrimaryButton
              label={
                billingPending
                  ? "Opening secure card setup..."
                  : billing.hasCardOnFile
                    ? "Update card on file"
                    : "Add card on file"
              }
              onPress={() => {
                void handleManageCard();
              }}
              disabled={billingPending || !canManageCard}
            />
            <View style={{ gap: 10 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                Freeze account
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                Pause your membership for up to 4 weeks before cancellation.
              </Text>
              <SecondaryButton
                label={billingPending ? "Freezing account..." : "Freeze account"}
                onPress={handleFreezePrompt}
                disabled={billingPending || !canManageBilling}
              />
            </View>
            <SecondaryButton
              label={billingPending ? "Updating membership..." : "Cancel membership"}
              onPress={() => {
                void handleCancelMembership();
              }}
              disabled={billingPending || !canManageBilling}
            />
            {billing.membershipStatus === "frozen" ? (
              <View style={{ gap: 10 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }}>
                  Renew membership
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
                  Resume your membership before the freeze window ends and cancellation begins.
                </Text>
                <PrimaryButton
                  label={billingPending ? "Renewing membership..." : "Renew membership"}
                  onPress={() => {
                    void handleRenewMembership();
                  }}
                  disabled={billingPending || !hasAssignedPlan}
                />
              </View>
            ) : null}
          </>
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {billingMessage ?? "Billing information is unavailable right now."}
            </Text>
            <SecondaryButton
              label={billingLoading ? "Refreshing billing..." : "Retry billing"}
              onPress={() => {
                void loadBilling();
              }}
              disabled={billingLoading}
            />
          </View>
        )}
        {billingMessage ? (
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            {billingMessage}
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
          Settings
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
          Set your daily step goal so your Home streak tracks goal days instead of visit days.
        </Text>
        <TextField
          keyboardType="numeric"
          label="Daily step goal"
          onChangeText={setStepGoalInput}
          placeholder="8000"
          value={stepGoalInput}
        />
        <PrimaryButton
          label="Save step goal"
          onPress={() => {
            void onUpdateDailyStepGoal(Number(stepGoalInput || "0"));
          }}
        />
      </Card>

      <Card>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12
          }}
        >
          <View style={{ gap: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
              Notifications
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {unreadNotifications} unread
            </Text>
          </View>
          {notifications.length > 0 ? (
            <SecondaryButton
              label="Mark all read"
              onPress={() => {
                void onMarkAllNotificationsRead();
              }}
            />
          ) : null}
        </View>
        {pushStatusMessage ? (
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            {pushStatusMessage}
          </Text>
        ) : null}
        {notifications.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 14 }}>No notifications yet.</Text>
        ) : (
          notifications.map((notification) => (
            <View
              key={notification.id}
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: notification.read_at ? colors.panelElevated : colors.panel,
                padding: 14,
                gap: 8
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12
                }}
              >
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600", flex: 1 }}>
                  {notification.title}
                </Text>
                {!notification.read_at ? (
                  <SecondaryButton
                    label="Mark read"
                    onPress={() => {
                      void onMarkNotificationRead(notification.id);
                    }}
                  />
                ) : null}
              </View>
              <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
                {notification.body}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {formatDateTime(notification.created_at)}{" "}
                | {notification.type}
                {notification.read_at ? " | read" : " | unread"}
              </Text>
            </View>
          ))
        )}
      </Card>

      <SecondaryButton label="Sign out" onPress={onSignOut} />
    </ScreenScroll>
  );
}

function formatDate(value: string | null) {
  return formatMediumDate(value);
}

function formatBillingCycle(
  cycle: MemberBillingSummary["billingCycle"],
  currentPeriodEnd: string | null
) {
  if (!cycle) {
    return "Not available";
  }

  const cycleLabel = cycle === "monthly" ? "Monthly" : "Weekly";

  if (!currentPeriodEnd) {
    return cycleLabel;
  }

  return `${cycleLabel} - renews ${formatDate(currentPeriodEnd)}`;
}

function formatCardBrand(brand: string | null) {
  if (!brand) {
    return "Card";
  }

  return brand.charAt(0).toUpperCase() + brand.slice(1);
}
