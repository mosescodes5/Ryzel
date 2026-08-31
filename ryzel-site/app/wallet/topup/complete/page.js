"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import * as api from "@/lib/api";

function formatNgn(amount) {
  return `₦${Number(amount).toLocaleString("en-NG")}`;
}

// Korapay credits the wallet server-side via webhook the moment payment
// clears — this page never does the crediting itself. It only polls
// /payments/korapay/status/:reference to find out whether that's finished
// yet, so if the webhook is slow (or misconfigured) this will say so
// instead of falsely claiming success.
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15; // ~30s

function TopupCompleteInner() {
  const params = useSearchParams();
  const reference = params.get("reference");

  const [state, setState] = useState("checking"); // checking | success | failed | timeout | no-reference
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    if (!reference) {
      setState("no-reference");
      return;
    }

    let cancelled = false;
    let attempts = 0;

    async function poll() {
      attempts += 1;

      try {
        const res = await api.getPaymentStatus(reference);

        if (cancelled) return;

        if (res.status === "success") {
          const { wallet_balance_ngn } = await api.getBalance();
          if (!cancelled) {
            setBalance(wallet_balance_ngn);
            setState("success");
          }
          return;
        }

        if (res.status === "failed") {
          setState("failed");
          return;
        }
      } catch {
        // Keep polling — a transient error here shouldn't flip to "failed".
      }

      if (attempts >= MAX_POLLS) {
        if (!cancelled) setState("timeout");
        return;
      }

      if (!cancelled) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();

    return () => {
      cancelled = true;
    };
  }, [reference]);

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <Card className="w-full max-w-[420px] text-center">
        {state === "checking" && (
          <>
            <h1 className="text-[1.2rem] mb-2">Confirming your payment…</h1>
            <p className="text-ink-soft mb-5">
              This usually takes a few seconds. Don&apos;t close this page.
            </p>
          </>
        )}

        {state === "success" && (
          <>
            <h1 className="text-[1.2rem] mb-2">Wallet funded ✅</h1>
            <p className="text-ink-soft mb-1">Your new balance is</p>
            <p className="text-[1.6rem] font-mono mb-5">
              {balance === null ? "—" : formatNgn(balance)}
            </p>
            <Button as={Link} href="/dashboard" variant="green">
              Back to dashboard
            </Button>
          </>
        )}

        {state === "failed" && (
          <>
            <h1 className="text-[1.2rem] mb-2">Payment didn&apos;t go through</h1>
            <p className="text-ink-soft mb-5">
              Nothing was charged to your wallet. You can try again from the
              dashboard.
            </p>
            <Button as={Link} href="/dashboard">
              Back to dashboard
            </Button>
          </>
        )}

        {state === "timeout" && (
          <>
            <h1 className="text-[1.2rem] mb-2">Still processing</h1>
            <p className="text-ink-soft mb-5">
              Your payment is taking longer than usual to confirm. If money
              left your account, it will still be credited shortly — check
              your wallet balance on the dashboard in a minute.
            </p>
            <Button as={Link} href="/dashboard">
              Back to dashboard
            </Button>
          </>
        )}

        {state === "no-reference" && (
          <>
            <h1 className="text-[1.2rem] mb-2">Missing payment reference</h1>
            <p className="text-ink-soft mb-5">
              We couldn&apos;t tell which payment this was. If you completed
              checkout, your wallet should update shortly — check the
              dashboard.
            </p>
            <Button as={Link} href="/dashboard">
              Back to dashboard
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

export default function TopupCompletePage() {
  return (
    <Suspense fallback={null}>
      <TopupCompleteInner />
    </Suspense>
  );
}