import { Suspense } from "react";
import { OnboardingScreen } from "@/components/onboarding/OnboardingScreen";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-white" />}>
      <OnboardingScreen />
    </Suspense>
  );
}
