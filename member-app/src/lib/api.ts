import { Platform } from "react-native";

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL ?? "";

function isLoopbackHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeApiBaseUrl(value: string) {
  return value.replace(/\/$/, "");
}

export function getApiBaseUrl() {
  if (configuredApiUrl) {
    try {
      const parsed = new URL(configuredApiUrl);

      if (
        Platform.OS === "web" &&
        typeof window !== "undefined" &&
        window.location?.hostname
      ) {
        const browserProtocol = window.location.protocol || parsed.protocol || "http:";
        const browserHostname = window.location.hostname;
        const configuredPort =
          parsed.port || (parsed.protocol === "https:" ? "443" : "80");

        if (isLoopbackHost(browserHostname) && !isLoopbackHost(parsed.hostname)) {
          return normalizeApiBaseUrl(
            `${browserProtocol}//${browserHostname}:${configuredPort}${parsed.pathname}`
          );
        }
      }

      return normalizeApiBaseUrl(configuredApiUrl);
    } catch {
      return normalizeApiBaseUrl(configuredApiUrl);
    }
  }

  if (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location?.hostname
  ) {
    const protocol = window.location.protocol || "http:";
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3000`;
  }

  throw new Error("EXPO_PUBLIC_API_URL is not configured.");
}
