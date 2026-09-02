/**
 * PlanHistory — every optimisation run, newest first.
 *
 * History is a record of what the planner actually produced: date, inventory,
 * storage type, EarnRoom AI score, estimated fit, packing complexity and the
 * recommendation that followed. Estimates, never guarantees.
 */
import { History } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/States";
import type { PlanRun } from "@/lib/spaceplanner/library";
import { formatDate } from "@/lib/spaceplanner/library";

export interface PlanHistoryProps {
  runs: PlanRun[];
  /** Show only the runs for one inventory. */
  inventoryId?: string;
  limit?: number;
  className?: string;
}

export function PlanHistory({ runs, inventoryId, limit = 10, className }: PlanHistoryProps) {
  const rows = runs
    .filter((run) => (inventoryId ? run.inventoryId === inventoryId : true))
    .slice(0, limit);

  return (
    <section className={cn("", className)} aria-labelledby="plan-history-heading">
      <div className="flex items-center gap-2">
        <History className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="plan-history-heading" className="type-h3 text-base">
          Plan history
        </h2>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-3"
          title="No runs yet"
          description="Every time EarnRoom AI plans a space, the result is recorded here."
        />
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead className="type-label text-muted-foreground">
              <tr className="border-b border-border">
                <Th>Date</Th>
                <Th>Inventory</Th>
                <Th>Storage</Th>
                <Th>EarnRoom AI</Th>
                <Th>Fit</Th>
                <Th>Packing</Th>
                <Th>Recommendation</Th>
              </tr>
            </thead>
            <tbody className="type-body-sm">
              {rows.map((run) => (
                <tr key={run.id} className="border-b border-border last:border-0">
                  <Td>{formatDate(run.ranAt)}</Td>
                  <Td>{run.inventoryName}</Td>
                  <Td>{run.spaceName}</Td>
                  <Td>
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 type-label text-xs text-primary-soft-foreground">
                      {run.score}
                    </span>
                  </Td>
                  <Td>{run.fitPercent}%</Td>
                  <Td>{run.complexity}</Td>
                  <Td className="text-muted-foreground">{run.recommendation}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2.5 font-medium">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("whitespace-nowrap px-3 py-2.5", className)}>{children}</td>;
}
