import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest, ApiRequestError } from '../api/client';
import { can, useAuth } from '../auth/session';

interface WorkbookSummary {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly updatedAt: string;
}

export function WorkbooksPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [workbooks, setWorkbooks] = useState<WorkbookSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    apiRequest<WorkbookSummary[]>('GET', '/api/v1/workbooks?limit=100')
      .then((result) => setWorkbooks(result.data))
      .catch((err: unknown) =>
        setError(err instanceof ApiRequestError ? err.message : 'Could not load workbooks.'),
      );
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      const result = await apiRequest<{ id: string }>('POST', '/api/v1/workbooks', {
        name: name.trim(),
      });
      navigate(`/workbooks/${result.data.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create the workbook.');
    }
  };

  return (
    <section className="page">
      <header className="page-header">
        <h1>Workbooks</h1>
        {can(session, 'workbook:create') && (
          <form className="inline-form" onSubmit={create}>
            <input
              aria-label="New workbook name"
              placeholder="New workbook name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
            />
            <button className="button primary" type="submit">
              Create
            </button>
          </form>
        )}
      </header>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {workbooks === null && !error && <p role="status">Loading…</p>}
      {workbooks?.length === 0 && (
        <p className="muted">No workbooks yet. Create one to get started.</p>
      )}
      {workbooks && workbooks.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Revision</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {workbooks.map((wb) => (
              <tr key={wb.id}>
                <td>
                  <Link to={`/workbooks/${wb.id}`}>{wb.name}</Link>
                </td>
                <td>{wb.revision}</td>
                <td>{new Date(wb.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
