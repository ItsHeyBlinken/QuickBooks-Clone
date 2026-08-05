import { useState, useEffect } from 'react';
import { api } from '../api';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

interface Employee {
  id: string;
  name: string;
  payRate: number;
  payType: string;
}

interface PayrollRun {
  id: string;
  payDate: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalGross: number;
  totalNet: number;
  lines: Array<{
    employeeName: string;
    gross: number;
    net: number;
    deductions: Record<string, number>;
  }>;
}

export default function Payroll() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [empForm, setEmpForm] = useState({ name: '', payRate: 0, payType: 'hourly' });
  const [payForm, setPayForm] = useState({
    payDate: new Date().toISOString().slice(0, 10),
    periodStart: '',
    periodEnd: '',
    hours: {} as Record<string, number>,
  });

  const load = () => api<Employee[]>('payroll.employees', {}).then(setEmployees);
  useEffect(() => { load(); }, []);

  const handleAddEmployee = async () => {
    if (!empForm.name.trim()) return;
    await api('payroll.createEmployee', empForm);
    setShowEmployeeForm(false);
    setEmpForm({ name: '', payRate: 0, payType: 'hourly' });
    load();
  };

  const handleCalculate = async () => {
    const entries = employees.map((e) => ({
      employeeId: e.id,
      hours: payForm.hours[e.id] ?? 0,
    }));
    const result = await api<PayrollRun>('payroll.calculate', {
      payDate: payForm.payDate,
      periodStart: payForm.periodStart,
      periodEnd: payForm.periodEnd,
      entries,
    });
    setRun(result);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Payroll Calculator</h1>
        <button className="btn btn-secondary" onClick={() => setShowEmployeeForm(true)}>Add Employee</button>
      </div>

      <p className="text-muted" style={{ marginBottom: 24 }}>
        Calculates withholdings and generates journal entries. Does not file taxes or process direct deposit.
      </p>

      {showEmployeeForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Add Employee</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Name</label>
              <input value={empForm.name} onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Pay Rate</label>
              <input type="number" value={empForm.payRate} onChange={(e) => setEmpForm({ ...empForm, payRate: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="form-group">
              <label>Pay Type</label>
              <select value={empForm.payType} onChange={(e) => setEmpForm({ ...empForm, payType: e.target.value })}>
                <option value="hourly">Hourly</option>
                <option value="salary">Salary</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={handleAddEmployee}>Save</button>
            <button className="btn btn-secondary" onClick={() => setShowEmployeeForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>Run Payroll</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="form-group">
            <label>Pay Date</label>
            <input type="date" value={payForm.payDate} onChange={(e) => setPayForm({ ...payForm, payDate: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Period Start</label>
            <input type="date" value={payForm.periodStart} onChange={(e) => setPayForm({ ...payForm, periodStart: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Period End</label>
            <input type="date" value={payForm.periodEnd} onChange={(e) => setPayForm({ ...payForm, periodEnd: e.target.value })} />
          </div>
        </div>

        {employees.length > 0 && (
          <table style={{ marginBottom: 16 }}>
            <thead><tr><th>Employee</th><th>Rate</th><th>Hours</th></tr></thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{formatCurrency(e.payRate)}/{e.payType === 'hourly' ? 'hr' : 'period'}</td>
                  <td>
                    <input
                      type="number"
                      style={{ width: 80 }}
                      value={payForm.hours[e.id] ?? ''}
                      onChange={(ev) => setPayForm({ ...payForm, hours: { ...payForm.hours, [e.id]: parseFloat(ev.target.value) || 0 } })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button className="btn btn-primary" onClick={handleCalculate} disabled={employees.length === 0}>
          Calculate Payroll
        </button>
      </div>

      {run && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>Payroll Summary — {run.payDate}</h3>
          <table>
            <thead><tr><th>Employee</th><th className="text-right">Gross</th><th className="text-right">Deductions</th><th className="text-right">Net</th></tr></thead>
            <tbody>
              {run.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.employeeName}</td>
                  <td className="text-right font-mono">{formatCurrency(l.gross)}</td>
                  <td className="text-right font-mono">{formatCurrency(l.gross - l.net)}</td>
                  <td className="text-right font-mono">{formatCurrency(l.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 600 }}>
                <td>Total</td>
                <td className="text-right font-mono">{formatCurrency(run.totalGross)}</td>
                <td></td>
                <td className="text-right font-mono">{formatCurrency(run.totalNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
