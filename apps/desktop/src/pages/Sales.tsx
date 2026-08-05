import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { Customer, Invoice, Account, CompanyInfo } from '../api';
import SearchSelect from '../components/SearchSelect';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  quantityOnHand: number;
  costPerUnit: number;
  salePrice: number;
  incomeAccountId: string | null;
}

interface LineItemDraft {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  accountId?: string | null;
  inventoryItemId?: string;
}

function createLineItem(): LineItemDraft {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitPrice: 0,
  };
}

function inventoryLineDescription(item: InventoryItem): string {
  return item.sku ? `${item.name} (${item.sku})` : item.name;
}

function createLineFromInventory(item: InventoryItem): LineItemDraft {
  return {
    id: crypto.randomUUID(),
    description: inventoryLineDescription(item),
    quantity: 1,
    unitPrice: item.salePrice,
    accountId: item.incomeAccountId,
    inventoryItemId: item.id,
  };
}

function lineAmount(line: LineItemDraft): number {
  return line.quantity * line.unitPrice;
}

function invoiceSubtotal(lines: LineItemDraft[]): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

function calculateTaxAmount(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * (taxRate / 100) * 100) / 100;
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function dueDateFromCompanyDefault(invoiceDate: string, dueDays: number | null | undefined): string {
  if (dueDays === null || dueDays === undefined) return '';
  return addDaysToIsoDate(invoiceDate, dueDays);
}

function createInitialInvoiceForm(company: CompanyInfo) {
  const date = new Date().toISOString().slice(0, 10);
  return {
    customerId: '',
    invoiceNumber: '',
    date,
    dueDate: dueDateFromCompanyDefault(date, company.defaultInvoiceDueDays),
    lines: [createLineItem()],
  };
}

export default function Sales({ company }: { company: CompanyInfo }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [showPayment, setShowPayment] = useState<string | null>(null);
  const [showBatch, setShowBatch] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState(() => createInitialInvoiceForm(company));

  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: 0,
    depositAccountId: '',
  });

  const [batchForm, setBatchForm] = useState({
    customerIds: [] as string[],
    description: '',
    unitPrice: 0,
    date: new Date().toISOString().slice(0, 10),
  });

  const [newCustomerForm, setNewCustomerForm] = useState({
    name: '',
    email: '',
    phone: '',
  });

  const load = () => {
    api<Invoice[]>('invoices.list', {}).then(setInvoices);
    api<Customer[]>('customers.list', {}).then(setCustomers);
    api<InventoryItem[]>('inventory.list', {}).then(setInventoryItems).catch(() => setInventoryItems([]));
    api<Account[]>('accounts.list', {}).then(setAccounts);
  };

  useEffect(() => { load(); }, []);

  const incomeAccount = accounts.find((a) => a.subtype === 'income');
  const bankAccount = accounts.find((a) => a.subtype === 'bank');

  const handleCreate = async () => {
    if (!form.customerId || !form.invoiceNumber) {
      setError('Customer and invoice number are required');
      return;
    }
    const validLines = form.lines.filter(
      (line) => line.description.trim() && line.quantity > 0 && line.unitPrice >= 0,
    );
    if (validLines.length === 0) {
      setError('Add at least one line item with a description and amount');
      return;
    }
    try {
      const subtotal = invoiceSubtotal(validLines);
      const taxAmount = calculateTaxAmount(subtotal, company.defaultTaxRate);
      await api('invoices.create', {
        customerId: form.customerId,
        invoiceNumber: form.invoiceNumber,
        date: form.date,
        dueDate: form.dueDate || null,
        taxAmount,
        lines: validLines.map((line) => ({
          description: line.description.trim(),
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          accountId: line.accountId || incomeAccount?.id,
        })),
      });
      setShowForm(false);
      setShowNewCustomer(false);
      setForm(createInitialInvoiceForm(company));
      setError('');
      setSuccess('Invoice created successfully');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invoice');
    }
  };

  const updateLine = (id: string, patch: Partial<LineItemDraft>) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    }));
  };

  const addLine = () => {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, createLineItem()] }));
  };

  const addInventoryLine = (item: InventoryItem) => {
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, createLineFromInventory(item)],
    }));
    setError('');
  };

  const removeLine = (id: string) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.length > 1 ? prev.lines.filter((line) => line.id !== id) : prev.lines,
    }));
  };

  const handleExportPdf = async (invoice: Invoice) => {
    const defaultPath = `Invoice-${invoice.invoiceNumber}.pdf`;
    const destPath = await window.dialog.saveFile(defaultPath, [
      { name: 'PDF', extensions: ['pdf'] },
    ]);
    if (!destPath) return;

    try {
      await api('invoices.exportPdf', { invoiceId: invoice.id, destPath });
      setError('');
      setSuccess(`PDF saved to ${destPath}`);
      await window.app.openPath(destPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export PDF');
    }
  };

  const handleEmailClient = async (invoice: Invoice, customer: Customer | undefined) => {
    const destPath = await window.dialog.saveFile(`Invoice-${invoice.invoiceNumber}.pdf`, [
      { name: 'PDF', extensions: ['pdf'] },
    ]);
    if (!destPath) return;

    try {
      await api('invoices.exportPdf', { invoiceId: invoice.id, destPath });
      const subject = encodeURIComponent(`Invoice ${invoice.invoiceNumber}`);
      const body = encodeURIComponent(
        `Please find invoice ${invoice.invoiceNumber} attached.\n\nTotal: ${formatCurrency(invoice.total)}\n\nThank you for your business.`,
      );
      const recipient = customer?.email ? encodeURIComponent(customer.email) : '';
      const mailto = recipient
        ? `mailto:${recipient}?subject=${subject}&body=${body}`
        : `mailto:?subject=${subject}&body=${body}`;
      await window.app.openExternal(mailto);
      await window.app.openPath(destPath);
      setSuccess('PDF saved. Attach it in your email client before sending.');
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to prepare invoice email');
    }
  };

  const handlePayment = async (invoiceId: string) => {
    try {
      await api('invoices.pay', {
        invoiceId,
        date: paymentForm.date,
        amount: paymentForm.amount,
        depositAccountId: paymentForm.depositAccountId || bankAccount?.id,
      });
      setShowPayment(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record payment');
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustomerForm.name.trim()) {
      setError('Customer name is required');
      return;
    }
    try {
      const customer = await api<Customer>('customers.create', {
        name: newCustomerForm.name.trim(),
        email: newCustomerForm.email.trim() || null,
        phone: newCustomerForm.phone.trim() || null,
      });
      setCustomers((prev) => [...prev, customer].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((prev) => ({ ...prev, customerId: customer.id }));
      setNewCustomerForm({ name: '', email: '', phone: '' });
      setShowNewCustomer(false);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create customer');
    }
  };

  const handleBatch = async () => {
    if (batchForm.customerIds.length === 0) {
      setError('Select at least one customer');
      return;
    }
    const invoices = batchForm.customerIds.map((customerId, i) => ({
      customerId,
      invoiceNumber: `BATCH-${Date.now()}-${i + 1}`,
      date: batchForm.date,
      lines: [{
        description: batchForm.description || 'Services',
        quantity: 1,
        unitPrice: batchForm.unitPrice,
        accountId: incomeAccount?.id,
      }],
    }));
    try {
      await api('invoices.batch', { invoices });
      setShowBatch(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch invoicing failed');
    }
  };

  const invoiceSubtotalAmount = invoiceSubtotal(form.lines);
  const invoiceTaxAmount = calculateTaxAmount(invoiceSubtotalAmount, company.defaultTaxRate);
  const invoiceTotalAmount = invoiceSubtotalAmount + invoiceTaxAmount;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      draft: 'badge-muted',
      sent: 'badge-warning',
      paid: 'badge-success',
      void: 'badge-danger',
    };
    return <span className={`badge ${map[status] || 'badge-muted'}`}>{status}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Sales & Invoicing</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowBatch(true)}>Batch Invoice</button>
          <button className="btn btn-primary" onClick={() => {
            setForm(createInitialInvoiceForm(company));
            setShowForm(true);
            setShowNewCustomer(false);
          }}>New Invoice</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>New Invoice</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Customer</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <SearchSelect
                    items={customers}
                    value={form.customerId || null}
                    onChange={(customerId) => setForm({ ...form, customerId: customerId ?? '' })}
                    getItemId={(customer) => customer.id}
                    getItemLabel={(customer) => customer.name}
                    getItemSearchText={(customer) =>
                      [customer.name, customer.email, customer.phone].filter(Boolean).join(' ')
                    }
                    placeholder="Search customers..."
                    emptyMessage="No customers found"
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowNewCustomer((v) => !v)}
                >
                  {showNewCustomer ? 'Cancel' : '+ Add Customer'}
                </button>
              </div>
              {showNewCustomer && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Name</label>
                      <input
                        value={newCustomerForm.name}
                        onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })}
                        placeholder="Customer name"
                        autoFocus
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Email</label>
                      <input
                        type="email"
                        value={newCustomerForm.email}
                        onChange={(e) => setNewCustomerForm({ ...newCustomerForm, email: e.target.value })}
                        placeholder="email@example.com"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Phone</label>
                      <input
                        value={newCustomerForm.phone}
                        onChange={(e) => setNewCustomerForm({ ...newCustomerForm, phone: e.target.value })}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ marginTop: 12 }}
                    onClick={handleAddCustomer}
                  >
                    Save Customer
                  </button>
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Invoice Number</label>
              <input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => {
                  const date = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    date,
                    dueDate: company.defaultInvoiceDueDays != null
                      ? dueDateFromCompanyDefault(date, company.defaultInvoiceDueDays)
                      : prev.dueDate,
                  }));
                }}
              />
            </div>
            <div className="form-group">
              <label>Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label style={{ marginBottom: 0 }}>Line Items</label>
                <button type="button" className="btn btn-sm btn-secondary" onClick={addLine}>+ Add Line</button>
              </div>
              {inventoryItems.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label className="text-muted" style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>
                    Add from inventory
                  </label>
                  <SearchSelect
                    items={inventoryItems}
                    value={null}
                    onChange={(_, item) => {
                      if (item) addInventoryLine(item);
                    }}
                    getItemId={(item) => item.id}
                    getItemLabel={(item) =>
                      `${inventoryLineDescription(item)} — ${formatCurrency(item.salePrice)} (${item.quantityOnHand} on hand)`
                    }
                    getItemSearchText={(item) => `${item.name} ${item.sku ?? ''}`}
                    placeholder="Search inventory items..."
                    emptyMessage="No inventory items found"
                  />
                </div>
              )}
              <table className="line-items-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="text-right" style={{ width: 90 }}>Qty</th>
                    <th className="text-right" style={{ width: 120 }}>Unit Price</th>
                    <th className="text-right" style={{ width: 110 }}>Amount</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line) => (
                    <tr key={line.id}>
                      <td>
                        <input
                          value={line.description}
                          onChange={(e) => updateLine(line.id, { description: e.target.value })}
                          placeholder="Service or product"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={line.unitPrice}
                          onChange={(e) => updateLine(line.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="text-right font-mono">{formatCurrency(lineAmount(line))}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => removeLine(line.id)}
                          aria-label="Remove line"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="invoice-total-row">
                <span>Subtotal: {formatCurrency(invoiceSubtotalAmount)}</span>
                <span>
                  Tax{company.defaultTaxRate > 0 ? ` (${company.defaultTaxRate}%)` : ''}: {formatCurrency(invoiceTaxAmount)}
                </span>
                <span>Total: {formatCurrency(invoiceTotalAmount)}</span>
              </div>
              <p className="text-muted" style={{ marginTop: 8, fontSize: 13 }}>
                Tax rate comes from{' '}
                <Link to="/settings" className="btn-link">Settings</Link>
                {' '}({company.defaultTaxRate}%).
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleCreate}>Create Invoice</button>
            <button className="btn btn-secondary" onClick={() => { setShowForm(false); setShowNewCustomer(false); }}>Cancel</button>
          </div>
        </div>
      )}

      {showBatch && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Batch Invoice</h3>
          <div className="form-group">
            <label>Customers</label>
            {customers.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={batchForm.customerIds.includes(c.id)}
                  onChange={(e) => {
                    const ids = e.target.checked
                      ? [...batchForm.customerIds, c.id]
                      : batchForm.customerIds.filter((id) => id !== c.id);
                    setBatchForm({ ...batchForm, customerIds: ids });
                  }}
                />
                {c.name}
              </label>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Description</label>
              <input value={batchForm.description} onChange={(e) => setBatchForm({ ...batchForm, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Amount per customer</label>
              <input type="number" value={batchForm.unitPrice} onChange={(e) => setBatchForm({ ...batchForm, unitPrice: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleBatch}>Create Batch</button>
            <button className="btn btn-secondary" onClick={() => setShowBatch(false)}>Cancel</button>
          </div>
        </div>
      )}

      {showPayment && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Record Payment</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Date</label>
              <input type="date" value={paymentForm.date} onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Amount</label>
              <input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => handlePayment(showPayment)}>Record Payment</button>
            <button className="btn btn-secondary" onClick={() => setShowPayment(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        {invoices.length === 0 ? (
          <div className="empty-state">No invoices yet. Create your first invoice to get started.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="text-right">Total</th>
                <th className="text-right">Paid</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const customer = customers.find((c) => c.id === inv.customerId);
                return (
                  <tr key={inv.id}>
                    <td>{inv.invoiceNumber}</td>
                    <td>{inv.date}</td>
                    <td>{customer?.name ?? '—'}</td>
                    <td className="text-right font-mono">{formatCurrency(inv.total)}</td>
                    <td className="text-right font-mono">{formatCurrency(inv.amountPaid)}</td>
                    <td>{statusBadge(inv.status)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleExportPdf(inv)}
                        >
                          Export PDF
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleEmailClient(inv, customer)}
                        >
                          Email
                        </button>
                        {inv.status !== 'paid' && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => {
                              setShowPayment(inv.id);
                              setPaymentForm({ ...paymentForm, amount: inv.total - inv.amountPaid });
                            }}
                          >
                            Record Payment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="page-header" style={{ marginBottom: 16 }}>
          <h3>Customers</h3>
          <NewCustomerButton onCreated={load} />
        </div>
        {customers.length === 0 ? (
          <p className="text-muted">No customers yet.</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}><td>{c.name}</td><td>{c.email ?? '—'}</td><td>{c.phone ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function NewCustomerButton({ onCreated }: { onCreated: () => void }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    await api('customers.create', { name: name.trim(), email: email || null });
    setShow(false);
    setName('');
    setEmail('');
    onCreated();
  };

  if (!show) {
    return <button className="btn btn-sm btn-secondary" onClick={() => setShow(true)}>Add Customer</button>;
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: 140 }} />
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: 160 }} />
      <button className="btn btn-sm btn-primary" onClick={handleCreate}>Save</button>
      <button className="btn btn-sm btn-secondary" onClick={() => setShow(false)}>Cancel</button>
    </div>
  );
}
