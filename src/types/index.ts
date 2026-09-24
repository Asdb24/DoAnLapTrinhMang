export type PresenceStatus = "online" | "away" | "offline";

export interface MessageReaction {
  emoji: string;
  count: number;
  reactedByMe?: boolean;
}

export interface MessageAttachment {
  id?: string;
  name: string;
  size: string;
  type: "image" | "doc" | "pdf";
  url?: string;
}

export interface MessageType {
  media?: import('./media').ChatMedia | null;
  createdAt?: string;
  clientMessageId?: string;
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  timestamp: string;
  date: string;
  isSentByMe: boolean;
  status?: "sending" | "failed" | "sent" | "delivered" | "read";
  reactions?: MessageReaction[];
  attachments?: MessageAttachment[];
}

export interface SharedMediaItem {
  id: string;
  name: string;
  type: "image" | "file" | "link";
  size?: string;
  url?: string;
  date: string;
}

export interface Conversation {
  isArchived?: boolean;
  isMuted?: boolean;
  id: string;
  name: string;
  type: "direct" | "group";
  avatar?: string;
  presence?: PresenceStatus;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: MessageType[];
  description?: string;
  membersCount?: number;
  sharedMedia?: SharedMediaItem[];
}

export interface Channel {
  isOwner?: boolean;
  id: string;
  name: string;
  description: string;
  category: "Engineering" | "Design" | "Product" | "General" | "Random";
  isPrivate: boolean;
  subscriberCount: number;
  isJoined: boolean;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  email: string;
  presence: PresenceStatus;
  avatar: string;
  bio: string;
  customStatus?: string;
  conversationId?: string;
}

export interface BlockedUser {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  blockedDate: string;
}

export interface UserSettings {
  theme: "light" | "dark";
  density: "cozy" | "compact";
  enterToSend: boolean;
  desktopNotifications: boolean;
  soundNotifications: boolean;
  displayName: string;
  statusMessage: string;
  avatar: string;
  email: string;
  role: string;
  presence?: PresenceStatus;
}
