import { useDroppable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';

interface Props {
  visible: boolean;
}

export function TrashBin({ visible }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' });

  return (
    <div
      ref={setNodeRef}
      className={`
        fixed bottom-6 right-6 z-50
        flex items-center justify-center
        w-14 h-14 rounded-full
        transition-all duration-300 ease-in-out
        ${visible ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none'}
        ${isOver
          ? 'bg-destructive scale-125 shadow-[0_0_24px_hsl(var(--destructive)/0.5)]'
          : 'bg-destructive/80 scale-100 shadow-lg'}
      `}
    >
      <Trash2
        className={`text-destructive-foreground transition-transform duration-200 ${isOver ? 'h-7 w-7' : 'h-5 w-5'}`}
      />
    </div>
  );
}
