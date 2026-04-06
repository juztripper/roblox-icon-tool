import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PIXEL FORGE — Roblox Icon Tool',
  description: 'Remove backgrounds, resize, and publish images directly to Roblox.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
