"use client";

import React, { useState } from "react";
import { useChatFlow } from "@/context/ChatFlowContext";
import { Channel } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Hash, Lock } from "lucide-react";

interface CreateChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateChannelDialog({ open, onOpenChange }: CreateChannelDialogProps) {
  const { createChannel, pending, error } = useChatFlow();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Channel["category"]>("Engineering");
  const [isPrivate, setIsPrivate] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || pending) return;

    const created = await createChannel({
      name,
      description: description || "No description provided.",
      category,
      isPrivate,
    });

    if (!created) return;
    setName("");
    setDescription("");
    setIsPrivate(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={value => { if (!pending) onOpenChange(value); }}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" />
              Create a New Channel
            </DialogTitle>
            <DialogDescription>
              Channels are where conversations happen around specific projects or topics.
            </DialogDescription>
          </DialogHeader>

          <fieldset disabled={pending} className="space-y-4 py-4">
            {/* Channel Name */}
            <div className="space-y-1.5">
              <Label htmlFor="channel-name" className="text-xs font-semibold">
                Channel Name
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-semibold">
                  #
                </span>
                <Input
                  id="channel-name"
                  placeholder="e.g. platform-announcements"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-7"
                  required
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Channel handle:{" "}
                <span className="font-mono text-foreground font-medium">
                  #{name
                    .toLowerCase()
                    .trim()
                    .replace(/[^a-z0-9_-]/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/^-|-$/g, "") || "channel-name"}
                </span>
              </p>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="channel-desc" className="text-xs font-semibold">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="channel-desc"
                placeholder="What is this channel about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Category Dropdown */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Select
                value={category}
                onValueChange={(val) => setCategory(val as Channel["category"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Engineering">Engineering</SelectItem>
                  <SelectItem value="Design">Design</SelectItem>
                  <SelectItem value="Product">Product</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="Random">Random</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Privacy Switch */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="space-y-0.5 pr-2">
                <div className="flex items-center gap-1.5 font-semibold text-sm">
                  {isPrivate ? (
                    <Lock className="h-4 w-4 text-primary" />
                  ) : (
                    <Hash className="h-4 w-4 text-primary" />
                  )}
                  <span>Make Private Channel</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isPrivate
                    ? "Only invited colleagues can view or join this channel."
                    : "Anyone in your organization can view and join."}
                </p>
              </div>
              <Switch
                checked={isPrivate}
                onCheckedChange={setIsPrivate}
                aria-label="Toggle channel privacy"
              />
            </div>
          </fieldset>

          {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Creating…" : "Create Channel"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
