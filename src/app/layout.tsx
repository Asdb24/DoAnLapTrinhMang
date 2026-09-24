import type { Metadata } from "next";
import "./globals.css";
import { ChatFlowProvider } from "@/context/ChatFlowContext";
import { LeftMainSidebar } from "@/components/layout/LeftMainSidebar";
import { NewMessageDialog } from "@/components/dialogs/NewMessageDialog";
import { appOrigin } from '@/lib/public-url.mjs';

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
          <div className="flex h-screen w-screen overflow-hidden bg-background">
            {/* Persistent Left Main Sidebar */}
            <LeftMainSidebar />

            {/* Main Application Area */}
            <main className="flex-1 flex min-w-0 h-full overflow-hidden">
              {children}
            </main>
          </div>

          {/* Global New Message Dialog */}
          <NewMessageDialog />
        </ChatFlowProvider>
      </body>
    </html>
  );
}
