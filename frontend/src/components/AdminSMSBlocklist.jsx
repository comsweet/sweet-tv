import { useState, useEffect } from 'react';
import { getUserGroups, getSMSBlocklist, addToSMSBlocklist, removeFromSMSBlocklist } from '../services/api';
import './AdminSMSBlocklist.css';

const AdminSMSBlocklist = () => {
  const [userGroups, setUserGroups] = useState([]);
  const [blocklist, setBlocklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedGroupName, setSelectedGroupName] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [groupsRes, blocklistRes] = await Promise.all([
        getUserGroups(),
        getSMSBlocklist()
      ]);

      setUserGroups(groupsRes.data || []);
      setBlocklist(blocklistRes.data.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Fel vid laddning: ' + error.message);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!selectedGroupId || !selectedGroupName) {
      alert('Välj en grupp att blockera');
      return;
    }

    try {
      await addToSMSBlocklist(selectedGroupId, selectedGroupName);
      setSelectedGroupId('');
      setSelectedGroupName('');
      await loadData();
    } catch (error) {
      alert('Fel: ' + error.response?.data?.error || error.message);
    }
  };

  const handleRemove = async (id) => {
    if (!confirm('Säker på att du vill ta bort denna grupp från blocklistan?')) return;

    try {
      await removeFromSMSBlocklist(id);
      await loadData();
    } catch (error) {
      alert('Fel: ' + error.message);
    }
  };

  const handleGroupSelect = (e) => {
    const groupId = e.target.value;
    setSelectedGroupId(groupId);

    const group = userGroups.find(g => String(g.id) === String(groupId));
    setSelectedGroupName(group?.name || '');
  };

  // Filter out groups that are already in blocklist
  const availableGroups = userGroups.filter(
    g => !blocklist.some(b => String(b.group_id) === String(g.id))
  );

  if (loading) {
    return <div className="loading">Laddar SMS blocklist...</div>;
  }

  return (
    <div className="admin-sms-blocklist">
      <div className="sms-blocklist-header">
        <h2>📵 SMS Notification Blocklist</h2>
        <p className="description">
          Grupper i denna lista kommer INTE att visa SMS-notifikationer på TV-skärmarna.
          SMS från alla andra grupper visas globalt på alla slideshows.
        </p>
      </div>

      {/* Add Group Section */}
      <div className="add-group-section">
        <h3>➕ Lägg till grupp</h3>
        <div className="add-group-form">
          <select
            value={selectedGroupId}
            onChange={handleGroupSelect}
            className="group-select"
          >
            <option value="">Välj grupp att blockera...</option>
            {availableGroups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <button
            onClick={handleAdd}
            disabled={!selectedGroupId}
            className="btn-add"
          >
            Blockera
          </button>
        </div>
        {availableGroups.length === 0 && (
          <p className="hint">Alla grupper är redan blockerade</p>
        )}
      </div>

      {/* Blocklist Table */}
      <div className="blocklist-section">
        <h3>🚫 Blockerade grupper ({blocklist.length})</h3>
        {blocklist.length === 0 ? (
          <div className="no-blocklist">
            Inga grupper blockerade. SMS från alla grupper visas på TV-skärmarna.
          </div>
        ) : (
          <table className="blocklist-table">
            <thead>
              <tr>
                <th>Grupp ID</th>
                <th>Gruppnamn</th>
                <th>Blockerad sedan</th>
                <th>Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {blocklist.map(item => (
                <tr key={item.id}>
                  <td className="group-id">{item.group_id}</td>
                  <td className="group-name">
                    <strong>{item.group_name}</strong>
                  </td>
                  <td className="created-at">
                    {new Date(item.created_at).toLocaleDateString('sv-SE', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="actions">
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="btn-remove"
                      title="Ta bort från blocklist"
                    >
                      🗑️ Ta bort
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Info Box */}
      <div className="info-box">
        <h4>ℹ️ Information</h4>
        <ul>
          <li>SMS-notifikationer visas globalt i övre vänstra hörnet på alla TV-skärmar</li>
          <li>Endast grupper som INTE är i denna blocklist kommer att visa notifikationer</li>
          <li>Ändringar träder i kraft omedelbart</li>
          <li>SMS-data påverkas inte, endast visningen på TV-skärmarna</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminSMSBlocklist;
