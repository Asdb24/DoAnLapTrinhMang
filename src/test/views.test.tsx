import React from 'react';
import { describe,it,expect,beforeEach,vi } from 'vitest';
import { act,render,screen,fireEvent,waitFor,within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatFlowProvider,useChatFlow } from '@/context/ChatFlowContext';
import { ChannelsView } from '@/components/channels/ChannelsView';
import { CreateChannelDialog } from '@/components/channels/CreateChannelDialog';
import { SettingsView } from '@/components/settings/SettingsView';
import { NewMessageDialog } from '@/components/dialogs/NewMessageDialog';
import { ChatListSidebar } from '@/components/chat/ChatListSidebar';
import { MessageInputBar } from '@/components/chat/MessageInputBar';
import { MessageItem } from '@/components/chat/MessageItem';
import { MessageHistory } from '@/components/chat/MessageHistory';
import { ChatRoom } from '@/components/chat/ChatRoom';
import { ChatRightSidebar } from '@/components/chat/ChatRightSidebar';
import { deferred,mockCloud } from './setup';
import ResetPasswordPage from '@/app/reset-password/page';
const {push}=vi.hoisted(()=>({push:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push}),useParams:()=>({id:'c1'}),usePathname:()=>'/'}));
beforeEach(()=>push.mockReset());
async function mount(children:React.ReactNode){await act(async()=>{render(<ChatFlowProvider>{children}</ChatFlowProvider>);});}
function OpenNewMessage(){const {setNewChatDialogOpen}=useChatFlow();return <><button onClick={()=>setNewChatDialogOpen(true)}>Open composer</button><NewMessageDialog/></>;}
function LiveDetails(){const {conversations}=useChatFlow();return <ChatRightSidebar conversation={conversations[0]} onClose={()=>{}}/>;}

describe('Supabase authentication',()=>{
 it('requests recovery at the canonical callback and gives a non-enumerating confirmation',async()=>{
  const server=mockCloud();server.authenticated=false;await mount(<div>Private</div>);
  fireEvent.change(screen.getByLabelText('Email'),{target:{value:'me@example.com'}});fireEvent.click(screen.getByRole('button',{name:'Forgot password?'}));
  await screen.findByText(/If an account exists/);expect(server.client.auth.resetPasswordForEmail).toHaveBeenCalledWith('me@example.com',{redirectTo:window.location.origin+'/auth/callback?type=recovery'});
 });
 it('validates matching reset passwords and waits for authoritative update confirmation',async()=>{
  const server=mockCloud();await mount(<ResetPasswordPage/>);
  fireEvent.change(screen.getByLabelText('New password'),{target:{value:'new-long-password'}});fireEvent.change(screen.getByLabelText('Confirm new password'),{target:{value:'different-password'}});fireEvent.click(screen.getByRole('button',{name:'Update password'}));await screen.findByText('The passwords do not match.');expect(server.client.auth.updateUser).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Confirm new password'),{target:{value:'new-long-password'}});fireEvent.click(screen.getByRole('button',{name:'Update password'}));await screen.findByText('Your password has been updated.');expect(server.client.auth.updateUser).toHaveBeenCalledWith({password:'new-long-password'});
 });
 it('gates the workspace, retains failed login credentials and retries through Supabase auth',async()=>{
  const server=mockCloud();server.authenticated=false;const pending=deferred<Awaited<ReturnType<typeof server.client.auth.signInWithPassword>>>();server.client.auth.signInWithPassword.mockReturnValueOnce(pending.promise);
  await mount(<div>Private workspace</div>);expect(screen.queryByText('Private workspace')).not.toBeInTheDocument();expect(screen.queryByText(/local demo/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Email'),{target:{value:'me@example.com'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'password-long'}});fireEvent.click(screen.getByRole('button',{name:'Continue to workspace'}));
  expect(screen.getByRole('button',{name:'Connecting…'})).toBeDisabled();
  await act(async()=>pending.resolve({data:{user:server.user,session:{user:server.user}},error:new Error('Incorrect password')}));
  expect(screen.getByRole('alert')).toHaveTextContent('Incorrect password');expect(screen.getByLabelText('Email')).toHaveValue('me@example.com');expect(screen.getByLabelText('Password')).toHaveValue('password-long');expect(screen.getByLabelText('Password')).toHaveFocus();
  fireEvent.click(screen.getByRole('button',{name:'Continue to workspace'}));await screen.findByText('Private workspace');expect(server.client.auth.signInWithPassword).toHaveBeenLastCalledWith({email:'me@example.com',password:'password-long'});
 });
 it('registers metadata and waits for email confirmation when no session is returned',async()=>{
  const server=mockCloud();server.authenticated=false;await mount(<div>Private workspace</div>);
  fireEvent.click(screen.getByRole('button',{name:'Create account'}));expect(screen.getByLabelText('Password')).toHaveAttribute('minlength','10');
  fireEvent.change(screen.getByLabelText('Display name'),{target:{value:'New Member'}});fireEvent.change(screen.getByLabelText('Email'),{target:{value:'new@example.com'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'password-long'}});fireEvent.click(screen.getByRole('button',{name:'Create your account'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Check your email');expect(screen.queryByText('Private workspace')).not.toBeInTheDocument();expect(server.client.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({email:'new@example.com',password:'password-long',options:{data:{display_name:'New Member'},emailRedirectTo:window.location.origin+'/auth/callback'}}));
 });
});

describe('Channels and navigation',()=>{
 it('renders fetched channels and filters search results',async()=>{
  mockCloud();await mount(<ChannelsView/>);expect(screen.getByText('announcements')).toBeInTheDocument();fireEvent.change(screen.getByPlaceholderText(/search channels by name/i),{target:{value:'design'}});expect(screen.getByText('design-systems')).toBeInTheDocument();expect(screen.queryByText('watercooler-chat')).not.toBeInTheDocument();
 });
 it('waits for membership confirmation and keeps the join button retryable on failure',async()=>{
  const server=mockCloud();const channel=server.state.channels.find(c=>!c.isJoined)!;server.state.channels=[channel];const pending=deferred<null>();server.handlers.set('set_channel_membership',()=>pending.promise);
  await mount(<ChannelsView/>);fireEvent.click(screen.getByRole('button',{name:/^Join$/}));expect(screen.getByRole('button',{name:/^Join$/})).toBeDisabled();await act(async()=>pending.reject(new Error('Join failed')));expect(await screen.findByText('Join failed')).toBeInTheDocument();expect(push).not.toHaveBeenCalled();
  server.handlers.delete('set_channel_membership');fireEvent.click(screen.getByRole('button',{name:/^Join$/}));await screen.findByRole('button',{name:/^Chat$/});fireEvent.click(screen.getByRole('button',{name:/^Chat$/}));await waitFor(()=>expect(push).toHaveBeenCalledWith('/chat/'+channel.id));
 });
 it('retains the channel draft on errors and closes only after the created channel is fetched',async()=>{
  const server=mockCloud(),close=vi.fn();server.handlers.set('create_channel',()=>{throw new Error('Name is taken');});await mount(<CreateChannelDialog open onOpenChange={close}/>);
  fireEvent.change(screen.getByLabelText('Channel Name'),{target:{value:'new-channel'}});fireEvent.change(screen.getByLabelText(/Description/),{target:{value:'Keep this draft'}});fireEvent.click(screen.getByRole('button',{name:'Create Channel'}));
  await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Name is taken'));expect(screen.getByLabelText('Channel Name')).toHaveValue('new-channel');expect(screen.getByLabelText(/Description/)).toHaveValue('Keep this draft');expect(close).not.toHaveBeenCalled();
  server.handlers.set('create_channel',()=>server.state.channels[0].id);fireEvent.click(screen.getByRole('button',{name:'Create Channel'}));await waitFor(()=>expect(close).toHaveBeenCalledWith(false));expect(server.client.rpc).toHaveBeenLastCalledWith('create_channel',expect.objectContaining({channel_name:'new-channel',channel_description:'Keep this draft'}));
 });
 it('keeps contact selection on failure and navigates only after a DM RPC returns its ID',async()=>{
  const server=mockCloud();server.handlers.set('get_or_create_direct_conversation',()=>{throw new Error('Contact unavailable');});await mount(<OpenNewMessage/>);
  fireEvent.click(screen.getByRole('button',{name:'Open composer'}));fireEvent.click(screen.getByText('Sarah Jenkins'));fireEvent.click(screen.getByRole('button',{name:'Start Chat'}));await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Contact unavailable'));expect(push).not.toHaveBeenCalled();
  server.handlers.set('get_or_create_direct_conversation',()=> 'real-direct');fireEvent.click(screen.getByRole('button',{name:'Start Chat'}));await waitFor(()=>expect(push).toHaveBeenCalledWith('/chat/real-direct'));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 });
 it('offers owner invitations and disables owner leave',async()=>{
  const server=mockCloud();server.state.channels=[{...server.state.channels[0],isOwner:true,isPrivate:true,isJoined:true}];await mount(<ChannelsView/>);expect(screen.getByRole('button',{name:'Leave'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'Invite'}));fireEvent.click(screen.getByRole('button',{name:'Invite Sarah Jenkins'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Invite Sarah Jenkins'})).toHaveTextContent('Added'));expect(server.client.rpc).toHaveBeenCalledWith('invite_channel_member',{target_conversation:server.state.channels[0].id,target_user:'contact-1'});
 });
});

describe('Settings and conversation views',()=>{
 it('retains profile drafts until save succeeds, and unblocks through an RPC',async()=>{
  const server=mockCloud();server.saveSettings.mockRejectedValueOnce(new Error('Profile save failed'));await mount(<SettingsView/>);fireEvent.change(screen.getByLabelText(/display name/i),{target:{value:'Taylor'}});fireEvent.click(screen.getByRole('button',{name:/save profile changes/i}));await screen.findByText('Profile save failed');expect(screen.getByLabelText(/display name/i)).toHaveValue('Taylor');expect(screen.queryByText(/profile updated successfully/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/save profile changes/i}));await screen.findByText(/profile updated successfully/i);fireEvent.click(screen.getByRole('button',{name:/chat customization/i}));expect(screen.getByText('Dark / Light Mode')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/notifications/i}));expect(screen.getByText('Notification Preferences')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/blocked users/i}));fireEvent.click(screen.getAllByRole('button',{name:/unblock/i})[0]);await waitFor(()=>expect(screen.queryByText('Spam Bot 4000')).not.toBeInTheDocument());
 });
 it('retains clear-history confirmation after failure and accurately describes its scope',async()=>{
  const server=mockCloud();server.handlers.set('clear_my_history',()=>{throw new Error('History unavailable');});await mount(<SettingsView/>);fireEvent.click(screen.getByRole('button',{name:/danger zone/i}));fireEvent.click(screen.getByRole('button',{name:/clear all chat history/i}));expect(screen.getByRole('dialog')).toHaveTextContent('Other participants retain their history');fireEvent.click(screen.getByRole('button',{name:'Confirm Clear'}));await waitFor(()=>expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('History unavailable'));server.handlers.delete('clear_my_history');fireEvent.click(screen.getByRole('button',{name:'Confirm Clear'}));await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
 });
 it('filters metadata by unread and groups without downloading message histories',async()=>{
  const server=mockCloud(),user=userEvent.setup();await mount(<ChatListSidebar/>);await user.click(screen.getByRole('tab',{name:/unread/i}));expect(screen.getByText('Sarah Jenkins')).toBeInTheDocument();expect(screen.queryByText('Marcus Chen')).not.toBeInTheDocument();await user.click(screen.getByRole('tab',{name:/groups/i}));expect(screen.getByText('Engineering Core Team')).toBeInTheDocument();expect(screen.queryByText('Sarah Jenkins')).not.toBeInTheDocument();expect(server.messagePage).not.toHaveBeenCalled();
 });
 it('preserves page order even when date section labels repeat',async()=>{
  const server=mockCloud(),conversation=server.state.conversations[0];conversation.messages=['Today','Today','Yesterday','Today'].map((date,index)=>({id:'ordered-'+index,senderId:'user-me',senderName:'Alex',isSentByMe:true,content:'Ordered message '+index,timestamp:'12:00',date}));await mount(<MessageHistory conversation={conversation}/>);expect(screen.getAllByText(/^Ordered message/).map(e=>e.textContent)).toEqual(['Ordered message 0','Ordered message 1','Ordered message 2','Ordered message 3']);expect(screen.getAllByText(/^(Today|Yesterday)$/).map(e=>e.textContent)).toEqual(['Today','Yesterday','Today']);
 });
 it('shows live connection status and keeps unavailable calls disabled',async()=>{
  const server=mockCloud();await mount(<ChatRoom id="c1"/>);await waitFor(()=>expect(server.conversations.has('c1')).toBe(true));await act(async()=>server.conversations.get('c1')!.status('SUBSCRIBED'));expect(await screen.findByText('Connected · Live messages')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Voice Call (unavailable)'})).toBeDisabled();expect(screen.getByRole('button',{name:'Video Call (unavailable)'})).toBeDisabled();
 });
 it('awaits mute persistence and displays authenticated attachment proxy URLs',async()=>{
  const server=mockCloud(),pending=deferred<null>();server.handlers.set('set_conversation_muted',()=>pending.promise);const m=server.state.conversations[0].messages[0];m.attachments=[{id:'file-id',name:'report.pdf',size:'1 KB',type:'pdf',url:'/api/attachments/file-id'}];await mount(<><LiveDetails/><MessageItem message={m} conversationId="c1"/></>);expect(screen.getByRole('link',{name:'Download report.pdf'})).toHaveAttribute('href','/api/attachments/file-id');fireEvent.click(screen.getByRole('button',{name:'Mute'}));expect(screen.getByRole('button',{name:'Mute'})).toBeDisabled();server.state.conversations[0].isMuted=true;await act(async()=>pending.resolve(null));expect(screen.getByRole('button',{name:'Muted'})).toHaveAttribute('aria-pressed','true');
 });
});

describe('Message drafts, attachment uploads and retries',()=>{
 it('inserts emoji at the cursor, preserves surrounding text and sends it as ordinary text',async()=>{
  const server=mockCloud();await mount(<MessageInputBar conversationId="c1" recipientName="Sarah"/>);
  const input=screen.getByRole('textbox') as HTMLTextAreaElement;fireEvent.change(input,{target:{value:'Hello world'}});input.setSelectionRange(6,6);fireEvent.select(input);
  fireEvent.click(screen.getByRole('button',{name:'Add Emoji'}));
  fireEvent.change(await screen.findByLabelText('Search emoji'),{target:{value:'heart eyes'}});fireEvent.click(await screen.findByRole('button',{name:/heart eyes love/}));expect(input).toHaveValue('Hello 😍world');
  fireEvent.click(screen.getByRole('button',{name:'Send Message'}));await waitFor(()=>expect(input).toHaveValue(''));
  expect(server.client.rpc).toHaveBeenCalledWith('send_message',expect.objectContaining({message_content:'Hello 😍world',used_emojis:['😍'],message_media:null}));
 });
 it('previews a sticker in the composer and sends its stable ID',async()=>{
  const server=mockCloud();await mount(<MessageInputBar conversationId="c1" recipientName="Sarah"/>);
  fireEvent.click(screen.getByRole('button',{name:'Add Sticker'}));fireEvent.click(await screen.findByRole('button',{name:'Big love'}));fireEvent.click(screen.getByRole('button',{name:'Use sticker'}));
  expect(screen.getByText('Ready to send sticker')).toBeInTheDocument();expect(server.client.rpc).not.toHaveBeenCalledWith('send_message',expect.anything());
  fireEvent.click(screen.getByRole('button',{name:'Send Message'}));await waitFor(()=>expect(screen.queryByText('Ready to send sticker')).not.toBeInTheDocument());
  expect(server.client.rpc).toHaveBeenCalledWith('send_message',expect.objectContaining({message_content:'',message_media:{kind:'sticker',id:'orb-v1-love'}}));
 });
 it('retains failed upload/send drafts, reuses completed uploads and retries the same client UUID',async()=>{
  const server=mockCloud(),user=userEvent.setup();server.uploadAttachment.mockRejectedValueOnce(new Error('Upload failed'));await mount(<MessageInputBar conversationId="c1" recipientName="Sarah"/>);const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value:'Keep my draft'}});const file=new File(['actual bytes'],'notes.txt',{type:'text/plain'});await user.upload(screen.getByLabelText('Choose attachments'),file);fireEvent.click(screen.getByRole('button',{name:'Send Message'}));await screen.findByText('Upload failed');expect(input).toHaveValue('Keep my draft');expect(screen.getByText('notes.txt')).toBeInTheDocument();expect(server.client.rpc).not.toHaveBeenCalledWith('send_message',expect.anything());
  server.handlers.set('send_message',()=>{throw new Error('Message failed');});fireEvent.click(screen.getByRole('button',{name:'Retry upload notes.txt'}));await screen.findByText('Ready');fireEvent.click(screen.getByRole('button',{name:'Send Message'}));await screen.findByText('Message failed');expect(server.uploadAttachment).toHaveBeenLastCalledWith(file,'c1');const failed=server.client.rpc.mock.calls.find(([n])=>n==='send_message')![1]!;expect(failed).toEqual(expect.objectContaining({message_content:'Keep my draft',attachment_ids:['upload-1'],client_id:expect.any(String)}));
  server.handlers.delete('send_message');fireEvent.click(screen.getByRole('button',{name:'Send Message'}));await waitFor(()=>expect(input).toHaveValue(''));expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();expect(server.uploadAttachment).toHaveBeenCalledTimes(2);const calls=server.client.rpc.mock.calls.filter(([n])=>n==='send_message');expect(calls[1][1]!.client_id).toBe(failed.client_id);expect(input).toHaveFocus();
 });
 it('creates a new retry UUID when the user changes a failed draft',async()=>{
  const server=mockCloud();server.handlers.set('send_message',()=>{throw new Error('Send failed');});await mount(<MessageInputBar conversationId="c1" recipientName="Sarah"/>);const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value:'Original'}});fireEvent.click(screen.getByRole('button',{name:'Send Message'}));await screen.findByText('Send failed');fireEvent.change(input,{target:{value:'Revised'}});fireEvent.click(screen.getByRole('button',{name:'Send Message'}));await waitFor(()=>expect(server.client.rpc).toHaveBeenCalledTimes(2));expect(server.client.rpc.mock.calls[0][1]!.client_id).not.toBe(server.client.rpc.mock.calls[1][1]!.client_id);
 });
 it('caps five attachments, 10 MiB images and 25 MiB files without losing drafts',async()=>{
  const server=mockCloud(),user=userEvent.setup();await mount(<MessageInputBar conversationId="c1" recipientName="Sarah"/>);fireEvent.change(screen.getByRole('textbox'),{target:{value:'Draft'}});const input=screen.getByLabelText('Choose attachments');await user.upload(input,new File(['valid'],'kept.txt',{type:'text/plain'}));await user.upload(input,Array.from({length:5},(_,i)=>new File(['x'],i+'.txt')));expect(screen.getByRole('alert')).toHaveTextContent('up to 5');
  const image=new File(['x'],'large.png',{type:'image/png'});Object.defineProperty(image,'size',{value:10*1024*1024+1});await user.upload(input,image);expect(screen.getByRole('alert')).toHaveTextContent('10 MB');
  const file=new File(['x'],'large.pdf',{type:'application/pdf'});Object.defineProperty(file,'size',{value:25*1024*1024+1});await user.upload(input,file);expect(screen.getByRole('alert')).toHaveTextContent('25 MB');expect(screen.getByText('kept.txt')).toBeInTheDocument();expect(screen.getByRole('textbox')).toHaveValue('Draft');expect(server.uploadAttachment).toHaveBeenCalledTimes(1);
 });
 it('prevents duplicate pending sends and locks the draft until completion',async()=>{
  const server=mockCloud(),pending=deferred<{id:string}>();server.handlers.set('send_message',()=>pending.promise);await mount(<MessageInputBar conversationId="c1" recipientName="Sarah"/>);const input=screen.getByRole('textbox');fireEvent.change(input,{target:{value:'Send once'}});fireEvent.keyDown(input,{key:'Enter'});fireEvent.keyDown(input,{key:'Enter'});expect(screen.getByRole('button',{name:'Send Message'})).toBeDisabled();expect(input).toHaveAttribute('readonly');await act(async()=>pending.resolve({id:'server-id'}));expect(server.client.rpc.mock.calls.filter(([n])=>n==='send_message')).toHaveLength(1);expect(input).toHaveValue('');
 });
 it('discards an uploaded reservation when removing an attachment after a failed send',async()=>{
  const server=mockCloud(),user=userEvent.setup();server.handlers.set('send_message',()=>{throw new Error('Send failed');});await mount(<MessageInputBar conversationId="c1" recipientName="Sarah"/>);await user.upload(screen.getByLabelText('Choose attachments'),new File(['x'],'notes.txt',{type:'text/plain'}));fireEvent.click(screen.getByRole('button',{name:'Send Message'}));await screen.findByText('Send failed');fireEvent.click(screen.getByRole('button',{name:'Remove attachment'}));await waitFor(()=>expect(server.discardAttachment).toHaveBeenCalledWith('upload-1'));expect(screen.queryByText('notes.txt')).not.toBeInTheDocument();
 });
});


