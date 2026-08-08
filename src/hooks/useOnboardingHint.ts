import * as React from "react";

import {
  ONBOARDING_HINTS,
  dismissHint,
  readDismissedHints,
  type OnboardingHintId,
} from "@/lib/onboarding/hints";

/**
 * Returns whether a first-time hint should be shown, plus its copy.
 *
 * Reads storage after mount so server render and hydration always agree, and
 * so a returning user never sees a flash of guidance they already dismissed.
 */
export function useOnboardingHint(id: OnboardingHintId) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    setVisible(!readDismissedHints().includes(id));
  }, [id]);

  const dismiss = React.useCallback(() => {
    dismissHint(id);
    setVisible(false);
  }, [id]);

  return { visible, dismiss, copy: ONBOARDING_HINTS[id] };
}
