/**
 * React Query wiring for host payouts and earnings.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useAuth } from "@/hooks/useAuth";
import { getHostPayoutAccount, listHostEarnings } from "@/lib/host-earnings-api";
import { refreshHostPayoutStatus, startHostPayoutOnboarding } from "@/lib/connect.functions";

export const payoutKeys = {
  account: (hostId: string) => ["host", "payout-account", hostId] as const,
  earnings: (hostId: string) => ["host", "earnings", hostId] as const,
};

export function useHostPayoutAccount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: payoutKeys.account(user?.id ?? "none"),
    queryFn: () => getHostPayoutAccount(user!.id),
    enabled: Boolean(user),
  });
}

export function useHostEarnings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: payoutKeys.earnings(user?.id ?? "none"),
    queryFn: () => listHostEarnings(user!.id),
    enabled: Boolean(user),
  });
}

/** Server creates/reuses the connected account and returns the Stripe URL. */
export function useStartPayoutOnboarding() {
  const start = useServerFn(startHostPayoutOnboarding);
  return useMutation({ mutationFn: () => start() });
}

/** Asks the server to re-read the account from Stripe. */
export function useRefreshPayoutStatus() {
  const refresh = useServerFn(refreshHostPayoutStatus);
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: () => refresh(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payoutKeys.account(user?.id ?? "none") });
      void qc.invalidateQueries({ queryKey: payoutKeys.earnings(user?.id ?? "none") });
    },
  });
}
