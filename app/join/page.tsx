import { Suspense } from "react";
import { JoinScreen } from "@/components/social/JoinScreen";

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-white" />}>
      <JoinScreen />
    </Suspense>
  );
}
