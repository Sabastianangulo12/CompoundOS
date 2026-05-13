export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  expoPushAccessToken: process.env.EXPO_PUSH_ACCESS_TOKEN ?? "",
  openAIApiKey: process.env.OPENAI_API_KEY ?? "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? ""
};

export function hasSupabaseEnv() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function hasStripeServerEnv() {
  return Boolean(env.stripeSecretKey && env.appUrl);
}

export function getMissingEnvVars(names: string[]) {
  return names.filter((name) => {
    const value = process.env[name];
    return !value || !value.trim();
  });
}

export function assertEnv(names: string[], label = "Environment") {
  const missing = getMissingEnvVars(names);

  if (missing.length > 0) {
    throw new Error(`${label} is missing required variables: ${missing.join(", ")}.`);
  }
}
