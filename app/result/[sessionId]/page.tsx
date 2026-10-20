import { PlaceholderPage } from "@/components/PlaceholderPage";
import { t } from "@/lib/i18n";

export default async function ResultPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <PlaceholderPage
      title={t("screens.result")}
      phase={8}
      detail={t("common.idLabel", { id: sessionId })}
    />
  );
}
