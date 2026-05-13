import { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";

export function ScreenSurface({ children }: { children: ReactNode }) {
  return <View style={styles.surface}>{children}</View>;
}

export function ScreenScroll({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        style={styles.surface}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.authContainer}>
        <View style={styles.heroBlock}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.card}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function SectionTitle({
  title,
  subtitle
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  autoCapitalize = "none",
  keyboardType = "default",
  multiline = false
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?:
    | "default"
    | "email-address"
    | "numeric"
    | "phone-pad"
    | "url";
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        style={[styles.input, multiline ? styles.inputMultiline : null]}
        textAlignVertical={multiline ? "top" : "center"}
        value={value}
      />
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null
      ]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function StatTile({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

export function InfoRow({
  label,
  value,
  emphasis
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, emphasis ? styles.infoValueEmphasis : null]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    backgroundColor: colors.background
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  },
  scrollContent: {
    padding: spacing.page,
    gap: spacing.section
  },
  authContainer: {
    flex: 1,
    padding: spacing.page,
    justifyContent: "center",
    gap: 24,
    backgroundColor: colors.background
  },
  heroBlock: {
    gap: 8
  },
  eyebrow: {
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 2.2,
    fontSize: 12,
    fontWeight: "600"
  },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: 20,
    gap: 16
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "700"
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500"
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelElevated,
    color: colors.text,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15
  },
  inputMultiline: {
    minHeight: 108
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: colors.accent,
    minHeight: 54,
    paddingHorizontal: 18
  },
  primaryButtonText: {
    color: "#121212",
    fontWeight: "700",
    fontSize: 15
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 54,
    paddingHorizontal: 18
  },
  secondaryButtonText: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 15
  },
  buttonDisabled: {
    opacity: 0.55
  },
  buttonPressed: {
    opacity: 0.85
  },
  statTile: {
    flex: 1,
    minHeight: 112,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelElevated,
    padding: 16,
    justifyContent: "space-between"
  },
  statLabel: {
    color: colors.muted,
    fontSize: 13
  },
  statValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "700"
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  infoLabel: {
    color: colors.muted,
    fontSize: 14
  },
  infoValue: {
    color: colors.text,
    fontSize: 15,
    textAlign: "right",
    flexShrink: 1
  },
  infoValueEmphasis: {
    color: colors.accent,
    fontWeight: "600"
  }
});
