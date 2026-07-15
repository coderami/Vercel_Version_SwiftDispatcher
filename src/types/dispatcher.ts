export type CardType = 'invoice' | 'pickup';

export interface InvoiceCard {
  id: string;
  type: CardType;
  clientName: string;
  address: string;
  invoiceNumber?: string;
  createdAt: Date;
  routeId?: string | null;
}

export interface Route {
  id: string;
  name: string;
  cards: InvoiceCard[];
  createdAt: Date;
}

export type DropZone = 'inbox' | `driver-${string}-active` | `driver-${string}-staging`;

export interface Driver {
  id: string;
  name: string;
  avatar: string;
  isOnDuty: boolean;
  routeStartTime: Date | null;
  activePath: InvoiceCard[];
  stagingArea: InvoiceCard[];
}

export interface CompletedPath {
  id: string;
  driverId: string;
  driverName: string;
  startTime: Date;
  endTime: Date;
  cards: InvoiceCard[];
}
