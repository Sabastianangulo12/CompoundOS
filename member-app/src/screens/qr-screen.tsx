import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Card, ScreenScroll, SectionTitle } from "../components/ui";
import type { MemberAppContext } from "../lib/member";
import { buildMemberQrValue } from "../lib/member-qr";
import { colors } from "../theme";

export function QRScreen({ context }: { context: MemberAppContext }) {
  const memberQrValue = buildMemberQrValue(context.member.id, context.gym?.id);

  return (
    <ScreenScroll>
      <SectionTitle
        title="Member QR"
        subtitle="Show this at the front desk so staff can scan you in."
      />

      <Card>
        <View style={{ alignItems: "center", gap: 20 }}>
          <View
            style={{
              borderRadius: 28,
              backgroundColor: "#ffffff",
              padding: 20
            }}
          >
            <QRCode size={220} value={memberQrValue} />
          </View>
          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
              {context.member.first_name} {context.member.last_name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {context.gym?.name ?? "The Compound"}
            </Text>
          </View>
        </View>
      </Card>
    </ScreenScroll>
  );
}
