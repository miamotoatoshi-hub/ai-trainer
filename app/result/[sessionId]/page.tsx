import { ResultScreen } from "@/components/result/ResultScreen";

export default async function ResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <ResultScreen sessionId={sessionId} />;
}
