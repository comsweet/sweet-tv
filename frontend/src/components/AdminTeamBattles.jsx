import { useState, useEffect } from 'react';
import {
  getTeamBattles,
  createTeamBattle,
  updateTeamBattle,
  deleteTeamBattle,
  getLeaderboards,
  getAvailableGroups
} from '../services/api';
import './AdminTeamBattles.css';

const AdminTeamBattles = () => {
  const [battles, setBattles] = useState([]);
  const [leaderboards, setLeaderboards] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingBattle, setEditingBattle] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    leaderboardId: '',
    timePeriod: '', // 'day', 'week', 'month', or '' for static dates
    startDate: '',
    endDate: '',
    victoryCondition: 'highest_at_end',
    victoryMetric: 'commission',
    targetValue: '',
    teams: [
      { teamName: '', teamEmoji: '', color: '#FF6B6B', userGroupIds: [] },
      { teamName: '', teamEmoji: '', color: '#4ECDC4', userGroupIds: [] }
    ]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [battlesRes, leaderboardsRes, groupsRes] = await Promise.all([
        getTeamBattles(),
        getLeaderboards(),
        getAvailableGroups()
      ]);

      setBattles(battlesRes.data || []);
      setLeaderboards(leaderboardsRes.data || []);
      setUserGroups(groupsRes.data.groups || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Fel vid laddning: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingBattle(null);
    setForm({
      name: '',
      description: '',
      leaderboardId: '',
      timePeriod: '', // Empty = use static dates
      startDate: '',
      endDate: '',
      victoryCondition: 'highest_at_end',
      victoryMetric: 'commission',
      targetValue: '',
      teams: [
        { teamName: '', teamEmoji: '', color: '#FF6B6B', userGroupIds: [] },
        { teamName: '', teamEmoji: '', color: '#4ECDC4', userGroupIds: [] }
      ]
    });
    setShowModal(true);
  };

  const openEditModal = (battle) => {
    setEditingBattle(battle);
    setForm({
      name: battle.name || '',
      description: battle.description || '',
      leaderboardId: battle.leaderboard_id || '',
      timePeriod: battle.time_period || '',
      startDate: battle.start_date ? new Date(battle.start_date).toISOString().slice(0, 16) : '',
      endDate: battle.end_date ? new Date(battle.end_date).toISOString().slice(0, 16) : '',
      victoryCondition: battle.victory_condition || 'highest_at_end',
      victoryMetric: battle.victory_metric || 'commission',
      targetValue: battle.target_value || '',
      teams: battle.teams || []
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingBattle(null);
  };

  const handleSave = async () => {
    // Validation
    if (!form.name.trim()) {
      alert('Namn måste anges');
      return;
    }

    // Either timePeriod OR (startDate + endDate) is required
    if (!form.timePeriod && (!form.startDate || !form.endDate)) {
      alert('Antingen dynamisk period ELLER start/slutdatum måste anges');
      return;
    }

    if (form.teams.length < 2 || form.teams.length > 4) {
      alert('Måste ha mellan 2 och 4 lag');
      return;
    }

    for (const team of form.teams) {
      if (!team.teamName.trim()) {
        alert('Alla lag måste ha ett namn');
        return;
      }
      if (team.userGroupIds.length === 0) {
        alert(`Lag "${team.teamName}" måste ha minst en user group`);
        return;
      }
    }

    if (form.victoryCondition === 'first_to_target' && !form.targetValue) {
      alert('Målvärde måste anges för "Först till mål"');
      return;
    }

    setIsLoading(true);
    try {
      const data = {
        name: form.name,
        description: form.description,
        leaderboardId: form.leaderboardId || null,
        timePeriod: form.timePeriod || null,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        victoryCondition: form.victoryCondition,
        victoryMetric: form.victoryMetric,
        targetValue: form.targetValue ? parseFloat(form.targetValue) : null,
        teams: form.teams.map((team, index) => ({
          teamName: team.teamName,
          teamEmoji: team.teamEmoji || null,
          color: team.color,
          userGroupIds: team.userGroupIds,
          displayOrder: index
        }))
      };

      if (editingBattle) {
        await updateTeamBattle(editingBattle.id, data);
        alert('✅ Team battle uppdaterad!');
      } else {
        await createTeamBattle(data);
        alert('✅ Team battle skapad!');
      }

      await loadData();
      closeModal();
    } catch (error) {
      alert('❌ Fel: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Radera team battle "${name}"?`)) return;

    setIsLoading(true);
    try {
      await deleteTeamBattle(id);
      alert('✅ Team battle raderad!');
      await loadData();
    } catch (error) {
      alert('❌ Fel: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const addTeam = () => {
    if (form.teams.length >= 4) {
      alert('Max 4 lag tillåtna');
      return;
    }

    const colors = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#A8E6CF'];
    const nextColor = colors[form.teams.length % colors.length];

    setForm({
      ...form,
      teams: [...form.teams, { teamName: '', teamEmoji: '', color: nextColor, userGroupIds: [] }]
    });
  };

  const removeTeam = (index) => {
    if (form.teams.length <= 2) {
      alert('Minst 2 lag krävs');
      return;
    }

    setForm({
      ...form,
      teams: form.teams.filter((_, i) => i !== index)
    });
  };

  const updateTeam = (index, field, value) => {
    const newTeams = [...form.teams];
    newTeams[index] = { ...newTeams[index], [field]: value };
    setForm({ ...form, teams: newTeams });
  };

  const toggleGroupForTeam = (teamIndex, groupId) => {
    const team = form.teams[teamIndex];
    const groupIdStr = String(groupId);
    const currentGroups = team.userGroupIds.map(g => String(g));

    let newGroups;
    if (currentGroups.includes(groupIdStr)) {
      newGroups = currentGroups.filter(g => g !== groupIdStr);
    } else {
      newGroups = [...currentGroups, groupIdStr];
    }

    updateTeam(teamIndex, 'userGroupIds', newGroups.map(g => parseInt(g)));
  };

  const getVictoryConditionLabel = (condition) => {
    const labels = {
      first_to_target: 'Först till mål',
      highest_at_end: 'Högst vid slutet',
      best_average: 'Bästa genomsnitt'
    };
    return labels[condition] || condition;
  };

  const getVictoryMetricLabel = (metric) => {
    const labels = {
      commission: 'Commission',
      deals: 'Affärer',
      sms_rate: 'SMS Success Rate',
      order_per_hour: 'Affärer per timme',
      commission_per_hour: 'Commission per timme'
    };
    return labels[metric] || metric;
  };

  if (isLoading) {
    return <div className="loading">Laddar team battles...</div>;
  }

  return (
    <div className="admin-team-battles">
      <div className="header">
        <h2>🏆 Team Battles</h2>
        <button onClick={openAddModal} className="btn-add">
          ➕ Skapa ny battle
        </button>
      </div>

      {battles.length === 0 ? (
        <div className="empty-state">
          <p>Inga team battles än. Skapa din första!</p>
        </div>
      ) : (
        <div className="battles-list">
          {battles.map(battle => (
            <div key={battle.id} className="battle-card">
              <div className="battle-header">
                <h3>{battle.name}</h3>
                <div className="battle-actions">
                  <button onClick={() => openEditModal(battle)} className="btn-edit">
                    ✏️ Redigera
                  </button>
                  <button
                    onClick={() => handleDelete(battle.id, battle.name)}
                    className="btn-delete"
                  >
                    🗑️ Radera
                  </button>
                </div>
              </div>

              {battle.description && (
                <p className="battle-description">{battle.description}</p>
              )}

              <div className="battle-info">
                <div className="info-row">
                  <span className="label">Period:</span>
                  <span>
                    {new Date(battle.start_date).toLocaleDateString('sv-SE')} -{' '}
                    {new Date(battle.end_date).toLocaleDateString('sv-SE')}
                  </span>
                </div>
                <div className="info-row">
                  <span className="label">Vinst-villkor:</span>
                  <span>{getVictoryConditionLabel(battle.victory_condition)}</span>
                </div>
                <div className="info-row">
                  <span className="label">Mätvärde:</span>
                  <span>{getVictoryMetricLabel(battle.victory_metric)}</span>
                </div>
                {battle.target_value && (
                  <div className="info-row">
                    <span className="label">Målvärde:</span>
                    <span>{battle.target_value}</span>
                  </div>
                )}
                <div className="info-row">
                  <span className="label">Status:</span>
                  <span className={battle.is_active ? 'status-active' : 'status-inactive'}>
                    {battle.is_active ? '✅ Aktiv' : '❌ Inaktiv'}
                  </span>
                </div>
              </div>

              <div className="battle-teams">
                <h4>Lag ({battle.teams?.length || 0}):</h4>
                <div className="teams-grid">
                  {battle.teams?.map((team, index) => (
                    <div key={team.id} className="team-badge" style={{ borderColor: team.color }}>
                      <span className="team-emoji">{team.teamEmoji}</span>
                      <span className="team-name">{team.teamName}</span>
                      <span className="team-groups">
                        {team.userGroupIds?.length || 0} grupper
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingBattle ? 'Redigera Team Battle' : 'Skapa ny Team Battle'}</h3>
              <button onClick={closeModal} className="btn-close">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Basic Info */}
              <div className="form-section">
                <h4>Grundläggande information</h4>

                <div className="form-group">
                  <label>Namn *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Bangkok vs Sverige"
                  />
                </div>

                <div className="form-group">
                  <label>Beskrivning</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Kort beskrivning av battlen"
                    rows={3}
                  />
                </div>

                <div className="form-group">
                  <label>Kopplad leaderboard (valfritt)</label>
                  <select
                    value={form.leaderboardId}
                    onChange={(e) => setForm({ ...form, leaderboardId: e.target.value })}
                  >
                    <option value="">Ingen leaderboard</option>
                    {leaderboards.map(lb => (
                      <option key={lb.id} value={lb.id}>
                        {lb.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Time Period Selection */}
                <div className="form-group">
                  <label>Tidsperiod</label>
                  <select
                    value={form.timePeriod}
                    onChange={(e) => setForm({ ...form, timePeriod: e.target.value })}
                  >
                    <option value="">Statiska datum (välj nedan)</option>
                    <option value="day">Dag (uppdateras automatiskt)</option>
                    <option value="week">Vecka (uppdateras automatiskt)</option>
                    <option value="month">Månad (uppdateras automatiskt)</option>
                  </select>
                  <small style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.3rem', display: 'block' }}>
                    {form.timePeriod ? '✅ Dynamisk period vald - datum nedan ignoreras' : 'Välj dynamisk period ELLER fyll i statiska datum nedan'}
                  </small>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>
                      Startdatum {!form.timePeriod && '*'}
                      {form.timePeriod && <small style={{ color: '#888' }}> (ignoreras)</small>}
                    </label>
                    <input
                      type="datetime-local"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      disabled={!!form.timePeriod}
                      style={{ opacity: form.timePeriod ? 0.5 : 1 }}
                    />
                  </div>

                  <div className="form-group">
                    <label>
                      Slutdatum {!form.timePeriod && '*'}
                      {form.timePeriod && <small style={{ color: '#888' }}> (ignoreras)</small>}
                    </label>
                    <input
                      type="datetime-local"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      disabled={!!form.timePeriod}
                      style={{ opacity: form.timePeriod ? 0.5 : 1 }}
                    />
                  </div>
                </div>
              </div>

              {/* Victory Conditions */}
              <div className="form-section">
                <h4>Vinst-villkor</h4>

                <div className="form-group">
                  <label>Vinst-villkor *</label>
                  <select
                    value={form.victoryCondition}
                    onChange={(e) => setForm({ ...form, victoryCondition: e.target.value })}
                  >
                    <option value="highest_at_end">Högst vid slutet</option>
                    <option value="first_to_target">Först till mål</option>
                    <option value="best_average">Bästa genomsnitt</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Mätvärde *</label>
                  <select
                    value={form.victoryMetric}
                    onChange={(e) => setForm({ ...form, victoryMetric: e.target.value })}
                  >
                    <option value="commission">Commission (THB)</option>
                    <option value="deals">Affärer</option>
                    <option value="sms_rate">SMS Success Rate (%)</option>
                    <option value="order_per_hour">Affärer per timme</option>
                    <option value="commission_per_hour">Commission per timme (THB/h)</option>
                  </select>
                </div>

                {form.victoryCondition === 'first_to_target' && (
                  <div className="form-group">
                    <label>Målvärde *</label>
                    <input
                      type="number"
                      value={form.targetValue}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
                      placeholder="t.ex. 100000 (för commission), 100 (för deals)"
                    />
                    <small>Vilket värde ska uppnås för att vinna?</small>
                  </div>
                )}
              </div>

              {/* Teams */}
              <div className="form-section">
                <div className="section-header">
                  <h4>Lag ({form.teams.length}/4)</h4>
                  {form.teams.length < 4 && (
                    <button onClick={addTeam} className="btn-add-small">
                      ➕ Lägg till lag
                    </button>
                  )}
                </div>

                {form.teams.map((team, index) => (
                  <div key={index} className="team-form">
                    <div className="team-form-header">
                      <h5>Lag {index + 1}</h5>
                      {form.teams.length > 2 && (
                        <button
                          onClick={() => removeTeam(index)}
                          className="btn-remove-team"
                        >
                          🗑️
                        </button>
                      )}
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Lagnamn *</label>
                        <input
                          type="text"
                          value={team.teamName}
                          onChange={(e) => updateTeam(index, 'teamName', e.target.value)}
                          placeholder="Bangkok"
                        />
                      </div>

                      <div className="form-group">
                        <label>Emoji</label>
                        <input
                          type="text"
                          value={team.teamEmoji}
                          onChange={(e) => updateTeam(index, 'teamEmoji', e.target.value)}
                          placeholder="🇹🇭"
                          maxLength={2}
                        />
                      </div>

                      <div className="form-group">
                        <label>Färg *</label>
                        <input
                          type="color"
                          value={team.color}
                          onChange={(e) => updateTeam(index, 'color', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label>User Groups * (välj minst en)</label>
                      <div className="groups-selector">
                        {userGroups.map(group => (
                          <label key={group.id} className="group-checkbox">
                            <input
                              type="checkbox"
                              checked={team.userGroupIds.map(g => String(g)).includes(String(group.id))}
                              onChange={() => toggleGroupForTeam(index, group.id)}
                            />
                            <span>{group.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={closeModal} className="btn-cancel">
                Avbryt
              </button>
              <button onClick={handleSave} className="btn-save" disabled={isLoading}>
                {isLoading ? 'Sparar...' : editingBattle ? 'Uppdatera' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTeamBattles;
