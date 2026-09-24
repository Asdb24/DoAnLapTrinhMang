/** Supabase public schema contract. JSON RPC payloads are described below. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type ProfileRow = { id:string; username:string|null; display_name:string; avatar_url:string; bio:string; status_message:string; role:string; presence:'online'|'away'|'offline'; created_at:string; updated_at:string };
export type SettingsRow = { user_id:string; theme:'light'|'dark'; density:'cozy'|'compact'; enter_to_send:boolean; desktop_notifications:boolean; sound_notifications:boolean };
export type ConversationRow = { id:string; type:'direct'|'group'|'saved'; title:string; description:string; created_by:string|null; created_at:string; updated_at:string; last_message_at:string|null; last_message_id:string|null; last_message_preview:string; category:'Engineering'|'Design'|'Product'|'General'|'Random'|null; is_private:boolean; direct_key:string|null };
export type MemberRow = { conversation_id:string; user_id:string; role:'owner'|'admin'|'member'; joined_at:string; last_read_at:string|null; last_read_message_id:string|null; cleared_at:string|null; muted:boolean };
export type MessageRow = { id:string; conversation_id:string; sender_id:string|null; content:string; message_type:'text'|'image'|'file'|'system'|'gif'|'sticker'; media:import('./media').ChatMedia|null; reply_to_id:string|null; client_message_id:string; created_at:string; updated_at:string; deleted_at:string|null };
export type AttachmentRow = { id:string; message_id:string|null; conversation_id:string; uploader_id:string|null; storage_path:string; file_name:string; mime_type:string; file_size:number; created_at:string };
export type ReactionRow = { message_id:string; user_id:string; emoji:string; created_at:string };
export type BlockedRow = { user_id:string; blocked_id:string; created_at:string };
/** list_conversations() contains metadata only. Fetch messages with (created_at,id) cursor ordering. */
export type ConversationMetadata = ConversationRow & Pick<MemberRow,'muted'|'last_read_at'|'last_read_message_id'|'cleared_at'> & { unread_count:number; members:(Pick<MemberRow,'user_id'|'role'|'joined_at'|'last_read_at'|'last_read_message_id'|'cleared_at'|'muted'> & {profile:ProfileRow})[] };
export type ChannelMetadata = { id:string; name:string; description:string; category:ConversationRow['category']; is_private:boolean; is_joined:boolean; is_owner:boolean; subscriber_count:number };
export type SettingsInput = {theme?:SettingsRow['theme'];density?:SettingsRow['density'];enterToSend?:boolean;desktopNotifications?:boolean;soundNotifications?:boolean;displayName?:string;statusMessage?:string;avatar?:string;presence?:ProfileRow['presence'];role?:string};

export type { Database } from './database.generated';

