import { describe, expect, it } from "vitest";

import {
  awaitingViewer,
  caseCategoryForIssue,
  evidenceFileProblem,
  isCaseLive,
  participantVisibleMessages,
  poundsInputToPence,
  refundAmountProblem,
  remainingRefundablePence,
  stageForHandoverStage,
  statusHelpText,
  statusLabel,
  type SupportCase,
  type SupportCaseMessage,
} from "@/lib/support-cases";

const kase = (over: Partial<SupportCase> = {}) =>
  ({
    id: "c1",
    status: "open",
    opened_by_user_id: "renter-1",
    ...over,
  }) as SupportCase;

describe("support case status wording", () => {
  it("reads from each side's point of view", () => {
    expect(statusLabel("waiting_for_reporter", true)).toBe("Waiting for you");
    expect(statusLabel("waiting_for_reporter", false)).toBe("Waiting for the other person");
    expect(statusLabel("closed", true)).toBe("Resolved");
  });

  it("only asks the right person to respond", () => {
    const waiting = kase({ status: "waiting_for_reporter" });
    expect(awaitingViewer(waiting, "renter-1")).toBe(true);
    expect(awaitingViewer(waiting, "host-1")).toBe(false);
    expect(awaitingViewer(waiting, null)).toBe(false);
  });

  it("never tells a participant a resolved case is still live", () => {
    expect(isCaseLive("resolved")).toBe(false);
    expect(isCaseLive("under_review")).toBe(true);
    expect(statusHelpText(kase({ status: "resolved" }), "renter-1")).toContain("resolved");
  });
});

describe("internal notes stay internal", () => {
  it("filters internal messages out of the participant view", () => {
    const messages = [
      { id: "m1", visibility: "participants", body: "hello" },
      { id: "m2", visibility: "internal", body: "staff only" },
    ] as SupportCaseMessage[];
    const visible = participantVisibleMessages(messages);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.id).toBe("m1");
  });
});

describe("refund guards", () => {
  it("never allows more than the remaining amount", () => {
    expect(remainingRefundablePence(10_000, 4_000)).toBe(6_000);
    expect(remainingRefundablePence(10_000, 12_000)).toBe(0);
    expect(refundAmountProblem(7_000, 6_000)).toBeTruthy();
    expect(refundAmountProblem(6_000, 6_000)).toBeNull();
    expect(refundAmountProblem(0, 6_000)).toBeTruthy();
    expect(refundAmountProblem(null, 6_000)).toBeTruthy();
  });

  it("parses pounds input into whole pence", () => {
    expect(poundsInputToPence("12.34")).toBe(1234);
    expect(poundsInputToPence("£12")).toBe(1200);
    expect(poundsInputToPence("abc")).toBeNull();
  });
});

describe("handover issue escalation", () => {
  it("maps a Prompt 15 issue onto a case category and stage", () => {
    expect(caseCategoryForIssue("condition_concern")).toBeTruthy();
    expect(stageForHandoverStage("check_in")).toBe("checkin");
    expect(stageForHandoverStage("check_out")).toBe("checkout");
  });
});

describe("evidence validation", () => {
  it("rejects non-images and oversized files", () => {
    expect(evidenceFileProblem({ type: "application/pdf", size: 100 })).toBeTruthy();
    expect(evidenceFileProblem({ type: "image/jpeg", size: 20 * 1024 * 1024 })).toBeTruthy();
    expect(evidenceFileProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
  });
});
