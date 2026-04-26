"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function TakeActions({ takeId }: { takeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  async function decide(action: "approve" | "reject") {
    setBusy(action);
    try {
      const r = await fetch(`/api/takes/${takeId}/${action}`, { method: "POST" });
      if (!r.ok) {
        const text = await r.text().catch(() => `HTTP ${r.status}`);
        alert(`${action === "approve" ? "Approve" : "Send back"} failed: ${text}`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        className="btn-primary"
        onClick={() => decide("approve")}
        disabled={busy !== null}
      >
        {busy === "approve" ? "Approving…" : "Approve master"}
      </button>
      <button
        className="btn-secondary"
        onClick={() => decide("reject")}
        disabled={busy !== null}
      >
        {busy === "reject" ? "Rejecting…" : "Send back"}
      </button>
    </>
  );
}
