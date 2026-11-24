import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/session';

export function RegisterPage() {
  const { session, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    organizationName: '',
    displayName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/workbooks" replace />;

  const update = (field: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register(form);
      navigate('/workbooks', { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : 'Registration failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit} aria-labelledby="register-title">
        <h1 id="register-title">Create your organization</h1>
        <label>
          Organization name
          <input
            required
            minLength={2}
            value={form.organizationName}
            onChange={update('organizationName')}
          />
        </label>
        <label>
          Your name
          <input required value={form.displayName} onChange={update('displayName')} />
        </label>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={form.email}
            onChange={update('email')}
          />
        </label>
        <label>
          Password (12+ characters)
          <input
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={update('password')}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create organization'}
        </button>
        <p className="muted">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
