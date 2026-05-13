import { useState } from "react";
import { Text, View } from "react-native";
import {
  AuthShell,
  PrimaryButton,
  SecondaryButton,
  TextField
} from "../components/ui";
import { colors } from "../theme";

export function LoginScreen({
  pending,
  message,
  onLogin,
  onSwitchToSignup
}: {
  pending: boolean;
  message: string | null;
  onLogin: (email: string, password: string) => void;
  onSwitchToSignup: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthShell
      eyebrow="Member access"
      title="Welcome back"
      subtitle="Check in fast, view your stats, and keep your club profile close."
    >
      <TextField
        autoCapitalize="none"
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        placeholder="member@compoundclub.com"
        value={email}
      />
      <TextField
        label="Password"
        onChangeText={setPassword}
        placeholder="Your password"
        secureTextEntry
        value={password}
      />
      {message ? (
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
          {message}
        </Text>
      ) : null}
      <PrimaryButton
        disabled={pending || !email || !password}
        label={pending ? "Signing in..." : "Log in"}
        onPress={() => onLogin(email.trim().toLowerCase(), password)}
      />
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>
          New here?
        </Text>
        <SecondaryButton label="Create account" onPress={onSwitchToSignup} />
      </View>
    </AuthShell>
  );
}
