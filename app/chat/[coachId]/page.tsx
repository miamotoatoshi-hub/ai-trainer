import { PlaceholderPage } from "@/components/PlaceholderPage";
import { t } from "@/lib/i18n";

export default async function ChatPage({ params }: { params: Promise<{ coachId: string }> }) {
  const { coachId } = await params;
  return (
    <PlaceholderPage
      title={t("screens.chat")}
      phase={1}
      detail={t("common.idLabel", { id: coachId })}
    />
  );
}
