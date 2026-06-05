"use client";

import { useEffect } from "react";

function isIgnorableEventReason(reason: unknown) {
  if (!reason) {
    return false;
  }

  if (typeof Event !== "undefined" && reason instanceof Event) {
    return true;
  }

  if (
    typeof reason === "object" &&
    reason !== null &&
    "message" in reason &&
    String((reason as { message?: unknown }).message) === "[object Event]"
  ) {
    return true;
  }

  return false;
}

export function DashboardRuntimeGuard() {
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isIgnorableEventReason(event.reason)) {
        return;
      }

      event.preventDefault();
      console.warn(
        "Suppressed non-actionable dashboard rejection triggered by a browser event object.",
        event.reason
      );
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
