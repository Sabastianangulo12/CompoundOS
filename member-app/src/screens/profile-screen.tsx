import { Text, View } from "react-native";
import { Card, InfoRow, ScreenScroll, SectionTitle, SecondaryButton } from "../components/ui";
import type { MemberAppContext, MemberStats } from "../lib/member";
import type { MemberNotification } from "../lib/notifications";
import { colors } from "../theme";

function formatStatus(status: MemberAppContext["member"]["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ProfileScreen({
  context,
  stats,
  notifications,
  pushStatusMessage,
  onSignOut
}: {
  context: MemberAppContext;
  stats: MemberStats;
  notifications: MemberNotification[];
  pushStatusMessage: string | null;
  onSignOut: () => void;
}) {
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
              ? new Date(context.member.joined_at).toLocaleDateString("en-US", {
                  dateStyle: "medium"
                })
              : "Not set"
          }
        />
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
          Basic stats
        </Text>
        <InfoRow label="Current streak" value={`${stats.streak} days`} emphasis />
        <InfoRow label="Total visits" value={String(stats.totalVisits)} />
        <InfoRow
          label="Last check-in"
          value={
            stats.lastCheckInAt
              ? new Date(stats.lastCheckInAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: context.gym?.timezone
                })
              : "No check-ins yet"
          }
        />
      </Card>

      <Card>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>
          Notifications
        </Text>
        {pushStatusMessage ? (
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            {pushStatusMessage}
          </Text>
        ) : null}
        {notifications.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 14 }}>
            No notifications yet.
          </Text>
        ) : (
          notifications.map((notification) => (
            <View
              key={notification.id}
              style={{
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panelElevated,
                padding: 14,
                gap: 8
              }}
            >
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>
                {notification.title}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
                {notification.body}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {new Date(notification.created_at).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: context.gym?.timezone
                })}{" "}
                | {notification.type}
              </Text>
            </View>
          ))
        )}
      </Card>

      <SecondaryButton label="Sign out" onPress={onSignOut} />
    </ScreenScroll>
  );
}
