import { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const AdminUserManagement = () => {
  const { user: currentUser } = useContext(AuthContext);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // New user form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    name: '',
    role: 'admin'
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');

      const response = await axios.get(`${API_BASE_URL}/auth/users`);
      setUsers(response.data.users);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setError('Kunde inte hämta användare');
    } finally {
      setLoading(false);
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      await axios.post(`${API_BASE_URL}/auth/users`, newUser);

      setSuccess(`Användare ${newUser.email} skapad!`);
      setNewUser({ email: '', password: '', name: '', role: 'admin' });
      setShowCreateForm(false);
      fetchUsers();
    } catch (err) {
      console.error('Create user error:', err);
      setError(err.response?.data?.error || 'Kunde inte skapa användare');
    }
  };

  const toggleUserActive = async (userId, currentActive) => {
    try {
      await axios.put(`${API_BASE_URL}/auth/users/${userId}`, {
        active: !currentActive
      });

      setSuccess('Användare uppdaterad');
      fetchUsers();
    } catch (err) {
      console.error('Toggle user error:', err);
      setError(err.response?.data?.error || 'Kunde inte uppdatera användare');
    }
  };

  const deleteUser = async (userId, userEmail) => {
    if (!confirm(`Är du säker på att du vill ta bort användaren ${userEmail}?`)) {
      return;
    }

    try {
      await axios.delete(`${API_BASE_URL}/auth/users/${userId}`);

      setSuccess(`Användare ${userEmail} borttagen`);
      fetchUsers();
    } catch (err) {
      console.error('Delete user error:', err);
      setError(err.response?.data?.error || 'Kunde inte ta bort användare');
    }
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'superadmin': return '#9c27b0';
      case 'admin': return '#2196f3';
      case 'tv-user': return '#4caf50';
      default: return '#9e9e9e';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="admin-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ color: '#005A9C', margin: 0 }}>👥 Användarhantering</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          style={{
            padding: '10px 20px',
            background: showCreateForm ? '#666' : 'linear-gradient(135deg, #005A9C 0%, #00B2E3 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          {showCreateForm ? '✕ Avbryt' : '+ Skapa Användare'}
        </button>
      </div>

      {error && (
        <div style={{
          background: '#fee',
          color: '#c33',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          background: '#e8f5e9',
          color: '#2e7d32',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          {success}
        </div>
      )}

      {/* Create User Form */}
      {showCreateForm && (
        <div style={{
          background: 'white',
          padding: '24px',
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <h3 style={{ color: '#333', marginTop: 0, marginBottom: '20px' }}>Skapa Ny Användare</h3>

          <form onSubmit={createUser} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '16px'
          }}>
            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px'
              }}>
                Email
              </label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                required
                placeholder="email@sweet-communication.com"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '2px solid #e0e0e0',
                  fontSize: '15px'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px'
              }}>
                Namn
              </label>
              <input
                type="text"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                required
                placeholder="För- och efternamn"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '2px solid #e0e0e0',
                  fontSize: '15px'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px'
              }}>
                Lösenord
              </label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                required
                minLength={6}
                placeholder="Minst 6 tecken"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '2px solid #e0e0e0',
                  fontSize: '15px'
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontWeight: '600',
                fontSize: '14px'
              }}>
                Roll
              </label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                required
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '2px solid #e0e0e0',
                  fontSize: '15px'
                }}
              >
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
                <option value="tv-user" style={{ color: '#999', fontStyle: 'italic' }}>TV-User (deprecated)</option>
              </select>
              {newUser.role === 'tv-user' && (
                <div style={{ fontSize: '12px', color: '#ff9800', marginTop: '4px' }}>
                  ⚠️ TV-User är deprecated. Använd TV Access Codes istället.
                </div>
              )}
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="submit"
                style={{
                  padding: '10px 24px',
                  background: 'linear-gradient(135deg, #005A9C 0%, #00B2E3 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '600'
                }}
              >
                Skapa Användare
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                style={{
                  padding: '10px 24px',
                  background: '#666',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '15px'
                }}
              >
                Avbryt
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Laddar användare...
        </div>
      ) : users.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          Inga användare hittades
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: 'white',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <thead>
              <tr style={{ background: '#005A9C', color: 'white' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Namn</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Email</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Roll</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Status</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Skapad</th>
                <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px', fontSize: '14px', fontWeight: '600' }}>
                    {user.name}
                    {user.id === currentUser?.id && (
                      <span style={{
                        marginLeft: '8px',
                        fontSize: '11px',
                        color: '#00B2E3',
                        fontWeight: '600'
                      }}>
                        (Du)
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '12px', fontSize: '14px' }}>
                    {user.email}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      background: getRoleBadgeColor(user.role),
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {user.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{
                      background: user.active ? '#4caf50' : '#f44336',
                      color: 'white',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {user.active ? 'AKTIV' : 'INAKTIV'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontSize: '13px', color: '#666' }}>
                    {formatDate(user.created_at)}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => toggleUserActive(user.id, user.active)}
                        style={{
                          padding: '6px 12px',
                          background: user.active ? '#ff9800' : '#4caf50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        {user.active ? 'Inaktivera' : 'Aktivera'}
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => deleteUser(user.id, user.email)}
                          style={{
                            padding: '6px 12px',
                            background: '#f44336',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '13px'
                          }}
                        >
                          Ta bort
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminUserManagement;
