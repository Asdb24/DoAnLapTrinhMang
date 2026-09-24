"use client";

import React, { useState, useRef } from "react";
import { useChatFlow } from "@/context/ChatFlowContext";
import { PresenceStatus } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Sliders,
  Bell,
  ShieldAlert,
  AlertTriangle,
  Upload,
  Check,
  Moon,
  Sun,
  Trash2,
  AlertOctagon,
} from "lucide-react";
import { UserStatusIndicator } from "@/components/common/UserStatusIndicator";

type SettingsTab = "profile" | "customization" | "notifications" | "blocked" | "danger";

export function SettingsView() {
  const {
    settings,
    updateSettings,
    blockedUsers,
    unblockUser,
    clearAllChatHistory,
    deleteAccount,
    pending,
    error,
  } = useChatFlow();

  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");

  // Profile Form state
  const [displayName, setDisplayName] = useState(settings.displayName);
  const [statusMessage, setStatusMessage] = useState(settings.statusMessage);
  const [avatarUrl, setAvatarUrl] = useState(settings.avatar);
  const [presence, setPresence] = useState<PresenceStatus>(settings.presence || "online");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dialog states for Danger Zone
  const [clearHistoryDialogOpen, setClearHistoryDialogOpen] = useState(false);
  const [deleteAccountDialogOpen, setDeleteAccountDialogOpen] = useState(false);

  const handleAvatarFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setSaveSuccess(false);
    const saved = await updateSettings({
      displayName,
      statusMessage,
      avatar: avatarUrl,
      presence,
    });
    if (!saved) return;
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const sampleAvatars = [
    "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80",
  ];

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full bg-background overflow-hidden">
      {/* Left Vertical Settings Navigation */}
      <nav className="w-full md:w-64 border-b md:border-b-0 md:border-r bg-card/40 p-4 shrink-0 flex md:flex-col gap-1 overflow-x-auto select-none">
        <div className="hidden md:block mb-3 px-2">
          <h2 className="text-lg font-bold tracking-tight">Settings</h2>
          <p className="text-xs text-muted-foreground">Manage your account & app preferences</p>
        </div>

        <Button
          variant={activeTab === "profile" ? "secondary" : "ghost"}
          className="justify-start gap-2.5 text-xs font-medium h-9"
          onClick={() => setActiveTab("profile")}
        >
          <User className="h-4 w-4 text-primary" />
          <span>Profile</span>
        </Button>

        <Button
          variant={activeTab === "customization" ? "secondary" : "ghost"}
          className="justify-start gap-2.5 text-xs font-medium h-9"
          onClick={() => setActiveTab("customization")}
        >
          <Sliders className="h-4 w-4 text-primary" />
          <span>Chat Customization</span>
        </Button>

        <Button
          variant={activeTab === "notifications" ? "secondary" : "ghost"}
          className="justify-start gap-2.5 text-xs font-medium h-9"
          onClick={() => setActiveTab("notifications")}
        >
          <Bell className="h-4 w-4 text-primary" />
          <span>Notifications</span>
        </Button>

        <Button
          variant={activeTab === "blocked" ? "secondary" : "ghost"}
          className="justify-start gap-2.5 text-xs font-medium h-9"
          onClick={() => setActiveTab("blocked")}
        >
          <ShieldAlert className="h-4 w-4 text-primary" />
          <span>Blocked Users</span>
        </Button>

        <div className="hidden md:block my-2 border-t border-border" />

        <Button
          variant={activeTab === "danger" ? "destructive" : "ghost"}
          className={`justify-start gap-2.5 text-xs font-medium h-9 ${
            activeTab === "danger" ? "" : "text-destructive hover:bg-destructive/10"
          }`}
          onClick={() => setActiveTab("danger")}
        >
          <AlertTriangle className="h-4 w-4" />
          <span>Danger Zone</span>
        </Button>
      </nav>

      {/* Main Settings Panel */}
      <ScrollArea className="flex-1 h-full max-w-4xl">
        <div className="p-6 sm:p-10">
        {/* 1. PROFILE SECTION */}
        {activeTab === "profile" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <div>
              <h3 className="text-xl font-bold tracking-tight">Public Profile</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Customize your display identity and current working status across ChatFlow.
              </p>
            </div>

            <Card className="border-border bg-card/60">
              <CardHeader>
                <CardTitle className="text-base">Profile Details</CardTitle>
                <CardDescription className="text-xs">
                  Colleagues will see this information in direct messages and channel directories.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-6">
                  {/* Avatar Upload / Pick */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                    <div className="relative shrink-0">
                      <Avatar className="h-20 w-20 border-2 border-border shadow-xs">
                        <AvatarImage src={avatarUrl} alt={displayName} />
                        <AvatarFallback className="text-lg font-bold">
                          {displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute bottom-1 right-1">
                        <UserStatusIndicator status={presence} size="md" />
                      </span>
                    </div>

                    <div className="space-y-2 flex-1 w-full">
                      <Label className="text-xs font-semibold">Avatar Picture</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleAvatarFileUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-2 text-xs h-8"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Upload Picture
                        </Button>
                      </div>

                      <div className="space-y-1 pt-1">
                        <Label htmlFor="avatarUrlInput" className="text-[11px] text-muted-foreground">Or image URL:</Label>
                        <Input
                          id="avatarUrlInput"
                          value={avatarUrl}
                          onChange={(e) => setAvatarUrl(e.target.value)}
                          placeholder="https://images.unsplash.com/..."
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="pt-1">
                        <Label className="text-[11px] text-muted-foreground">Or choose preset:</Label>
                        <div className="flex items-center gap-2 pt-1">
                          {sampleAvatars.map((url, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setAvatarUrl(url)}
                              className={`rounded-full p-0.5 border-2 transition-all ${
                                avatarUrl === url ? "border-primary scale-110" : "border-transparent opacity-70 hover:opacity-100"
                              }`}
                            >
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={url} />
                              </Avatar>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Display Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="displayName" className="text-xs font-semibold">
                      Display Name
                    </Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Alex Morgan"
                      required
                    />
                  </div>

                  {/* Presence Status */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Availability Status</Label>
                    <Select
                      value={presence}
                      onValueChange={(val) => setPresence(val as PresenceStatus)}
                    >
                      <SelectTrigger className="w-full bg-background">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="online">Online (Available)</SelectItem>
                        <SelectItem value="away">Away (Idle)</SelectItem>
                        <SelectItem value="offline">Offline (Invisible)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Custom Status Message */}
                  <div className="space-y-1.5">
                    <Label htmlFor="statusMessage" className="text-xs font-semibold">
                      Custom Status Message
                    </Label>
                    <Input
                      id="statusMessage"
                      value={statusMessage}
                      onChange={(e) => setStatusMessage(e.target.value)}
                      placeholder="What are you currently focusing on?"
                    />
                  </div>

                  {/* Email (Readonly) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-semibold">
                      Account Email
                    </Label>
                    <Input
                      id="email"
                      value={settings.email}
                      disabled
                      className="bg-muted text-muted-foreground"
                    />
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center gap-3 pt-2">
                    <Button disabled={pending} type="submit" className="gap-2">
                      {saveSuccess ? (
                        <>
                          <Check className="h-4 w-4" />
                          Saved!
                        </>
                      ) : (
                        "Save Profile Changes"
                      )}
                    </Button>
                    {saveSuccess && (
                      <span className="text-xs text-primary font-medium">
                        Profile updated successfully.
                      </span>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 2. CHAT CUSTOMIZATION SECTION */}
        {activeTab === "customization" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <div>
              <h3 className="text-xl font-bold tracking-tight">Chat Customization</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Fine-tune appearance, density, and keybindings to match your workflow.
              </p>
            </div>

            <Card className="border-border bg-card/60">
              <CardContent className="p-6 space-y-6 divide-y divide-border">
                {/* Theme Mode Toggle */}
                <div className="flex items-center justify-between pt-0">
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      {settings.theme === "dark" ? (
                        <Moon className="h-4 w-4 text-primary" />
                      ) : (
                        <Sun className="h-4 w-4 text-primary" />
                      )}
                      <span>Dark / Light Mode</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Switch between high-contrast dark theme and crisp daytime light theme.
                    </p>
                  </div>
                  <Switch
                    disabled={pending}
                    checked={settings.theme === "dark"}
                    onCheckedChange={async (checked) => { await
                      updateSettings({ theme: checked ? "dark" : "light" });
                    }}
                    aria-label="Toggle dark mode"
                  />
                </div>

                {/* Message Density Toggle */}
                <div className="flex items-center justify-between pt-6">
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <Sliders className="h-4 w-4 text-primary" />
                      <span>Compact Message Density</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {settings.density === "compact"
                        ? "Currently Compact: Reduced padding allows viewing more message history simultaneously."
                        : "Currently Cozy: Generous line height and comfortable spacing."}
                    </p>
                  </div>
                  <Switch
                    disabled={pending}
                    checked={settings.density === "compact"}
                    onCheckedChange={async (checked) => { await
                      updateSettings({ density: checked ? "compact" : "cozy" });
                    }}
                    aria-label="Toggle message density"
                  />
                </div>

                {/* Enter to Send Toggle */}
                <div className="flex items-center justify-between pt-6">
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <Check className="h-4 w-4 text-primary" />
                      <span>Press Enter to Send</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When enabled, pressing Enter sends the message immediately, and Shift+Enter adds a new line.
                    </p>
                  </div>
                  <Switch
                    disabled={pending}
                    checked={settings.enterToSend}
                    onCheckedChange={async (checked) => { await
                      updateSettings({ enterToSend: checked });
                    }}
                    aria-label="Toggle enter to send"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 3. NOTIFICATIONS SECTION */}
        {activeTab === "notifications" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <div>
              <h3 className="text-xl font-bold tracking-tight">Notification Preferences</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Your preferences are saved to your account. Browser push and sound delivery are not enabled yet.
              </p>
            </div>

            <Card className="border-border bg-card/60">
              <CardContent className="p-6 space-y-6 divide-y divide-border">
                {/* Desktop Notifications */}
                <div className="flex items-center justify-between pt-0">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="font-semibold text-sm">Desktop Push Alerts</h4>
                    <p className="text-xs text-muted-foreground">
                      Save your preference for desktop alerts when they become available.
                    </p>
                  </div>
                  <Switch
                    disabled={pending}
                    aria-label="Desktop alert preference"
                    checked={settings.desktopNotifications}
                    onCheckedChange={async (checked) => { await
                      updateSettings({ desktopNotifications: checked });
                    }}
                  />
                </div>

                {/* Sound Alerts */}
                <div className="flex items-center justify-between pt-6">
                  <div className="space-y-0.5 pr-4">
                    <h4 className="font-semibold text-sm">Sound Notifications</h4>
                    <p className="text-xs text-muted-foreground">
                      Save your preference for message sounds when they become available.
                    </p>
                  </div>
                  <Switch
                    disabled={pending}
                    aria-label="Sound alert preference"
                    checked={settings.soundNotifications}
                    onCheckedChange={async (checked) => { await
                      updateSettings({ soundNotifications: checked });
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 4. BLOCKED USERS SECTION */}
        {activeTab === "blocked" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <div>
              <h3 className="text-xl font-bold tracking-tight">Blocked Users</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Users on this list cannot direct message you or see your online status.
              </p>
            </div>

            <Card className="border-border bg-card/60">
              <CardContent className="p-0">
                {blockedUsers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    You have not blocked any users.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Blocked Date</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockedUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback>{user.name.slice(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-xs font-semibold">{user.name}</p>
                              <p className="text-[11px] text-muted-foreground">{user.handle}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {user.blockedDate}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              disabled={pending}
                              onClick={async () => { await unblockUser(user.id); }}
                            >
                              Unblock
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 5. DANGER ZONE SECTION */}
        {activeTab === "danger" && (
          <div className="space-y-6 animate-in fade-in-50 duration-200">
            <div>
              <h3 className="text-xl font-bold tracking-tight text-destructive">Danger Zone</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Irreversible actions regarding your message data and account workspace.
              </p>
            </div>

            <div className="space-y-4">
              {/* Clear History Card */}
              <Card className="border-destructive/40 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Clear All Chat History
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Clears past messages from your view. Other participants keep their conversation history.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="destructive"
                    onClick={() => setClearHistoryDialogOpen(true)}
                  >
                    Clear All Chat History
                  </Button>
                </CardContent>
              </Card>

              {/* Delete Account Card */}
              <Card className="border-destructive/40 bg-destructive/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertOctagon className="h-4 w-4 text-destructive" />
                    Delete Your Account
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Permanently delete your profile, messages, and uploaded files. Other members keep their accounts and messages.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteAccountDialogOpen(true)}
                  >
                    Delete Account
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        </div>
      </ScrollArea>

      {/* Confirmation Dialog: Clear Chat History */}
      <Dialog open={clearHistoryDialogOpen} onOpenChange={open => { if (!pending) setClearHistoryDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Clear All Message History?
            </DialogTitle>
            <DialogDescription>
              Clear past messages from your view of all conversations? Other participants retain their history. You cannot undo this change to your view.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={pending} onClick={() => setClearHistoryDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (await clearAllChatHistory()) setClearHistoryDialogOpen(false);
              }}
            >
              Confirm Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog: Delete Account */}
      <Dialog open={deleteAccountDialogOpen} onOpenChange={open => { if (!pending) setDeleteAccountDialogOpen(open); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertOctagon className="h-5 w-5" />
              Permanently Delete Account?
            </DialogTitle>
            <DialogDescription>
              This permanently deletes your profile, your messages, and your uploaded files, then signs you out. Other participants keep their accounts and messages.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={pending} onClick={() => setDeleteAccountDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (await deleteAccount()) setDeleteAccountDialogOpen(false);
              }}
            >
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
