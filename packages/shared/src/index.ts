export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense';

export type AccountSubtype =
  | 'bank'
  | 'accounts_receivable'
  | 'accounts_payable'
  | 'other_current_asset'
  | 'fixed_asset'
  | 'other_current_liability'
  | 'long_term_liability'
  | 'equity'
  | 'income'
  | 'cost_of_goods_sold'
  | 'expense'
  | 'other_income'
  | 'other_expense';

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  parentId: string | null;
  isActive: boolean;
  balance: number;
}

export interface JournalLine {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface JournalEntry {
  id: string;
  date: string;
  memo: string | null;
  reference: string | null;
  sourceType: string | null;
  sourceId: string | null;
  isVoid: boolean;
  lines: JournalLine[];
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
}

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  accountId: string | null;
}

export interface Invoice {
  id: string;
  customerId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  status: 'draft' | 'sent' | 'paid' | 'void';
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  lines: InvoiceLine[];
}

export interface Bill {
  id: string;
  vendorId: string;
  billNumber: string;
  date: string;
  dueDate: string | null;
  status: 'open' | 'paid' | 'void';
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  lines: BillLine[];
}

export interface BillLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  accountId: string | null;
}

export interface ImportTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  suggestedAccountId: string | null;
  suggestedVendorName: string | null;
  confidence: 'rule' | 'fuzzy' | 'ml' | 'none';
  status: 'pending' | 'approved' | 'skipped';
  ruleId: string | null;
}

export interface ImportRule {
  id: string;
  name: string;
  criteria: {
    descriptionContains?: string;
    amountMin?: number;
    amountMax?: number;
  };
  action: {
    categoryId: string;
    vendorName?: string;
  };
  isActive: boolean;
}

export type ReportBasis = 'cash' | 'accrual';

export interface ReportLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  children?: ReportLine[];
}

export interface ProfitAndLossReport {
  basis: ReportBasis;
  startDate: string;
  endDate: string;
  income: ReportLine[];
  expenses: ReportLine[];
  netIncome: number;
}

export interface BalanceSheetReport {
  basis: ReportBasis;
  asOfDate: string;
  assets: ReportLine[];
  liabilities: ReportLine[];
  equity: ReportLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export interface TrialBalanceReport {
  basis: ReportBasis;
  asOfDate: string;
  lines: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
  }>;
}

export interface CompanyInfo {
  id: string;
  name: string;
  fiscalYearStartMonth: number;
  defaultBasis: ReportBasis;
  createdAt: string;
  logoPath: string | null;
  defaultTaxRate: number;
  /** Days after invoice date; null means no automatic due date. */
  defaultInvoiceDueDays: number | null;
}

export type LicenseTier = 'trial' | 'basic' | 'pro' | 'enterprise';

export interface LicenseInfo {
  tier: LicenseTier;
  expiresAt: string | null;
  isValid: boolean;
  features: string[];
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number | string;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}
