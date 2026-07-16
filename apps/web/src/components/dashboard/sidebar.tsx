'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Upload,
  FolderOpen,
  Clapperboard,
  CreditCard,
  Settings,
  Shield,
  Sparkles,
  LogOut,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const nav = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/upload', label: 'Upload Video', icon: Upload },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderOpen },
  { href: '/dashboard/clips', label: 'Generated Clips', icon: Clapperboard },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 p-4 md:flex">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2 font-semibold">
        <Sparkles className="h-5 w-5 text-primary" /> ClipForge AI
      </Link>
      <nav className="flex-1 space-y-1">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              pathname.startsWith('/admin') ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Shield className="h-4 w-4" /> Admin
          </Link>
        )}
      </nav>
      <button
        onClick={() => supabase.auth.signOut().then(() => (window.location.href = '/'))}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </aside>
  );
}
