import { useState, useEffect } from 'react';
import { api } from '../api';

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
}

export default function Inventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', costPerUnit: 0, salePrice: 0, quantityOnHand: 0 });

  const load = () => api<InventoryItem[]>('inventory.list', {}).then(setItems);
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    await api('inventory.create', form);
    setShowForm(false);
    setForm({ name: '', sku: '', costPerUnit: 0, salePrice: 0, quantityOnHand: 0 });
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Inventory</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>Add Item</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>New Inventory Item</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>SKU</label>
              <input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Cost per Unit</label>
              <input type="number" value={form.costPerUnit} onChange={(e) => setForm({ ...form, costPerUnit: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Sales Price</label>
              <input type="number" value={form.salePrice} onChange={(e) => setForm({ ...form, salePrice: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Quantity on Hand</label>
              <input type="number" value={form.quantityOnHand} onChange={(e) => setForm({ ...form, quantityOnHand: parseFloat(e.target.value) || 0 })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleCreate}>Save</button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        {items.length === 0 ? (
          <div className="empty-state">No inventory items yet.</div>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>SKU</th><th className="text-right">Qty on Hand</th><th className="text-right">Cost/Unit</th><th className="text-right">Sales Price</th><th className="text-right">Value</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>{item.sku ?? '—'}</td>
                  <td className="text-right">{item.quantityOnHand}</td>
                  <td className="text-right font-mono">{formatCurrency(item.costPerUnit)}</td>
                  <td className="text-right font-mono">{formatCurrency(item.salePrice)}</td>
                  <td className="text-right font-mono">{formatCurrency(item.quantityOnHand * item.costPerUnit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
