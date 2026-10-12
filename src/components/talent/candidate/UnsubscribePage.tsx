"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { publicPost } from "@/lib/talent";
import { Card, CardContent } from "@/components/ui/card";
import { CandidateFrame, LinkProblem } from "./CandidateFrame";

/**
 * One tap: opening the link unsubscribes. It runs from the browser (not on
 * the server's GET), so mail scanners that prefetch links don't unsubscribe
 * people by accident.
 */
export default function UnsubscribePage({ token }: { token: string }) {
  const [state, setState] = useState<"working" | "done" | "gone">("working");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    publicPost(`/unsubscribe/${encodeURIComponent(token)}`, {})
      .then(() => setState("done"))
      .catch(() => setState("gone"));
  }, [token]);

  if (state === "gone") return <LinkProblem />;
  return (
    <CandidateFrame>
      <Card>
        <CardContent className="text-center">
          {state === "working" ? (
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" aria-label="Unsubscribing" />
          ) : (
            <>
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
              <h1 className="mt-3 text-lg font-semibold">You're unsubscribed</h1>
              <p className="mt-2 text-sm text-gray-600">
                We've stopped all messages to you, starting now. Messages already on their way may still arrive in the
                next few minutes. To see or delete the data we hold, use the &ldquo;your data&rdquo; link in any of our emails.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </CandidateFrame>
  );
}
