import { useEffect } from 'react';
import { useLeaderboards } from '../hooks/useLeaderboards';
import { getAvailableGroups, migrateLeaderboardsDealsPerHour, getLogosLibrary, uploadLogoToLibrary, deleteLogoFromLibrary } from '../services/api';
import { useState } from 'react';
import MetricsGridConfigForm from './MetricsGridConfigForm';
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
  const [logosLibrary, setLogosLibrary] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showLogosManagement, setShowLogosManagement] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await fetchLeaderboards();
      const groupsRes = await getAvailableGroups();
      setUserGroups(groupsRes.data.groups || []);

      // Load logos library
      const logosRes = await getLogosLibrary();
      setLogosLibrary(logosRes.data.logos || []);
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

  const handleMigrateDealsPerHour = async () => {
    if (!confirm('🔄 Detta kommer att lägga till "Affärer/timme" (order/h) kolumn i alla befintliga leaderboards.\n\nFortsätta?')) return;

    setIsLoading(true);
    try {
      const result = await migrateLeaderboardsDealsPerHour();
      alert(`✅ Migration klar!\n\nTotalt: ${result.data.totalLeaderboards}\nUppdaterade: ${result.data.updatedCount}`);
      await fetchLeaderboards(); // Reload to show changes
    } catch (error) {
      alert('❌ Migrations-fel: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Logo management handlers
  const handleUploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = prompt('Namn på logotypen (t.ex. "Sweet TV", "Företag AB"):');
    if (!name) return;

    const formData = new FormData();
    formData.append('logo', file);
    formData.append('name', name);

    setIsLoading(true);
    try {
      await uploadLogoToLibrary(formData);
      alert(`✅ Logotyp "${name}" uppladdad!`);
      await loadData(); // Reload logos
    } catch (error) {
      alert('❌ Uppladdningsfel: ' + error.message);
    } finally {
      setIsLoading(false);
      e.target.value = ''; // Reset file input
    }
  };

  const handleDeleteLogo = async (logoId, logoName) => {
    if (!confirm(`🗑️ Radera logotyp "${logoName}"?\n\nObs: Kan inte raderas om den används av någon leaderboard.`)) return;

    setIsLoading(true);
    try {
      await deleteLogoFromLibrary(logoId);
      alert(`✅ Logotyp "${logoName}" raderad!`);
      await loadData(); // Reload logos
    } catch (error) {
      alert('❌ Raderingsfel: ' + error.message);
    } finally {
      setIsLoading(false);
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

  const getTrendPeriodLabel = (trendDays, trendHours) => {
    if (trendHours) {
      if (trendHours === 1) return 'Senaste timmen';
      if (trendHours === 24) return 'Idag (24h)';
      return `${trendHours} timmar`;
    }
    if (trendDays === 1) return 'Idag (24h)';
    if (trendDays === 7) return 'Denna vecka (7 dagar)';
    if (trendDays === 30) return 'Denna månad (30 dagar)';
    if (trendDays === 90) return 'Senaste kvartalet (90 dagar)';
    if (trendDays === 365) return 'Senaste året (365 dagar)';
    return `${trendDays} dagar`;
  };

  const getVisibleColumnsLabel = (visibleColumns) => {
    const cols = [];
    if (visibleColumns.dealsPerHour) cols.push('🕒');
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleMigrateDealsPerHour}
            className="btn-primary"
            style={{ background: '#f59e0b' }}
            title="Lägg till order/h kolumn i alla befintliga leaderboards"
          >
            🔄 Migrera Order/h
          </button>
          <button onClick={openAddModal} className="btn-primary">
            ➕ Skapa Leaderboard
          </button>
        </div>
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
              <th>Typ</th>
              <th>Namn</th>
              <th>Period/Grupper</th>
              <th>Info</th>
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
                <td className="type-cell">
                  <span className="type-badge" style={{
                    background: lb.type === 'metrics-grid' ? '#dbeafe' :
                               lb.type === 'team-battle' ? '#fef3c7' :
                               lb.type === 'trend-chart' ? '#dcfce7' : '#f3f4f6',
                    color: lb.type === 'metrics-grid' ? '#1e40af' :
                           lb.type === 'team-battle' ? '#92400e' :
                           lb.type === 'trend-chart' ? '#166534' : '#374151',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    fontWeight: '500'
                  }}>
                    {lb.type === 'metrics-grid' ? '📈 Grid' :
                     lb.type === 'team-battle' ? '⚔️ Battle' :
                     lb.type === 'trend-chart' ? '📉 Trend' : '📊 Standard'}
                  </span>
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
                  {lb.type === 'metrics-grid' ? (
                    // Metrics Grid: Show selected groups
                    <span className="groups-count">
                      {lb.selectedGroups?.length || 0} grupper
                    </span>
                  ) : lb.type === 'trend-chart' ? (
                    // Trend Chart: Show trend period based on trendDays/trendHours
                    <>
                      <span className="period-badge">{getTrendPeriodLabel(lb.trendDays, lb.trendHours)}</span>
                      <br />
                      {lb.userGroups?.length === 0 ? (
                        <span className="groups-all" style={{ fontSize: '0.85rem' }}>Alla</span>
                      ) : (
                        <span className="groups-count" style={{ fontSize: '0.85rem' }}>
                          {lb.userGroups.length} grupper
                        </span>
                      )}
                    </>
                  ) : (
                    // Standard: Show period
                    <>
                      <span className="period-badge">{getPeriodLabel(lb.timePeriod)}</span>
                      <br />
                      {lb.userGroups?.length === 0 ? (
                        <span className="groups-all" style={{ fontSize: '0.85rem' }}>Alla</span>
                      ) : (
                        <span className="groups-count" style={{ fontSize: '0.85rem' }}>
                          {lb.userGroups.length} grupper
                        </span>
                      )}
                    </>
                  )}
                </td>
                <td className="columns-cell">
                  {lb.type === 'metrics-grid' ? (
                    // Metrics Grid: Show metrics count
                    <span className="metrics-count">
                      {lb.metrics?.length || 0} metrics
                    </span>
                  ) : (
                    // Standard: Show columns
                    <span className="columns-icons">{getVisibleColumnsLabel(lb.visibleColumns)}</span>
                  )}
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
              <label>Leaderboard-typ:</label>
              <select
                value={form.type || 'standard'}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                style={{
                  padding: '0.75rem',
                  fontSize: '1rem',
                  border: '2px solid #3b82f6',
                  borderRadius: '8px',
                  background: '#f0f9ff'
                }}
              >
                <option value="standard">📊 Standard (Individuell ranking)</option>
                <option value="metrics-grid">📈 Metrics Grid (Grupps jämförelse)</option>
                <option value="team-battle">⚔️ Team Battle (Tävling mellan lag)</option>
                <option value="trend-chart">📉 Trend Chart (Tidsserier)</option>
              </select>
              <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                {form.type === 'metrics-grid'
                  ? '🎯 Jämför user groups side-by-side med anpassade metrics och färgkodning'
                  : form.type === 'team-battle'
                  ? '⚔️ Tävling mellan 2-4 lag med olika victory conditions'
                  : form.type === 'trend-chart'
                  ? '📉 Visa trender över tid med line charts och dual Y-axis'
                  : '📋 Klassisk leaderboard med ranking av individuella agenter'}
              </small>
            </div>

            {/* ==================== STANDARD LEADERBOARD FIELDS ==================== */}
            {form.type === 'standard' && (
              <>
                <div className="form-group">
                  <label>Tidsperiod:</label>
                  <select
                    value={form.timePeriod}
                    onChange={(e) => setForm({ ...form, timePeriod: e.target.value })}
                  >
                    <option value="day">Dag (uppdateras varje dag)</option>
                    <option value="week">Vecka (uppdateras varje måndag)</option>
                    <option value="month">Månad (uppdateras varje månadsskifte)</option>
                    <option value="custom">Anpassad (välj start- och slutdatum)</option>
                  </select>
                </div>

            {/* Custom date fields - only shown when timePeriod === 'custom' */}
            {form.timePeriod === 'custom' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Startdatum (UTC):</label>
                  <input
                    type="datetime-local"
                    value={form.customStartDate}
                    onChange={(e) => setForm({ ...form, customStartDate: e.target.value })}
                  />
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#666' }}>
                    Thailand är UTC+7. Välj tid baserat på lokal tid.
                  </small>
                </div>
                <div className="form-group">
                  <label>Slutdatum (UTC):</label>
                  <input
                    type="datetime-local"
                    value={form.customEndDate}
                    onChange={(e) => setForm({ ...form, customEndDate: e.target.value })}
                  />
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#666' }}>
                    Thailand är UTC+7. Välj tid baserat på lokal tid.
                  </small>
                </div>
              </div>
            )}

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
                    checked={form.visibleColumns.dealsPerHour}
                    onChange={() => toggleColumn('dealsPerHour')}
                  />
                  <span>🕒 Affärer/timme</span>
                </label>
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
                    dealsPerHour: '🕒 Affärer/timme',
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

            {/* Logos Selection */}
            <div className="form-group">
              <label>Logoer:</label>

              {/* Brand Logo - Left */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: '500', marginBottom: '0.5rem', display: 'block' }}>
                  Varumärkeslogga (vänster):
                </label>
                <select
                  value={form.brandLogo || ''}
                  onChange={(e) => setForm({ ...form, brandLogo: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e1e8ed',
                    borderRadius: '6px',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="">Ingen varumärkeslogga</option>
                  {logosLibrary.map(logo => (
                    <option key={logo.id} value={logo.url}>
                      {logo.name}
                    </option>
                  ))}
                </select>
                {form.brandLogo && (
                  <div className="logo-preview" style={{ marginTop: '0.5rem' }}>
                    <img src={form.brandLogo} alt="Brand Logo" style={{ maxWidth: '150px', maxHeight: '80px', objectFit: 'contain' }} />
                  </div>
                )}
              </div>

              {/* Company Logo - Right */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.9rem', fontWeight: '500', marginBottom: '0.5rem', display: 'block' }}>
                  Företagslogga (höger):
                </label>
                <select
                  value={form.companyLogo || ''}
                  onChange={(e) => setForm({ ...form, companyLogo: e.target.value || null })}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e1e8ed',
                    borderRadius: '6px',
                    fontSize: '0.95rem'
                  }}
                >
                  <option value="">Ingen företagslogga</option>
                  {logosLibrary.map(logo => (
                    <option key={logo.id} value={logo.url}>
                      {logo.name}
                    </option>
                  ))}
                </select>
                {form.companyLogo && (
                  <div className="logo-preview" style={{ marginTop: '0.5rem' }}>
                    <img src={form.companyLogo} alt="Company Logo" style={{ maxWidth: '150px', maxHeight: '80px', objectFit: 'contain' }} />
                  </div>
                )}
              </div>

              <button
                type="button"
                className="btn-primary"
                style={{ background: '#3498db', fontSize: '0.85rem' }}
                onClick={() => setShowLogosManagement(true)}
              >
                🖼️ Hantera Logoer
              </button>
              <small style={{ display: 'block', marginTop: '0.5rem' }}>
                Välj logoer från biblioteket eller hantera logoer för att ladda upp nya
              </small>
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
              </>
            )}

            {/* ==================== METRICS GRID FIELDS ==================== */}
            {form.type === 'metrics-grid' && (
              <MetricsGridConfigForm
                form={form}
                setForm={setForm}
                userGroups={userGroups}
              />
            )}

            {/* ==================== TEAM BATTLE FIELDS ==================== */}
            {form.type === 'team-battle' && (
              <>
                <div className="form-group">
                  <label>Beskrivning (valfri):</label>
                  <textarea
                    value={form.description || ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="T.ex. 'Thailand vs Sverige - Vem säljer mest under Q4?'"
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem', fontSize: '1rem' }}
                  />
                </div>

                <div className="form-group">
                  <label>Tidsperiod:</label>
                  <select
                    value={form.timePeriod || 'month'}
                    onChange={(e) => setForm({ ...form, timePeriod: e.target.value })}
                  >
                    <option value="day">Dag (uppdateras varje dag)</option>
                    <option value="week">Vecka (uppdateras varje måndag)</option>
                    <option value="month">Månad (uppdateras varje månadsskifte)</option>
                    <option value="custom">Anpassad (välj start- och slutdatum)</option>
                  </select>
                  <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                    Battle stats beräknas dynamiskt baserat på vald period
                  </small>
                </div>

                {/* Custom date fields for Team Battle - only shown when timePeriod === 'custom' */}
                {form.timePeriod === 'custom' && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>Startdatum & tid (UTC):</label>
                      <input
                        type="datetime-local"
                        value={form.battleStartDate || ''}
                        onChange={(e) => setForm({ ...form, battleStartDate: e.target.value })}
                      />
                      <small style={{ display: 'block', marginTop: '0.25rem', color: '#666' }}>
                        Thailand är UTC+7. Välj tid baserat på lokal tid.
                      </small>
                    </div>
                    <div className="form-group">
                      <label>Slutdatum & tid (UTC):</label>
                      <input
                        type="datetime-local"
                        value={form.battleEndDate || ''}
                        onChange={(e) => setForm({ ...form, battleEndDate: e.target.value })}
                      />
                      <small style={{ display: 'block', marginTop: '0.25rem', color: '#666' }}>
                        Thailand är UTC+7. Välj tid baserat på lokal tid.
                      </small>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Victory Metric (avgör vinnaren):</label>
                  <select
                    value={form.victoryMetric || 'commission_per_hour'}
                    onChange={(e) => setForm({ ...form, victoryMetric: e.target.value })}
                  >
                    <option value="commission_per_hour">💸 Commission per timme (THB/h)</option>
                    <option value="order_per_hour">🕒 Affärer per timme</option>
                    <option value="deals">🎯 Antal affärer</option>
                    <option value="sms_rate">📱 SMS Success Rate (%)</option>
                    <option value="commission">💰 Total Commission (THB)</option>
                  </select>
                  <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                    OBS: Alla metrics (order/h, deals, SMS%, commission/h) visas i tabellen, men denna metric avgör vem som vinner.
                  </small>
                </div>

                <div className="form-group">
                  <label>Victory Condition (hur man mäter):</label>
                  <select
                    value={form.victoryCondition || 'highest_at_end'}
                    onChange={(e) => setForm({ ...form, victoryCondition: e.target.value })}
                  >
                    <option value="highest_at_end">🏆 Högst värde vid slutdatum</option>
                    <option value="best_average">📊 Bästa genomsnitt över perioden</option>
                    <option value="first_to_target">🎯 Först till målvärde</option>
                  </select>
                  <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                    {form.victoryCondition === 'highest_at_end'
                      ? 'Laget med högst värde när tiden är slut vinner'
                      : form.victoryCondition === 'best_average'
                      ? 'Laget med bästa genomsnittet över hela perioden vinner (total / login tid)'
                      : 'Första laget som når målvärdet vinner direkt'}
                  </small>
                </div>

                {form.victoryCondition === 'first_to_target' && (
                  <div className="form-group">
                    <label>Målvärde:</label>
                    <input
                      type="number"
                      value={form.targetValue || ''}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                      placeholder="T.ex. 100000"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Lag (2-4 lag):</label>
                  {(form.teams || []).map((team, index) => (
                    <div key={index} style={{
                      border: '2px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '1rem',
                      marginBottom: '1rem',
                      background: '#f9fafb'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h4 style={{ margin: 0 }}>Lag {index + 1}</h4>
                        {form.teams.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const newTeams = form.teams.filter((_, i) => i !== index);
                              setForm({ ...form, teams: newTeams });
                            }}
                            style={{
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            🗑️ Ta bort
                          </button>
                        )}
                      </div>

                      <div className="form-group">
                        <label>Lagnamn:</label>
                        <input
                          type="text"
                          value={team.teamName || ''}
                          onChange={(e) => {
                            const newTeams = [...form.teams];
                            newTeams[index].teamName = e.target.value;
                            setForm({ ...form, teams: newTeams });
                          }}
                          placeholder="T.ex. 'Team Thailand'"
                        />
                      </div>

                      <div className="form-group">
                        <label>Emoji (valfri):</label>
                        <input
                          type="text"
                          value={team.teamEmoji || ''}
                          onChange={(e) => {
                            const newTeams = [...form.teams];
                            newTeams[index].teamEmoji = e.target.value;
                            setForm({ ...form, teams: newTeams });
                          }}
                          placeholder="T.ex. 🇹🇭"
                          maxLength={2}
                        />
                      </div>

                      <div className="form-group">
                        <label>Färg:</label>
                        <input
                          type="color"
                          value={team.color || '#FF6B6B'}
                          onChange={(e) => {
                            const newTeams = [...form.teams];
                            newTeams[index].color = e.target.value;
                            setForm({ ...form, teams: newTeams });
                          }}
                        />
                      </div>

                      <div className="form-group">
                        <label>User Groups:</label>
                        <div className="checkbox-group">
                          {userGroups.map(group => (
                            <label key={group.id} className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={(team.userGroupIds || []).includes(group.id)}
                                onChange={() => {
                                  const newTeams = [...form.teams];
                                  const groupIds = newTeams[index].userGroupIds || [];
                                  if (groupIds.includes(group.id)) {
                                    newTeams[index].userGroupIds = groupIds.filter(id => id !== group.id);
                                  } else {
                                    newTeams[index].userGroupIds = [...groupIds, group.id];
                                  }
                                  setForm({ ...form, teams: newTeams });
                                }}
                              />
                              <span>{group.name} ({group.agentCount} agenter)</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  {(!form.teams || form.teams.length < 4) && (
                    <button
                      type="button"
                      onClick={() => {
                        const colors = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#A8E6CF'];
                        const nextColor = colors[(form.teams?.length || 0) % colors.length];
                        setForm({
                          ...form,
                          teams: [
                            ...(form.teams || []),
                            { teamName: '', teamEmoji: '', color: nextColor, userGroupIds: [] }
                          ]
                        });
                      }}
                      className="btn-primary"
                      style={{ background: '#10b981', width: '100%' }}
                    >
                      ➕ Lägg till lag
                    </button>
                  )}
                </div>
              </>
            )}

            {/* ==================== TREND CHART FIELDS ==================== */}
            {form.type === 'trend-chart' && (
              <>
                <div className="form-group">
                  <label>User Groups (tomt = alla agenter):</label>
                  <div className="checkbox-group">
                    {userGroups.length === 0 ? (
                      <p style={{ color: '#999', fontStyle: 'italic' }}>Inga grupper tillgängliga. Laddar...</p>
                    ) : (
                      userGroups.map(group => (
                        <label key={group.id} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={form.userGroups.includes(group.id)}
                            onChange={() => toggleGroup(group.id)}
                          />
                          <span>{group.name} ({group.agentCount} agenter)</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Color Picker for Selected Groups */}
                {form.userGroups.length > 0 && (
                  <div className="form-group">
                    <label>Färger för User Groups:</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {form.userGroups.map(groupId => {
                        const group = userGroups.find(g => g.id === groupId);
                        if (!group) return null;

                        const currentColor = (form.groupColors || {})[groupId] || '#00B2E3';

                        return (
                          <div key={groupId} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <input
                              type="color"
                              value={currentColor}
                              onChange={(e) => {
                                setForm({
                                  ...form,
                                  groupColors: {
                                    ...(form.groupColors || {}),
                                    [groupId]: e.target.value
                                  }
                                });
                              }}
                              style={{
                                width: '50px',
                                height: '35px',
                                border: '2px solid #ddd',
                                borderRadius: '6px',
                                cursor: 'pointer'
                              }}
                            />
                            <span style={{ fontWeight: 600 }}>{group.name}</span>
                            <span style={{ color: '#666', fontSize: '14px' }}>({currentColor})</span>
                          </div>
                        );
                      })}
                    </div>
                    <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                      Välj färg för varje user group som visas i grafen
                    </small>
                  </div>
                )}

                <div className="form-group">
                  <label>Tidsperiod:</label>
                  <select
                    value={form.trendDays !== undefined && form.trendDays !== null ? form.trendDays : 30}
                    onChange={(e) => {
                      const newValue = parseInt(e.target.value);
                      console.log(`📅 Trend chart period changed: ${form.trendDays} → ${newValue}`);
                      setForm({ ...form, trendDays: newValue, trendHours: undefined });
                    }}
                  >
                    <option value={1}>📅 Idag (senaste 24h)</option>
                    <option value={7}>📅 Denna vecka (7 dagar)</option>
                    <option value={30}>📅 Denna månad (30 dagar)</option>
                    <option value={90}>📅 Senaste kvartalet (90 dagar)</option>
                    <option value={365}>📅 Senaste året (365 dagar)</option>
                  </select>
                  <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                    Visar kumulativ trend över vald period
                  </small>
                </div>

                <div className="form-group">
                  <label>Metrics (välj 1-2):</label>
                  <div style={{ marginBottom: '1rem' }}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(form.trendMetrics || []).some(m => m.metric === 'commission')}
                        onChange={(e) => {
                          const metrics = form.trendMetrics || [];
                          if (e.target.checked) {
                            setForm({ ...form, trendMetrics: [...metrics, { metric: 'commission', axis: 'left' }] });
                          } else {
                            setForm({ ...form, trendMetrics: metrics.filter(m => m.metric !== 'commission') });
                          }
                        }}
                        disabled={(form.trendMetrics || []).length >= 2 && !(form.trendMetrics || []).some(m => m.metric === 'commission')}
                      />
                      <span>💰 Commission (THB)</span>
                    </label>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(form.trendMetrics || []).some(m => m.metric === 'deals')}
                        onChange={(e) => {
                          const metrics = form.trendMetrics || [];
                          if (e.target.checked) {
                            setForm({ ...form, trendMetrics: [...metrics, { metric: 'deals', axis: 'left' }] });
                          } else {
                            setForm({ ...form, trendMetrics: metrics.filter(m => m.metric !== 'deals') });
                          }
                        }}
                        disabled={(form.trendMetrics || []).length >= 2 && !(form.trendMetrics || []).some(m => m.metric === 'deals')}
                      />
                      <span>🎯 Affärer</span>
                    </label>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(form.trendMetrics || []).some(m => m.metric === 'sms_rate')}
                        onChange={(e) => {
                          const metrics = form.trendMetrics || [];
                          if (e.target.checked) {
                            setForm({ ...form, trendMetrics: [...metrics, { metric: 'sms_rate', axis: metrics.length === 0 ? 'left' : 'right' }] });
                          } else {
                            setForm({ ...form, trendMetrics: metrics.filter(m => m.metric !== 'sms_rate') });
                          }
                        }}
                        disabled={(form.trendMetrics || []).length >= 2 && !(form.trendMetrics || []).some(m => m.metric === 'sms_rate')}
                      />
                      <span>📱 SMS Success Rate (%)</span>
                    </label>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(form.trendMetrics || []).some(m => m.metric === 'order_per_hour')}
                        onChange={(e) => {
                          const metrics = form.trendMetrics || [];
                          if (e.target.checked) {
                            setForm({ ...form, trendMetrics: [...metrics, { metric: 'order_per_hour', axis: 'left' }] });
                          } else {
                            setForm({ ...form, trendMetrics: metrics.filter(m => m.metric !== 'order_per_hour') });
                          }
                        }}
                        disabled={(form.trendMetrics || []).length >= 2 && !(form.trendMetrics || []).some(m => m.metric === 'order_per_hour')}
                      />
                      <span>🕒 Affärer per timme</span>
                    </label>
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={(form.trendMetrics || []).some(m => m.metric === 'commission_per_hour')}
                        onChange={(e) => {
                          const metrics = form.trendMetrics || [];
                          if (e.target.checked) {
                            setForm({ ...form, trendMetrics: [...metrics, { metric: 'commission_per_hour', axis: 'left' }] });
                          } else {
                            setForm({ ...form, trendMetrics: metrics.filter(m => m.metric !== 'commission_per_hour') });
                          }
                        }}
                        disabled={(form.trendMetrics || []).length >= 2 && !(form.trendMetrics || []).some(m => m.metric === 'commission_per_hour')}
                      />
                      <span>💸 Commission per timme (THB/h)</span>
                    </label>
                  </div>

                  <small style={{ display: 'block', color: '#666', marginTop: '0.5rem' }}>
                    Vid 2 metrics kan du tilldela olika Y-axlar nedan för dual Y-axis
                  </small>
                </div>

                {(form.trendMetrics || []).length === 2 && (
                  <div className="form-group">
                    <label>Y-Axis Konfiguration:</label>
                    {form.trendMetrics.map((m, idx) => (
                      <div key={idx} style={{ marginBottom: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ minWidth: '200px' }}>
                            {m.metric === 'commission' ? '💰 Commission' :
                             m.metric === 'deals' ? '🎯 Affärer' :
                             m.metric === 'sms_rate' ? '📱 SMS Rate' :
                             m.metric === 'order_per_hour' ? '🕒 Affärer/h' :
                             m.metric === 'commission_per_hour' ? '💸 Commission/h' : m.metric}
                          </span>
                          <select
                            value={m.axis}
                            onChange={(e) => {
                              const newMetrics = [...form.trendMetrics];
                              newMetrics[idx].axis = e.target.value;
                              setForm({ ...form, trendMetrics: newMetrics });
                            }}
                          >
                            <option value="left">Vänster Y-axis</option>
                            <option value="right">Höger Y-axis</option>
                          </select>
                        </label>
                      </div>
                    ))}
                  </div>
                )}

                {/* NOTE: Refresh interval is hardcoded to 3.5 minutes in TrendChartSlide.jsx
                    This matches central sync interval (3 min) - no point refreshing more often
                    since data only updates every 3 minutes */}
              </>
            )}

            {/* ==================== COMMON FIELDS ==================== */}
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

      {/* Logo Management Modal */}
      {showLogosManagement && (
        <div className="modal-overlay" onClick={() => setShowLogosManagement(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <h3>🖼️ Hantera Logoer</h3>

            {/* Upload Section */}
            <div style={{
              background: '#f8f9fa',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              border: '2px dashed #dee2e6'
            }}>
              <h4 style={{ marginTop: 0 }}>📤 Ladda upp ny logotyp</h4>
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadLogo}
                style={{ width: '100%', padding: '0.5rem' }}
              />
              <small style={{ display: 'block', marginTop: '0.5rem', color: '#666' }}>
                Godkända format: PNG, JPG, GIF, SVG. Max 5 MB.
              </small>
            </div>

            {/* Logos Grid */}
            <h4>📚 Logoer i biblioteket ({logosLibrary.length})</h4>
            {logosLibrary.length === 0 ? (
              <div style={{
                padding: '2rem',
                textAlign: 'center',
                background: '#f8f9fa',
                borderRadius: '8px',
                color: '#666'
              }}>
                <p>Inga logoer uppladdade än.</p>
                <p>Ladda upp din första logotyp ovan!</p>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '1rem',
                maxHeight: '400px',
                overflowY: 'auto',
                padding: '1rem',
                background: '#f8f9fa',
                borderRadius: '8px'
              }}>
                {logosLibrary.map(logo => (
                  <div key={logo.id} style={{
                    background: 'white',
                    padding: '1rem',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}>
                    {/* Logo Preview */}
                    <div style={{
                      height: '100px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#f8f9fa',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <img
                        src={logo.url}
                        alt={logo.name}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain'
                        }}
                      />
                    </div>

                    {/* Logo Name */}
                    <div style={{
                      fontWeight: '500',
                      fontSize: '0.9rem',
                      textAlign: 'center',
                      wordBreak: 'break-word'
                    }}>
                      {logo.name}
                    </div>

                    {/* Usage Info */}
                    {logo.usedBy && logo.usedBy.length > 0 && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#666',
                        textAlign: 'center'
                      }}>
                        Används av {logo.usedBy.length} leaderboard{logo.usedBy.length !== 1 ? 's' : ''}
                      </div>
                    )}

                    {/* Delete Button */}
                    <button
                      onClick={() => handleDeleteLogo(logo.id, logo.name)}
                      style={{
                        padding: '0.5rem',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                      onMouseOver={(e) => e.target.style.background = '#c82333'}
                      onMouseOut={(e) => e.target.style.background = '#dc3545'}
                    >
                      🗑️ Radera
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Close Button */}
            <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
              <button onClick={() => setShowLogosManagement(false)} className="btn-primary">
                Stäng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLeaderboards;
