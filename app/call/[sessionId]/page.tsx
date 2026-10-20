import { Suspense } from "react";
import { CallScreen } from "@/components/call/CallScreen";

export default async function CallPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <Suspense fallback={<div className="flex-1 bg-ink" />}>
      <CallScreen sessionId={sessionId} />
    </Suspense>
  );
}
