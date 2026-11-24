import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { PendingPage } from './pages/PendingPage';
import { RegisterPage } from './pages/RegisterPage';
import { WorkbookPage } from './pages/workbook/WorkbookPage';
import { WorkbooksPage } from './pages/WorkbooksPage';
import { RequireAuth } from './routes/RequireAuth';
import { NAV_ITEMS } from './routes/navigation';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/workbooks" element={<WorkbooksPage />} />
        <Route path="/workbooks/:workbookId" element={<WorkbookPage />} />
        {NAV_ITEMS.filter((item) => item.status === 'planned').map((item) => (
          <Route key={item.path} path={item.path} element={<PendingPage item={item} />} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/workbooks" replace />} />
    </Routes>
  );
}
