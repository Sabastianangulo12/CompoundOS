import { useState } from "react";
import { Text, View } from "react-native";
import {
  AuthShell,
  PrimaryButton,
  SecondaryButton,
  TextField
} from "../components/ui";
import { colors } from "../theme";

export function SignupScreen({
  pending,
  message,
  onSignup,
  onSwitchToLogin
}: {
  pending: boolean;
  message: string | null;
  onSignup: (fullName: string, email: string, password: string) => void;
  onSwitchToLogin: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthShell
      eyebrow="Join the club"
      title="Create your member login"
      subtitle="Use the same email your gym has on file so we can connect you to the right membership."
    >
      <TextField
        autoCapitalize="words"
        label="Full name"
        onChangeText={setFullName}
        placeholder="Jordan Smith"
        value={fullName}
      />
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
        placeholder="Create a password"
        secureTextEntry
        value={password}
      />
      {message ? (
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
          {message}
        </Text>
      ) : null}
      <PrimaryButton
        disabled={pending || !fullName || !email || !password}
        label={pending ? "Creating..." : "Sign up"}
        onPress={() => onSignup(fullName.trim(), email.trim().toLowerCase(), password)}
      />
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>
          Already have an account?
        </Text>
        <SecondaryButton label="Back to login" onPress={onSwitchToLogin} />
      </View>
    </AuthShell>
  );
}
