import { ChatListSidebar } from "@/components/chat/ChatListSidebar";
import { WelcomeView } from "@/components/chat/WelcomeView";

export default function HomePage() {
  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      {/* Secondary Sidebar: Recent Conversations List */}
      <ChatListSidebar />

      {/* Main Area: Welcome Placeholder Screen */}
      <WelcomeView />
    </div>
  );
}
