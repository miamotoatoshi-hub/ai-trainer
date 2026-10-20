import { notFound } from "next/navigation";
import { ChatScreen } from "@/components/chat/ChatScreen";
import { isCoachId } from "@/lib/coach/coaches";

export default async function ChatPage({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = await params;
  if (!isCoachId(coachId)) notFound();
  return <ChatScreen coachId={coachId} />;
}
