import { useState, useEffect } from 'react';
import { getUsers, createUser, updateUser, deleteUser } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './AdminUserManagement.css';

const AdminUserManagement = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    role: 'admin',
    active: true
  });
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const response = await getUsers();
      setUsers(response.data.users);
    } catch (error) {
      console.error('Error fetching users:', error);
      setMessage({ type: 'error', text: 'Fel vid hämtning av användare' });
    }
    setIsLoading(false);
  };

  const openAddModal = () => {
    setEditingUser(null);
    setForm({
      email: '',
      password: '',
      name: '',
      role: 'admin',
      active: true
    });
    setShowModal(true);
    setMessage(null);
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setForm({
      email: user.email,
      password: '', // Don't show password
      name: user.name,
      role: user.role,
      active: user.active
    });
    setShowModal(true);
    setMessage(null);
  };

  const handleSave = async () => {
    setMessage(null);

    // Validation
    if (!form.email || !form.name || !form.role) {
      setMessage({ type: 'error', text: 'Email, namn och roll krävs' });
      return;
    }

    if (!editingUser && !form.password) {
      setMessage({ type: 'error', text: 'Lösenord krävs för nya användare' });
      return;
    }

    if (form.password && form.password.length < 6) {
      setMessage({ type: 'error', text: 'Lösenord måste vara minst 6 tecken' });
      return;
    }

    try {
      if (editingUser) {
        // Update existing user
        const updateData = {
          name: form.name,
          role: form.role,
          active: form.active
        };

        // Only include password if it's changed
        if (form.password) {
          updateData.password = form.password;
        }

        await updateUser(editingUser.id, updateData);
        setMessage({ type: 'success', text: 'Användare uppdaterad!' });
      } else {
        // Create new user
        await createUser(form);
        setMessage({ type: 'success', text: 'Användare skapad!' });
      }

      setShowModal(false);
      await fetchUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fel vid sparande av användare'
      });
    }
  };

  const handleDelete = async (user) => {
    if (!confirm(`Säker på att du vill radera ${user.name}?`)) return;

    try {
      await deleteUser(user.id);
      setMessage({ type: 'success', text: 'Användare raderad!' });
      await fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.error || 'Fel vid radering av användare'
      });
    }
  };

  const getRoleBadge = (role) => {
    const badges = {
      superadmin: { emoji: '👑', label: 'Superadmin', class: 'role-superadmin' },
      admin: { emoji: '⚙️', label: 'Admin', class: 'role-admin' },
      'tv-user': { emoji: '📺', label: 'TV User', class: 'role-tv-user' }
    };
    return badges[role] || badges['tv-user'];
  };

  if (isLoading) {
    return <div className="loading">⏳ Laddar användare...</div>;
  }

  return (
    <div className="admin-user-management">
      <div className="users-header">
        <div>
          <h2>👥 Användarhantering</h2>
          <p className="description">Hantera användare och deras behörigheter (endast Superadmin)</p>
        </div>
        <button onClick={openAddModal} className="btn-primary">
          ➕ Skapa Användare
        </button>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {users.length === 0 ? (
        <div className="no-users">Inga användare hittades</div>
      ) : (
        <table className="users-table">
          <thead>
            <tr>
              <th>Namn</th>
              <th>Email</th>
              <th>Roll</th>
              <th>Status</th>
              <th>Skapad</th>
              <th>Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const badge = getRoleBadge(user.role);
              const isCurrentUser = user.id === currentUser?.id;

              return (
                <tr key={user.id} className={!user.active ? 'inactive' : ''}>
                  <td>
                    <strong>{user.name}</strong>
                    {isCurrentUser && <span className="you-badge">Du</span>}
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`role-badge ${badge.class}`}>
                      {badge.emoji} {badge.label}
                    </span>
                  </td>
                  <td>
                    {user.active ? (
                      <span className="status-active">✅ Aktiv</span>
                    ) : (
                      <span className="status-inactive">⛔ Inaktiv</span>
                    )}
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString('sv-SE')}</td>
                  <td className="actions-cell">
                    <button
                      onClick={() => openEditModal(user)}
                      className="btn-edit"
                      title="Redigera"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDelete(user)}
                      className="btn-delete"
                      title="Radera"
                      disabled={isCurrentUser}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingUser ? 'Redigera Användare' : 'Skapa Användare'}</h2>

            {message && (
              <div className={`message ${message.type}`}>
                {message.text}
              </div>
            )}

            <div className="form-group">
              <label>Email:</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="user@example.com"
                disabled={editingUser} // Can't change email
              />
            </div>

            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="John Doe"
              />
            </div>

            <div className="form-group">
              <label>Lösenord {editingUser && '(lämna tomt för att behålla)'} :</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={editingUser ? 'Lämna tomt för att behålla' : 'Minst 6 tecken'}
              />
            </div>

            <div className="form-group">
              <label>Roll:</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="superadmin">👑 Superadmin (full access)</option>
                <option value="admin">⚙️ Admin (no user management)</option>
                <option value="tv-user">📺 TV User (view only)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                <span>Aktiv</span>
              </label>
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                Avbryt
              </button>
              <button onClick={handleSave} className="btn-primary">
                Spara
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserManagement;
