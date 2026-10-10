export type TriageResult = {
  customerMessage: string;
  triage: {
    model: string;
    department: {
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    };
    frustration: {
      score: number;
      confidence: number;
      legend: Record<string, string>;
      probabilities: Record<string, number>;
    };
    isUrgent: number;
  };
  route: {
    kind: "person" | "auto_reply";
    reason: string;
    policy: {
      urgencyThreshold: number;
      frustrationThreshold: number;
      overPromiseThreshold: number;
    };
  };
  generated: {
    model: string;
    kind: "handoff_note" | "customer_reply";
    label: string;
    text: string;
  };
  overPromiseCheck: {
    model: string;
    probability: number;
    heldForReview: boolean;
  } | null;
};

export type Samples = {
  stripe: string;
  billingA: string;
  billingB: string;
};

export async function fetchSamples(): Promise<Samples> {
  const response = await fetch("/api/samples");
  if (!response.ok) {
    throw new Error(`Could not load samples (${response.status})`);
  }
  return (await response.json()) as Samples;
}

export async function runTriage(
  message: string,
  options?: { signal?: AbortSignal },
): Promise<TriageResult> {
  const response = await fetch("/api/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal: options?.signal,
  });

  let body: (TriageResult & { error?: string }) | null = null;
  try {
    body = (await response.json()) as TriageResult & { error?: string };
  } catch {
    throw new Error(
      `Triage failed (${response.status}). The API returned a non-JSON body.`,
    );
  }

  if (!response.ok) {
    throw new Error(body.error ?? `Triage failed (${response.status})`);
  }
  return body;
}
