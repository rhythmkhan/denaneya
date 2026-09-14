'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { UserPlus, Mail, Phone, Trash2 } from 'lucide-react';

export interface TeamMember {
  id: string;
  role: string;
  status: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  invitedEmail?: string | null;
  createdAt: string | Date;
}

export function TeamClient({ members }: { members: TeamMember[] }) {
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState('FINANCE');
  const [loading, setLoading] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setMessage(`Invitation sent to ${email}`);
      setLoading(false);
      setInviteOpen(false);
      setEmail('');
      setTimeout(() => setMessage(''), 4000);
    }, 600);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Team & Access Control</h1>
          <p className="text-xs text-slate-500">
            Manage merchant team members, granular roles (Owner, Admin, Finance, Developer, Viewer).
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="w-4 h-4" /> Invite Team Member
        </Button>
      </div>

      {message && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs text-emerald-700 dark:text-emerald-300">
          {message}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-medium">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Role</th>
                <th className="p-3">Contact</th>
                <th className="p-3">Status</th>
                <th className="p-3">Joined Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {members.map((m) => {
                const roleVariant =
                  m.role === 'OWNER'
                    ? 'default'
                    : m.role === 'ADMIN'
                    ? 'info'
                    : m.role === 'FINANCE'
                    ? 'success'
                    : 'secondary';

                return (
                  <tr key={m.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="p-3">
                      <div className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-xs">
                          {(m.name || m.email || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div>{m.name || 'Invited User'}</div>
                          <div className="text-[11px] text-slate-400 font-normal">
                            {m.email || m.invitedEmail}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant={roleVariant}>{m.role}</Badge>
                    </td>
                    <td className="p-3 text-slate-500 space-y-0.5">
                      <div className="flex items-center gap-1">
                        <Mail className="w-3 h-3 text-slate-400" />
                        <span>{m.email || m.invitedEmail}</span>
                      </div>
                      {m.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{m.phone}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant={m.status === 'ACTIVE' ? 'success' : 'secondary'}>
                        {m.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-slate-500">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">
                      {m.role !== 'OWNER' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      <Dialog open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Team Member">
        <form onSubmit={handleInvite} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Work Email Address *
            </label>
            <Input
              required
              type="email"
              placeholder="colleague@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Role & Scope</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full h-9 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 text-slate-900 dark:text-white"
            >
              <option value="ADMIN">Admin (Manage team, settings, and operations)</option>
              <option value="FINANCE">Finance (View revenue, issue refunds, download reports)</option>
              <option value="DEVELOPER">Developer (Manage API keys, webhooks, and devices)</option>
              <option value="VIEWER">Viewer (Read-only access to transactions)</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? 'Sending...' : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
