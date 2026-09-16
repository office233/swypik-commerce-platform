import fs from 'node:fs';
import path from 'node:path';

export interface PosReceiptRecord {
  receiptNumber: string;
  totalRon: number;
  tvaRon?: number;
  paymentMethod?: string;
  recordedAt?: string;
  [key: string]: any;
}

export interface LocalNodeData {
  nodeId: string;
  storeCatalog: any[];
  posReceiptsJournal: PosReceiptRecord[];
  syncStatus: {
    lastSyncedAt: string;
    pendingSyncCount: number;
    isOnline: boolean;
  };
}

const DB_FILE = path.join(process.cwd(), 'desktop', 'swypik-local-node.json');

/**
 * Embedded Local Node Database for Swypik Business ERP Desktop
 */
export class LocalNodeDatabase {
  public data: LocalNodeData;

  constructor() {
    this.data = {
      nodeId: "NODE-RO-" + Date.now().toString(36).toUpperCase(),
      storeCatalog: [],
      posReceiptsJournal: [],
      syncStatus: {
        lastSyncedAt: new Date().toISOString(),
        pendingSyncCount: 0,
        isOnline: true,
      },
    };
    this.load();
  }

  public load(): void {
    if (fs.existsSync(DB_FILE)) {
      try {
        this.data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      } catch {
        // use defaults
      }
    } else {
      this.save();
    }
  }

  public save(): void {
    try {
      const dir = path.dirname(DB_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch {
      // non-blocking
    }
  }

  public recordReceipt(receipt: PosReceiptRecord): PosReceiptRecord {
    if (!this.data.syncStatus.isOnline) {
      throw new Error("Nodul este offline! Tranzacțiile sunt blocate deoarece conexiunea la rețeaua Swypik este obligatorie.");
    }
    const rec = {
      ...receipt,
      recordedAt: new Date().toISOString(),
    };
    this.data.posReceiptsJournal.push(rec);
    this.save();
    return rec;
  }

  public getNodeInfo() {
    return {
      nodeId: this.data.nodeId,
      receiptsCount: this.data.posReceiptsJournal.length,
      isOnline: this.data.syncStatus.isOnline,
      lastSyncedAt: this.data.syncStatus.lastSyncedAt,
    };
  }
}
