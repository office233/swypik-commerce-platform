import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'swypik-local-node.json');

/**
 * Embedded Local Node Database for Swypik Business ERP
 * Runs locally on merchant machine; strictly syncs with Swypik Cloud
 */
export class LocalNodeDatabase {
  constructor() {
    this.data = {
      nodeId: "NODE-RO-" + Date.now().toString(36).toUpperCase(),
      storeCatalog: [],
      posReceiptsJournal: [],
      syncStatus: {
        lastSyncedAt: new Date().toISOString(),
        pendingSyncCount: 0,
        isOnline: true
      }
    };
    this.load();
  }

  load() {
    if (fs.existsSync(DB_FILE)) {
      try {
        this.data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      } catch (e) {
        console.warn("[LocalNodeDB] Corrupt local DB, resetting to defaults.");
      }
    } else {
      this.save();
    }
  }

  save() {
    fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
  }

  recordReceipt(receipt) {
    if (!this.data.syncStatus.isOnline) {
      throw new Error("Nodul este offline! Tranzacțiile sunt blocate deoarece conexiunea la rețeaua Swypik este obligatorie.");
    }
    this.data.posReceiptsJournal.push({
      ...receipt,
      recordedAt: new Date().toISOString()
    });
    this.save();
    return receipt;
  }

  getNodeInfo() {
    return {
      nodeId: this.data.nodeId,
      receiptsCount: this.data.posReceiptsJournal.length,
      isOnline: this.data.syncStatus.isOnline,
      lastSyncedAt: this.data.syncStatus.lastSyncedAt
    };
  }
}
