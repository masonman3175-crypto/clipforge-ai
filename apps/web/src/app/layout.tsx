import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClipForge AI — Turn long videos into viral clips',
  description:
    'Upload a long-form video and let AI find the most viral moments, then auto-generate captioned TikToks, Reels, and Shorts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
