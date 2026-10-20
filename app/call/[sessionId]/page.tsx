import { PlaceholderPage } from "@/components/PlaceholderPage";
import { t } from "@/lib/i18n";

export default async function CallPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return (
    <PlaceholderPage
      title={t("screens.call")}
      phase={2}
      detail={t("common.idLabel", { id: sessionId })}
    />
  );
}
