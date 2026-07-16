import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Inter — the modern sans-serif used across Linear/Stripe/Notion.
// Exposed as the --font-sans CSS variable that Tailwind's font-sans maps to.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'ClipForge AI — Turn long videos into viral clips',
  description:
    'Upload a long-form video and let AI find the most viral moments, then auto-generate captioned TikToks, Reels, and Shorts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
