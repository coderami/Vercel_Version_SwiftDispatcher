import { useState } from 'react';
import { Plus, Trash2, Phone, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface DriverRow {
  id: string;
  name: string;
  avatar: string;
  phone: string;
  area: string;
  is_on_duty: boolean;
}

interface Props {
  drivers: DriverRow[];
  onDriversChanged: () => void;
}

export function DriverManagement({ drivers, onDriversChanged }: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DriverRow | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', area: '' });
  const [saving, setSaving] = useState(false);

  const handleToggleDuty = async (driver: DriverRow) => {
    const newVal = !driver.is_on_duty;
    try {
      const { error } = await supabase
        .from('drivers')
        .update({ is_on_duty: newVal })
        .eq('id', driver.id);
      if (error) throw error;
      toast.success(`${driver.name} is now ${newVal ? 'On' : 'Off'} Duty`);
      onDriversChanged();
    } catch {
      toast.error('Failed to update duty status');
    }
  };

  const handleAdd = async () => {
    if (!form.name.trim()) {
      toast.error('Driver name is required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('drivers').insert({
        name: form.name.trim(),
        avatar: form.name.trim()[0].toUpperCase(),
        phone: form.phone.trim(),
        area: form.area.trim(),
      });
      if (error) throw error;
      toast.success(`${form.name} added`);
      setForm({ name: '', phone: '', area: '' });
      setShowAdd(false);
      onDriversChanged();
    } catch (err) {
      console.error(err);
      toast.error('Failed to add driver');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      // Move assigned cards back to inbox
      const { error: cardErr } = await supabase
        .from('invoice_cards')
        .update({ location: 'inbox' as const, driver_id: null })
        .eq('driver_id', deleteTarget.id);
      if (cardErr) throw cardErr;

      // Soft-delete: set is_active to false
      const { error } = await supabase
        .from('drivers')
        .update({ is_active: false })
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success(`${deleteTarget.name} deactivated`);
      setDeleteTarget(null);
      onDriversChanged();
    } catch (err) {
      console.error(err);
      toast.error('Failed to deactivate driver');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-md mx-auto space-y-2">
        {drivers.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No drivers yet. Tap the button below to add one.
          </p>
        )}
        {drivers.map(d => (
          <div
            key={d.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border"
          >
            <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold shrink-0">
              {d.avatar || d.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {d.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {d.phone}
                  </span>
                )}
                {d.area && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {d.area}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={d.is_on_duty}
                onCheckedChange={() => handleToggleDuty(d)}
                className="data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-muted"
              />
              <button
                onClick={() => setDeleteTarget(d)}
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-50"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Add Driver</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="driver-name">Name *</Label>
              <Input
                id="driver-name"
                placeholder="e.g. Carlos"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="driver-phone">Phone</Label>
              <Input
                id="driver-phone"
                placeholder="e.g. 555-0123"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="driver-area">Area</Label>
              <Input
                id="driver-area"
                placeholder="e.g. Downtown"
                value={form.area}
                onChange={e => setForm(f => ({ ...f, area: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAdd} disabled={saving} className="w-full">
              {saving ? 'Adding…' : 'Add Driver'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the driver from the dashboard and reassign their cards to the inbox. Their delivery history will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={saving}>
              {saving ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
