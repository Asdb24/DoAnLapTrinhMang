import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import type { ApiState } from '@/lib/api';
import type { ConversationMetadata, ChannelMetadata, ProfileRow, SettingsRow } from '@/types/database';
import type { Conversation, UserSettings } from '@/types';

export function check<T>(result: {data:T|null;error:{message:string}|null}): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data as NonNullable<T>;
}
export function avatarUrl(value: string) {
  if (!value.startsWith('avatar:')) return /^https:\/\//.test(value) ? value : '';
  const [id, version] = value.slice(7).split('/');
  return `/api/avatars/${encodeURIComponent(id)}?v=${encodeURIComponent(version || '')}`;
}
export function mapConversation(row: ConversationMetadata, userId: string): Conversation {
  const other = row.members.find(member => member.user_id !== userId)?.profile;
  return { id:row.id, name:row.type==='direct' ? other?.display_name || 'Deleted user' : row.type==='saved' ? 'Saved messages' : row.title,
    type:row.type==='group'?'group':'direct', avatar:other ? avatarUrl(other.avatar_url):'', presence:other?.presence,
    lastMessage:row.last_message_preview, lastMessageTime:row.last_message_at ? new Date(row.last_message_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'',
    unreadCount:row.unread_count, messages:[], description:row.description, membersCount:row.members.length,isMuted:row.muted };
}
export async function loadWorkspace(user: User): Promise<{state:ApiState;metadata:ConversationMetadata[]}> {
  const client=getSupabase();
  const [conversations,channels,profiles,preferences,blocked]=await Promise.all([
    client.rpc('list_conversations'),client.rpc('list_channels'),client.from('profiles').select('*').order('display_name').limit(1000),
    client.from('user_settings').select('*').eq('user_id',user.id).single(),client.from('blocked_users').select('*').eq('user_id',user.id),
  ]);
  const metadata=check(conversations) as unknown as ConversationMetadata[];
  const channelRows=check(channels) as unknown as ChannelMetadata[];
  const people=check(profiles) as ProfileRow[];
  const own=people.find(profile=>profile.id===user.id) || check(await client.from('profiles').select('*').eq('id',user.id).single());
  const prefs=check(preferences) as SettingsRow;
  if(!own || !prefs) throw new Error('Your profile is not ready. Please retry.');
  return {metadata,state:{currentUser:{id:user.id,email:user.email||''},migrationCompleted:true,
    conversations:metadata.map(row=>mapConversation(row,user.id)),
    channels:channelRows.map(row=>({id:row.id,name:row.name,description:row.description,category:row.category||'General',isPrivate:row.is_private,isJoined:row.is_joined,isOwner:row.is_owner,subscriberCount:row.subscriber_count})),
    contacts:people.filter(profile=>profile.id!==user.id).map(profile=>({id:profile.id,name:profile.display_name,role:profile.role,email:profile.username ? `@${profile.username}`:'',presence:profile.presence,avatar:avatarUrl(profile.avatar_url),bio:profile.bio,customStatus:profile.status_message,conversationId:metadata.find(row=>row.type==='direct'&&row.members.some(m=>m.user_id===profile.id))?.id})),
    settings:{theme:prefs.theme,density:prefs.density,enterToSend:prefs.enter_to_send,desktopNotifications:prefs.desktop_notifications,soundNotifications:prefs.sound_notifications,displayName:own.display_name,statusMessage:own.status_message,avatar:avatarUrl(own.avatar_url),email:user.email||'',role:own.role,presence:own.presence},
    blockedUsers:check(blocked).map(row=>{const profile=people.find(p=>p.id===row.blocked_id);return {id:row.blocked_id,name:profile?.display_name||'Deleted user',handle:profile?.username||'',avatar:avatarUrl(profile?.avatar_url||''),blockedDate:row.created_at};}),
  }};
}
export async function saveSettings(settings:Partial<UserSettings>) {
  const {email: _email,...values}=settings;
  // A displayed proxy URL is not a new avatar value.
  if(values.avatar?.startsWith('/api/avatars/')) delete values.avatar;
  check(await getSupabase().rpc('update_my_settings',{settings:values}));
}
