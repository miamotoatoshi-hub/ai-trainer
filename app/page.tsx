import { redirect } from "next/navigation";

// Главный экран приложения — список тренеров.
// Позже (Фаза 7) новых пользователей отсюда будем отправлять на /onboarding.
export default function Home() {
  redirect("/chats");
}
