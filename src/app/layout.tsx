import type { Metadata } from 'next';
import './globals.css';
import { WorkspaceProvider } from '@/components/providers/workspace-provider';
import { AppShell } from '@/components/shell/app-shell';

export const metadata: Metadata = {
  title: 'Loud Voice Studio | Multi-Bot Discord Control Center',
  description:
    'SaaS platform for managing multiple official Discord bots, streaming live microphone audio to voice channels, and fleet automation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-foreground antialiased">
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
