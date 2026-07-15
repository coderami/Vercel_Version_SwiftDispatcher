import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Package } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (clientName: string, address: string) => void;
}

export function QuickAddModal({ open, onClose, onAdd }: Props) {
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientName.trim() && address.trim()) {
      onAdd(clientName.trim(), address.trim());
      setClientName('');
      setAddress('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Package className="h-4 w-4 text-pickup" />
            Quick Pick-up
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="Client Name"
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            className="bg-secondary border-border text-foreground"
            autoFocus
          />
          <Input
            placeholder="Address"
            value={address}
            onChange={e => setAddress(e.target.value)}
            className="bg-secondary border-border text-foreground"
          />
          <Button type="submit" className="bg-pickup text-pickup-foreground hover:bg-pickup/90">
            Add to Inbox
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
