import type { ReactNode } from "react";
import { TabBar } from "@/components/TabBar";

// Экраны с нижней навигацией: Чаты, Тренировки, Рейтинг, Профиль.
export default function TabsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <TabBar />
    </div>
  );
}
