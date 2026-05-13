import { Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Card, ScreenScroll, SectionTitle } from "../components/ui";
import type { MemberAppContext } from "../lib/member";
import { colors } from "../theme";

export function QRScreen({ context }: { context: MemberAppContext }) {
  return (
    <ScreenScroll>
      <SectionTitle
        title="Member QR"
        subtitle="Present this at the front desk for a fast member lookup."
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
            <QRCode size={220} value={context.member.id} />
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
