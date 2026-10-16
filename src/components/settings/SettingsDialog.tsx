"use client";

import { useChatFlow } from "@/context/ChatFlowContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsView } from "./SettingsView";
import { Settings } from "lucide-react";

export function SettingsDialog() {
  const { settingsDialogOpen, setSettingsDialogOpen } = useChatFlow();

  return (
    <Dialog open={settingsDialogOpen} onOpenChange={setSettingsDialogOpen}>
      <DialogContent
        className="w-[94vw] max-w-4xl p-0 h-[85vh] max-h-[680px] overflow-hidden flex flex-col gap-0 rounded-2xl border-border bg-card shadow-2xl"
      >
        <DialogHeader className="h-14 px-6 border-b flex flex-row items-center justify-between space-y-0 shrink-0 bg-card/80 select-none">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold tracking-tight">Settings</DialogTitle>
              <DialogDescription className="sr-only">
                Manage your account, preferences, and privacy
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          <SettingsView isModal={true} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
