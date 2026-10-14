"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChatFlow } from "@/context/ChatFlowContext";

export default function SettingsPage() {
  const router = useRouter();
  const { setSettingsDialogOpen } = useChatFlow();

  useEffect(() => {
    setSettingsDialogOpen(true);
    router.replace("/");
  }, [router, setSettingsDialogOpen]);

  return null;
}
