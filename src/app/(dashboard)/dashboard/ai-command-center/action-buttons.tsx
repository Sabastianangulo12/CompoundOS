"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { InsightWithMember } from "@/lib/ai-insights";

type ActionResult = {
  message: string;
  ok: boolean;
};

async function postAICommandCenterAction(path: string, payload: Record<string, unknown> = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  let response: Response;

  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof DOMException && error.name === "AbortError"
          ? "Analysis took too long. Please try again; the button is ready."
          : "Request failed."
    } satisfies ActionResult;
  } finally {
    window.clearTimeout(timeoutId);
  }

  const result = (await response.json().catch(() => ({
    message: "Request failed.",
    ok: false
  }))) as ActionResult;

  if (!response.ok) {
    return {
      ok: false,
      message: result.message || "Request failed."
    } satisfies ActionResult;
  }

  return result;
}

export function RunAnalysisButton() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isBusy = isRunning || isRefreshing;

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        className="inline-flex h-12 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-black disabled:cursor-wait disabled:opacity-70"
        disabled={isBusy}
        onClick={() => {
          if (isRunning) {
            return;
          }

          setIsRunning(true);
          setMessage("Running analysis...");
          void (async () => {
            const result = await postAICommandCenterAction("/api/ops/ai-command-center/run-analysis");
            setMessage(result.message);
            if (result.ok) {
              startTransition(() => {
                router.refresh();
              });
            }
            setIsRunning(false);
          })();
        }}
        type="button"
      >
        {isBusy ? "Running analysis..." : "Run analysis"}
      </button>
      {message ? <p className="text-xs text-muted">{message}</p> : null}
    </div>
  );
}

export function AIInsightCard({
  createdAtLabel,
  highPriorityTaskCount,
  insight,
  insightLabel,
  openTaskCount,
  priorityClassName
}: {
  createdAtLabel: string;
  highPriorityTaskCount: number;
  insight: InsightWithMember;
  insightLabel: string;
  openTaskCount: number;
  priorityClassName: string;
}) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (isDismissed) {
    return null;
  }

  return (
    <article className={["panel flex flex-col gap-4 p-5", priorityClassName].join(" ")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted">
            {insightLabel}
          </p>
          <h3 className="mt-2 text-lg font-semibold">{insight.title}</h3>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            className="rounded-xl border border-border px-3 py-2 text-sm text-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60"
            disabled={isPending}
            onClick={() => {
              setIsDismissed(true);
              setIsPending(true);
              void (async () => {
                const result = await postAICommandCenterAction(
                  "/api/ops/ai-command-center/dismiss",
                  {
                    insightId: insight.id
                  }
                );
                if (!result.ok) {
                  setIsDismissed(false);
                  setMessage(result.message);
                } else {
                  setMessage(null);
                }
                setIsPending(false);
              })();
            }}
            type="button"
          >
            {isPending ? "Dismissing..." : "Dismiss"}
          </button>
          {message ? <p className="text-xs text-rose-300">{message}</p> : null}
        </div>
      </div>
      <p className="text-sm text-muted">{insight.description}</p>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
          {openTaskCount} open task{openTaskCount === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
          {highPriorityTaskCount} priority task{highPriorityTaskCount === 1 ? "" : "s"}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">
          {createdAtLabel}
        </span>
      </div>
      <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">
            {insight.members
              ? `${insight.members.first_name} ${insight.members.last_name}`
              : "Gym-level insight"}
          </p>
          <p className="mt-1 text-sm text-muted">
            {insight.members?.email ?? "No member email on file"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {insight.member_id ? (
            <Link
              className="text-sm font-medium text-foreground"
              href={`/dashboard/members/${insight.member_id}/edit`}
            >
              Open member
            </Link>
          ) : null}
          {insight.member_id && openTaskCount === 0 ? (
            <span className="text-sm text-muted">No open task yet</span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
