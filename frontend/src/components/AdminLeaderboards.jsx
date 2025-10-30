import { useEffect } from 'react';
import { useLeaderboards } from '../hooks/useLeaderboards';
import { getAvailableGroups } from '../services/api';
import { useState } from 'react';

const AdminLeaderboards = () => {
  const {
    leaderboards,
    showModal,
    editingLeaderboard,
    form,
    setForm,
    fetchLeaderboards,
    openAddModal,
    openEditModal,
    saveLeaderboard,
    removeLeaderboard,
    toggleLeaderboardActive,
    toggleGroup,
    toggleColumn,
    closeModal
  } = useLeaderboards();

  const [userGroups, setUserGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await fetchLeaderboards();
      const groupsRes = await getAvailableGroups();
      setUserGroups(groupsRes.data.groups || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Fel vid laddning: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    try {
      await saveLeaderboard();
    } catch (error) {
      alert('Fel: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Säker på att du vill radera denna leaderboard?')) return;
    try {
      await removeLeaderboard(id);
    } catch (error) {
      alert('Fel: ' + error.message);
    }
  };

  if (isLoading) {
    return <div className="loading">Laddar leaderboards...</div>;
  }

  return (
    <div className="leaderboards-section">
      <div className="section-header">
        <h2>Leaderboards ({leaderboards.length})</h2>
        <button onClick={openAddModal} className="btn-primary">
          ➕ Skapa Leaderboard
        </button>
      </div>

      <div className="leaderboards-list">
        {leaderboards.map(lb => (
          <div key={lb.id} className="leaderboard-card">
            <div className="leaderboard-card-header">
              <h3>{lb.name}</h3>
              <div className="leaderboard-status">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={lb.active}
                    onChange={() => toggleLeaderboardActive(lb)}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <span className={lb.active ? 'status-active' : 'status-inactive'}>
                  {lb.active ? 'Aktiv' : 'Inaktiv'}
                </span>
              </div>
            </div>

            <div className="leaderboard-card-body">
              <div className="leaderboard-info">
                <span className="info-label">Period:</span>
                <span className="info-value">
                  {lb.timePeriod === 'day' && 'Dag'}
                  {lb.timePeriod === 'week' && 'Vecka'}
                  {lb.timePeriod === 'month' && 'Månad'}
                  {lb.timePeriod === 'custom' && 'Anpassad'}
                </span>
              </div>

              <div className="leaderboard-info">
                <span className="info-label">User Groups:</span>
                <span className="info-value">
                  {lb.userGroups?.length === 0 ? 'Alla agenter' : `${lb.userGroups.length} grupper`}
                </span>
              </div>

              {lb.timePeriod === 'custom' && (
                <>
                  <div className="leaderboard-info">
                    <span className="info-label">Start:</span>
                    <span className="info-value">{lb.customStartDate}</span>
                  </div>
                  <div className="leaderboard-info">
                    <span className="info-label">Slut:</span>
                    <span className="info-value">{lb.customEndDate}</span>
                  </div>
                </>
              )}
            </div>

            <div className="leaderboard-card-footer">
              <button onClick={() => openEditModal(lb)} className="btn-secondary">
                ✏️ Redigera
              </button>
              <button onClick={() => handleDelete(lb.id)} className="btn-danger">
                🗑️ Ta bort
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingLeaderboard ? 'Redigera' : 'Skapa'} Leaderboard</h2>

            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="T.ex. 'Dagens säljare'"
              />
            </div>

            <div className="form-group">
              <label>Tidsperiod:</label>
              <select
                value={form.timePeriod}
                onChange={(e) => setForm({ ...form, timePeriod: e.target.value })}
              >
                <option value="day">Dag</option>
                <option value="week">Vecka</option>
                <option value="month">Månad</option>
                <option value="custom">Anpassad</option>
              </select>
            </div>

            {form.timePeriod === 'custom' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Startdatum:</label>
                  <input
                    type="date"
                    value={form.customStartDate}
                    onChange={(e) => setForm({ ...form, customStartDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Slutdatum:</label>
                  <input
                    type="date"
                    value={form.customEndDate}
                    onChange={(e) => setForm({ ...form, customEndDate: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="form-group">
              <label>User Groups (tomt = alla agenter):</label>
              <div className="checkbox-group">
                {userGroups.map(group => (
                  <label key={group.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.userGroups.includes(group.id)}
                      onChange={() => toggleGroup(group.id)}
                    />
                    <span>{group.name} ({group.agentCount} agenter)</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>Synliga kolumner:</label>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.visibleColumns.deals}
                    onChange={() => toggleColumn('deals')}
                  />
                  <span>🎯 Antal affärer</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.visibleColumns.sms}
                    onChange={() => toggleColumn('sms')}
                  />
                  <span>📱 SMS</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.visibleColumns.commission}
                    onChange={() => toggleColumn('commission')}
                  />
                  <span>💰 Provision</span>
                </label>
              </div>
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
              <button onClick={closeModal} className="btn-secondary">
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

export default AdminLeaderboards;
