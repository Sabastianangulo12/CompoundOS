"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { upsertProfileForUser } from "@/lib/auth/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function withMessage(pathname: string, message: string) {
  return `${pathname}?message=${encodeURIComponent(message)}`;
}

async function getOrigin() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");

  if (origin) {
    return origin;
  }

  const host = headerStore.get("host");

  if (host) {
    const protocol = host.includes("localhost") ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return "http://localhost:3000";
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(withMessage("/login", "Email and password are required."));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(withMessage("/login", error.message));
  }

  redirect("/dashboard");
}

export async function signupAction(formData: FormData) {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const gymName = String(formData.get("gymName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !gymName || !email || !password) {
    redirect(
      withMessage(
        "/signup",
        "Full name, gym name, email, and password are required."
      )
    );
  }

  const supabase = await createSupabaseServerClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
      data: {
        full_name: fullName,
        gym_name: gymName
      }
    }
  });

  if (error) {
    redirect(withMessage("/signup", error.message));
  }

  if (data.user && data.session) {
    const { error: profileError } = await upsertProfileForUser(supabase, data.user);

    if (profileError) {
      redirect(withMessage("/signup", profileError.message));
    }

    redirect("/dashboard");
  }

  redirect(
    withMessage(
      "/login",
      "Check your email to confirm your account, then sign in."
    )
  );
}

