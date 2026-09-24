import { ChatListSidebar } from "@/components/chat/ChatListSidebar";
import { ChatRoom } from "@/components/chat/ChatRoom";

interface ChatPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { id } = await params;

  return (
    <div className="flex-1 flex h-full min-w-0 overflow-hidden">
      {/* Secondary Sidebar: Active & Recent Chats */}
      <ChatListSidebar />

      {/* Active Conversation Room with Message History, Input Bar & Right Sidebar */}
      <ChatRoom id={id} />
    </div>
  );
}
