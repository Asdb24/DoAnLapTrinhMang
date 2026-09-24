import React from "react";
import { PresenceStatus } from "@/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StatusIndicatorProps {
  status?: PresenceStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function UserStatusIndicator({
  status = "offline",
  size = "md",
  className,
}: StatusIndicatorProps) {
  const sizeClasses = {
    sm: "h-2 w-2",
    md: "h-2.5 w-2.5",
    lg: "h-3.5 w-3.5",
  };

  const statusStyles: Record<PresenceStatus, string> = {
    online: "bg-primary ring-2 ring-background",
    away: "bg-muted-foreground ring-2 ring-background",
    offline: "bg-muted border border-border ring-2 ring-background",
  };

  return (
    <span
      className={cn(
        "inline-block rounded-full shrink-0 transition-colors",
        sizeClasses[size],
        statusStyles[status],
        className
      )}
      title={`Status: ${status}`}
      aria-label={`Status: ${status}`}
    />
  );
}

export function UserStatusBadge({ status = "offline" }: { status?: PresenceStatus }) {
  if (status === "online") {
    return (
      <Badge variant="default" className="text-xs font-normal capitalize">
        <UserStatusIndicator status="online" size="sm" className="mr-1.5" />
        Online
      </Badge>
    );
  }
  if (status === "away") {
    return (
      <Badge variant="secondary" className="text-xs font-normal capitalize">
        <UserStatusIndicator status="away" size="sm" className="mr-1.5" />
        Away
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs font-normal capitalize text-muted-foreground">
      <UserStatusIndicator status="offline" size="sm" className="mr-1.5" />
      Offline
    </Badge>
  );
}
