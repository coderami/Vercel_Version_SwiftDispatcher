import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Route as RouteIcon } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function NewRouteModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState('');

  useEffect(() => { if (!open) setName(''); }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <RouteIcon className="h-4 w-4 text-primary" />
            New Route
          </DialogTitle>
          <DialogDescription>
            Group invoices for batch assignment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input
            placeholder="Route name (e.g. North)"
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-secondary border-border text-foreground"
            autoFocus
          />
          <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
            Create Route
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteProps {
  open: boolean;
  routeName: string;
  invoiceCount: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteRouteModal({ open, routeName, invoiceCount, onClose, onConfirm }: DeleteProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground">Delete route?</DialogTitle>
          <DialogDescription>
            You are deleting the <span className="font-semibold text-foreground">{routeName}</span> route.{' '}
            <span className="font-semibold text-foreground">{invoiceCount}</span>{' '}
            {invoiceCount === 1 ? 'invoice' : 'invoices'} will be returned to the Inbox. Continue?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-row gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={() => { onConfirm(); onClose(); }}>
            Delete Route
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
