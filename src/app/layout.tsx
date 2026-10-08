import type { Metadata } from "next";
import "./globals.css";
import { ChatFlowProvider } from "@/context/ChatFlowContext";
import { AppSidebar } from "@/components/app-sidebar";
import { NewMessageDialog } from "@/components/dialogs/NewMessageDialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { appOrigin } from "@/lib/public-url.mjs";

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_APP_URL ? new URL(appOrigin()) : undefined,
  title: "ChatFlow | Modern Team Messaging & Collaboration",
  description: "Team conversations, shared channels, and direct messaging in one workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-background text-foreground h-screen w-screen overflow-hidden">
        <ChatFlowProvider>
          <SidebarProvider
            style={
              {
                "--sidebar-width": "350px",
              } as React.CSSProperties
            }
            className="h-screen w-screen overflow-hidden"
          >
            {/* Shadcn sidebar-09 AppSidebar */}
            <AppSidebar />

            {/* Main Application Inset Area */}
            <SidebarInset className="flex flex-col h-screen overflow-hidden min-w-0">
              <main className="flex-1 flex min-w-0 h-full overflow-hidden">
                {children}
              </main>
            </SidebarInset>
          </SidebarProvider>

          {/* Global New Message Dialog */}
          <NewMessageDialog />
        </ChatFlowProvider>
      </body>
    </html>
  );
}
