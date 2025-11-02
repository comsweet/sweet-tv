import { useEffect } from 'react';
import { useLeaderboards } from '../hooks/useLeaderboards';
import { getAvailableGroups } from '../services/api';
import { useState } from 'react';
import './AdminLeaderboards.css';

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
    moveColumn,
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

  const getPeriodLabel = (timePeriod) => {
    const labels = {
      day: 'Dag',
      week: 'Vecka',
      month: 'Månad',
      custom: 'Anpassad'
    };
    return labels[timePeriod] || timePeriod;
  };

  const getVisibleColumnsLabel = (visibleColumns) => {
    const cols = [];
    if (visibleColumns.deals) cols.push('🎯');
    if (visibleColumns.sms) cols.push('📱');
    if (visibleColumns.commission) cols.push('💰');
    if (visibleColumns.campaignBonus) cols.push('💸');
    if (visibleColumns.total) cols.push('💎');
    return cols.length > 0 ? cols.join(' ') : '-';
  };

  if (isLoading) {
    return <div className="loading">Laddar leaderboards...</div>;
  }

  return (
    <div className="admin-leaderboards-compact">
      <div className="leaderboards-header">
        <h2>📊 Leaderboards ({leaderboards.length})</h2>
        <button onClick={openAddModal} className="btn-primary">
          ➕ Skapa Leaderboard
        </button>
      </div>

      {leaderboards.length === 0 ? (
        <div className="no-leaderboards">
          Inga leaderboards skapade än. Klicka på "Skapa Leaderboard" för att komma igång!
        </div>
      ) : (
        <table className="leaderboards-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Namn</th>
              <th>Period</th>
              <th>Grupper</th>
              <th>Kolumner</th>
              <th>Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {leaderboards.map(lb => (
              <tr key={lb.id} className={lb.active ? 'row-active' : 'row-inactive'}>
                <td className="status-cell">
                  <label className="toggle-switch-compact">
                    <input
                      type="checkbox"
                      checked={lb.active}
                      onChange={() => toggleLeaderboardActive(lb)}
                    />
                    <span className="toggle-slider-compact"></span>
                  </label>
                </td>
                <td className="name-cell">
                  <strong>{lb.name}</strong>
                  {lb.timePeriod === 'custom' && (
                    <div className="date-range">
                      {lb.customStartDate} → {lb.customEndDate}
                    </div>
                  )}
                </td>
                <td className="period-cell">
                  <span className="period-badge">{getPeriodLabel(lb.timePeriod)}</span>
                </td>
                <td className="groups-cell">
                  {lb.userGroups?.length === 0 ? (
                    <span className="groups-all">Alla agenter</span>
                  ) : (
                    <span className="groups-count">{lb.userGroups.length} grupper</span>
                  )}
                </td>
                <td className="columns-cell">
                  <span className="columns-icons">{getVisibleColumnsLabel(lb.visibleColumns)}</span>
                </td>
                <td className="actions-cell">
                  <button onClick={() => openEditModal(lb)} className="btn-edit" title="Redigera">
                    ✏️
                  </button>
                  <button onClick={() => handleDelete(lb.id)} className="btn-delete" title="Ta bort">
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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

            <div className="form-group">
              <label>Visa per:</label>
              <select
                value={form.displayMode}
                onChange={(e) => setForm({ ...form, displayMode: e.target.value })}
              >
                <option value="individual">👤 Individuella agenter</option>
                <option value="groups">👥 User Groups (aggregerat)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Ranking baserad på:</label>
              <select
                value={form.sortBy}
                onChange={(e) => setForm({ ...form, sortBy: e.target.value })}
              >
                <option value="commission">💰 Provision</option>
                <option value="total">💎 Total (Provision + Kampanjbonus)</option>
                <option value="dealCount">🎯 Antal Affärer</option>
              </select>
            </div>

            <div className="form-group">
              <label>Visa top N (tom = alla):</label>
              <select
                value={form.topN || ''}
                onChange={(e) => setForm({ ...form, topN: e.target.value ? parseInt(e.target.value) : null })}
              >
                <option value="">Alla</option>
                <option value="3">Top 3</option>
                <option value="5">Top 5</option>
                <option value="10">Top 10</option>
                <option value="15">Top 15</option>
                <option value="20">Top 20</option>
              </select>
            </div>

            <div className="form-group">
              <label>Visualiseringsläge:</label>
              <select
                value={form.visualizationMode}
                onChange={(e) => setForm({ ...form, visualizationMode: e.target.value })}
              >
                <option value="table">📋 Klassisk Tabell</option>
                <option value="cards">🎴 Card Layout</option>
                <option value="progress">📊 Progress Bars</option>
                <option value="rocket">🚀 Raket-Race</option>
                <option value="race">🏃 Löpar-Race</option>
              </select>
            </div>

            {/* Goal settings for race modes */}
            {(form.visualizationMode === 'rocket' || form.visualizationMode === 'race' || form.visualizationMode === 'progress') && (
              <>
                <div className="form-group">
                  <label>Mål-rubrik (valfri):</label>
                  <input
                    type="text"
                    value={form.goalLabel}
                    onChange={(e) => setForm({ ...form, goalLabel: e.target.value })}
                    placeholder="T.ex. 'Race mot 100k!' eller 'Spring till målet!'"
                  />
                  <small>Lämna tom för att använda standardtext</small>
                </div>

                <div className="form-group">
                  <label>Målvärde (valfri):</label>
                  <input
                    type="number"
                    value={form.goalValue || ''}
                    onChange={(e) => setForm({ ...form, goalValue: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="T.ex. 100000"
                  />
                  <small>Lämna tom för att använda högsta värde automatiskt</small>
                </div>
              </>
            )}

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
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.visibleColumns.campaignBonus}
                    onChange={() => toggleColumn('campaignBonus')}
                  />
                  <span>💸 Kampanjbonus</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.visibleColumns.total}
                    onChange={() => toggleColumn('total')}
                  />
                  <span>💎 Total (Provision + Bonus)</span>
                </label>
              </div>
            </div>

            {/* Column Order */}
            <div className="form-group">
              <label>Kolumnordning (Rank & Agent alltid först):</label>
              <div className="column-order-list">
                {form.columnOrder.map((colName, index) => {
                  const columnLabels = {
                    deals: '🎯 Affärer',
                    sms: '📱 SMS',
                    commission: '💰 Provision',
                    campaignBonus: '💸 Kampanjbonus',
                    total: '💎 Total'
                  };

                  return (
                    <div key={colName} className="column-order-item">
                      <span className="column-position">#{index + 1}</span>
                      <span className="column-name">{columnLabels[colName]}</span>
                      <div className="column-order-controls">
                        <button
                          type="button"
                          className="btn-move"
                          onClick={() => moveColumn(colName, 'up')}
                          disabled={index === 0}
                          title="Flytta upp"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="btn-move"
                          onClick={() => moveColumn(colName, 'down')}
                          disabled={index === form.columnOrder.length - 1}
                          title="Flytta ner"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <small>Använd pilarna för att ändra ordningen som kolumnerna visas på slideshow.</small>
            </div>

            <div className="form-group">
              <label>Visuella element:</label>
              <div className="checkbox-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.showGraphs}
                    onChange={(e) => setForm({ ...form, showGraphs: e.target.checked })}
                  />
                  <span>📈 Visa grafer och diagram</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.showGap}
                    onChange={(e) => setForm({ ...form, showGap: e.target.checked })}
                  />
                  <span>📏 Visa gap till ledare</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.showMiniStats}
                    onChange={(e) => setForm({ ...form, showMiniStats: e.target.checked })}
                  />
                  <span>📊 Visa team mini-stats</span>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={form.enableAutoScroll}
                    onChange={(e) => setForm({ ...form, enableAutoScroll: e.target.checked })}
                  />
                  <span>🔄 Auto-scroll (för Race, Cards & Progress)</span>
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
