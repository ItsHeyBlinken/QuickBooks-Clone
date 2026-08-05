import type {
  Account,
  CompanyInfo,
  Customer,
  Invoice,
  Vendor,
  ImportTransaction,
  ImportRule,
  ProfitAndLossReport,
  BalanceSheetReport,
  LicenseInfo,
  Bill,
} from '@ledgerlocal/shared';

export interface LedgerAPI {
  call: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  healthCheck: () => Promise<{ status: string; version: string }>;
  createCompany: (path: string, name: string) => Promise<CompanyInfo>;
  openCompany: (path: string) => Promise<CompanyInfo>;
  getCompanyInfo: () => Promise<CompanyInfo | null>;
  backup: (destPath: string) => Promise<{ path: string; status: string }>;
  restore: (sourcePath: string) => Promise<CompanyInfo>;
  getRecentCompanies: () => Promise<Array<{ path: string; name: string; lastOpened: string }>>;
}

export interface DialogAPI {
  openFile: (filters?: Electron.FileFilter[]) => Promise<string | null>;
  saveFile: (defaultPath?: string, filters?: Electron.FileFilter[]) => Promise<string | null>;
  openCsv: () => Promise<string | null>;
  openImage: () => Promise<string | null>;
}

export interface AppAPI {
  checkUpdates: () => Promise<{ available: boolean; version?: string }>;
  openExternal: (url: string) => Promise<void>;
  openPath: (path: string) => Promise<string>;
  getLocalFileUrl: (path: string) => Promise<string>;
}

export interface FsAPI {
  readFile: (path: string) => Promise<string>;
}

declare global {
  interface Window {
    ledger: LedgerAPI;
    dialog: DialogAPI;
    app: AppAPI;
    fs: FsAPI;
  }
}

export async function api<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const result = await window.ledger.call(method, params);
  if (result && typeof result === 'object' && '__ledgerError' in result) {
    throw new Error(String((result as { __ledgerError: string }).__ledgerError));
  }
  return result as T;
}

export type {
  Account,
  CompanyInfo,
  Customer,
  Invoice,
  Vendor,
  ImportTransaction,
  ImportRule,
  ProfitAndLossReport,
  BalanceSheetReport,
  LicenseInfo,
  Bill,
};
