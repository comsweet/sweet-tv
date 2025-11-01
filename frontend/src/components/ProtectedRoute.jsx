import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, user, hasRole } = useAuth();

  // Show loading state while checking auth
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        fontSize: '1.5rem'
      }}>
        ⏳ Laddar...
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Authenticated but wrong role - show access denied
  if (allowedRoles && !hasRole(allowedRoles)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '4rem', margin: '0' }}>🚫</h1>
        <h2 style={{ marginTop: '20px' }}>Access Denied</h2>
        <p style={{ color: '#7f8c8d' }}>
          Du har inte behörighet att se denna sida.
        </p>
        <p style={{ color: '#95a5a6', fontSize: '0.9rem', marginTop: '10px' }}>
          Din roll: <strong>{user?.role}</strong>
          <br />
          Krävs: <strong>{allowedRoles.join(' eller ')}</strong>
        </p>
      </div>
    );
  }

  // All checks passed - render children
  return children;
};

export default ProtectedRoute;
