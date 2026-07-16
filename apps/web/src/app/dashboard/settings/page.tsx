'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { IS_DEMO } from '@/lib/demo';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/misc';

export default function SettingsPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (IS_DEMO) {
      setEmail('demo@clipforge.ai');
      setName('Demo Creator');
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '');
      setName((data.user?.user_metadata as any)?.full_name ?? '');
    });
  }, []);

  async function save() {
    await supabase.auth.updateUser({ data: { full_name: name } });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account.</p>
      </div>

      <Card><CardContent className="space-y-4 pt-6">
        <div>
          <label className="text-xs text-muted-foreground">Email</label>
          <Input value={email} disabled />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Display name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <Button onClick={save}>{saved ? 'Saved ✓' : 'Save'}</Button>
      </CardContent></Card>

      <Card><CardContent className="space-y-3 pt-6">
        <h2 className="font-medium">Danger zone</h2>
        <p className="text-sm text-muted-foreground">Sign out of your account on this device.</p>
        <Button variant="destructive" onClick={() => supabase.auth.signOut().then(() => (window.location.href = '/'))}>
          Sign out
        </Button>
      </CardContent></Card>
    </div>
  );
}
