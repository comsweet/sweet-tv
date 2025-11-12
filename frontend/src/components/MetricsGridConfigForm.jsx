import { useState } from 'react';
import './MetricsGridConfigForm.css';

/**
 * Metrics Grid Configuration Form Component
 *
 * Allows user to configure:
 * - Selected groups to compare
 * - Metrics to display (with label, timePeriod, metric type)
 * - Color coding rules per metric
 */
const MetricsGridConfigForm = ({ form, setForm, userGroups }) => {
  const [expandedMetric, setExpandedMetric] = useState(null);
  const [selectedGroupForRules, setSelectedGroupForRules] = useState(null); // Track which group's rules we're editing

  // Toggle group selection
  const toggleSelectedGroup = (groupId) => {
    const selectedGroups = form.selectedGroups || [];
    setForm({
      ...form,
      selectedGroups: selectedGroups.includes(groupId)
        ? selectedGroups.filter(id => id !== groupId)
        : [...selectedGroups, groupId]
    });
  };

  // Add new metric
  const addMetric = () => {
    const newMetric = {
      id: `metric_${Date.now()}`,
      label: '',
      timePeriod: 'day',
      metric: 'ordersPerHour'
    };

    setForm({
      ...form,
      metrics: [...(form.metrics || []), newMetric]
    });
  };

  // Remove metric
  const removeMetric = (metricId) => {
    setForm({
      ...form,
      metrics: (form.metrics || []).filter(m => m.id !== metricId),
      colorRules: {
        ...(form.colorRules || {}),
        [metricId]: undefined // Remove color rules for this metric
      }
    });
  };

  // Update metric field
  const updateMetric = (metricId, field, value) => {
    setForm({
      ...form,
      metrics: (form.metrics || []).map(m =>
        m.id === metricId ? { ...m, [field]: value } : m
      )
    });
  };

  // Move metric up/down
  const moveMetric = (metricId, direction) => {
    const metrics = [...(form.metrics || [])];
    const index = metrics.findIndex(m => m.id === metricId);

    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      [metrics[index - 1], metrics[index]] = [metrics[index], metrics[index - 1]];
    } else if (direction === 'down' && index < metrics.length - 1) {
      [metrics[index], metrics[index + 1]] = [metrics[index + 1], metrics[index]];
    }

    setForm({ ...form, metrics });
  };

  // Add color rule (per-group)
  const addColorRule = (metricId, groupId) => {
    const metricRules = (form.colorRules || {})[metricId] || {};
    const groupRules = Array.isArray(metricRules) ? [] : (metricRules[groupId] || []);

    const newRule = {
      min: 0,
      max: 1,
      color: 'white'
    };

    setForm({
      ...form,
      colorRules: {
        ...(form.colorRules || {}),
        [metricId]: {
          ...(Array.isArray(metricRules) ? {} : metricRules),
          [groupId]: [...groupRules, newRule]
        }
      }
    });
  };

  // Remove color rule (per-group)
  const removeColorRule = (metricId, groupId, ruleIndex) => {
    const metricRules = (form.colorRules || {})[metricId] || {};
    const groupRules = Array.isArray(metricRules) ? [] : (metricRules[groupId] || []);

    setForm({
      ...form,
      colorRules: {
        ...(form.colorRules || {}),
        [metricId]: {
          ...(Array.isArray(metricRules) ? {} : metricRules),
          [groupId]: groupRules.filter((_, i) => i !== ruleIndex)
        }
      }
    });
  };

  // Update color rule (per-group)
  const updateColorRule = (metricId, groupId, ruleIndex, field, value) => {
    const metricRules = (form.colorRules || {})[metricId] || {};
    const groupRules = Array.isArray(metricRules) ? [] : (metricRules[groupId] || []);

    const updatedRules = groupRules.map((rule, i) =>
      i === ruleIndex ? { ...rule, [field]: value } : rule
    );

    setForm({
      ...form,
      colorRules: {
        ...(form.colorRules || {}),
        [metricId]: {
          ...(Array.isArray(metricRules) ? {} : metricRules),
          [groupId]: updatedRules
        }
      }
    });
  };

  const metricTypes = [
    { value: 'ordersPerHour', label: '🕒 Order/h' },
    { value: 'deals', label: '🎯 Antal ordrar' },
    { value: 'smsSuccessRate', label: '📱 SMS Success %' },
    { value: 'uniqueSMS', label: '📲 Unika SMS' },
    { value: 'commission', label: '💰 Provision' }
  ];

  const timePeriods = [
    { value: 'day', label: 'Idag' },
    { value: 'week', label: 'Denna vecka' },
    { value: 'month', label: 'Denna månad' }
  ];

  const colors = [
    { value: 'red', label: '🔴 Röd', hex: '#ef4444' },
    { value: 'orange', label: '🟠 Orange', hex: '#f97316' },
    { value: 'yellow', label: '🟡 Gul', hex: '#fbbf24' },
    { value: 'white', label: '⚪ Vit', hex: '#ffffff' },
    { value: 'green', label: '🟢 Grön', hex: '#22c55e' },
    { value: 'blue', label: '🔵 Blå', hex: '#3b82f6' }
  ];

  return (
    <div className="metrics-grid-config">
      {/* 1. SELECT GROUPS */}
      <div className="config-section">
        <h3>1. Välj grupper att jämföra (2-6 st)</h3>
        <div className="groups-grid">
          {userGroups.map(group => (
            <label key={group.id} className="group-checkbox">
              <input
                type="checkbox"
                checked={(form.selectedGroups || []).includes(group.id)}
                onChange={() => toggleSelectedGroup(group.id)}
                disabled={
                  !((form.selectedGroups || []).includes(group.id)) &&
                  (form.selectedGroups || []).length >= 6
                }
              />
              <span className="group-name">{group.name}</span>
              <span className="group-count">({group.agentCount} agenter)</span>
            </label>
          ))}
        </div>
        <small>
          Valt: {(form.selectedGroups || []).length} / 6 grupper
          {(form.selectedGroups || []).length < 2 && ' (minst 2 krävs)'}
        </small>
      </div>

      {/* 2. CONFIGURE METRICS */}
      <div className="config-section">
        <h3>2. Konfigurera metrics</h3>
        <button
          type="button"
          className="btn-add-metric"
          onClick={addMetric}
        >
          ➕ Lägg till metric
        </button>

        <div className="metrics-list">
          {(form.metrics || []).map((metric, index) => (
            <div key={metric.id} className="metric-item">
              <div className="metric-header">
                <span className="metric-number">#{index + 1}</span>
                <input
                  type="text"
                  placeholder="T.ex. 'Dagens order/h'"
                  value={metric.label}
                  onChange={(e) => updateMetric(metric.id, 'label', e.target.value)}
                  className="metric-label-input"
                />
                <div className="metric-controls">
                  <button
                    type="button"
                    onClick={() => moveMetric(metric.id, 'up')}
                    disabled={index === 0}
                    title="Flytta upp"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveMetric(metric.id, 'down')}
                    disabled={index === (form.metrics || []).length - 1}
                    title="Flytta ner"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMetric(metric.id)}
                    className="btn-remove"
                    title="Ta bort"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className="metric-config">
                <div className="metric-field">
                  <label>Tidsperiod:</label>
                  <select
                    value={metric.timePeriod}
                    onChange={(e) => updateMetric(metric.id, 'timePeriod', e.target.value)}
                  >
                    {timePeriods.map(tp => (
                      <option key={tp.value} value={tp.value}>{tp.label}</option>
                    ))}
                  </select>
                </div>

                <div className="metric-field">
                  <label>Metric-typ:</label>
                  <select
                    value={metric.metric}
                    onChange={(e) => updateMetric(metric.id, 'metric', e.target.value)}
                  >
                    {metricTypes.map(mt => (
                      <option key={mt.value} value={mt.value}>{mt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Color Rules - Per Group */}
              <div className="color-rules-section">
                <button
                  type="button"
                  className="btn-toggle-rules"
                  onClick={() => {
                    if (expandedMetric === metric.id) {
                      setExpandedMetric(null);
                      setSelectedGroupForRules(null);
                    } else {
                      setExpandedMetric(metric.id);
                      // Auto-select first group
                      if ((form.selectedGroups || []).length > 0) {
                        setSelectedGroupForRules((form.selectedGroups || [])[0]);
                      }
                    }
                  }}
                >
                  🎨 Färgkodning per grupp
                  {expandedMetric === metric.id ? ' ▼' : ' ▶'}
                </button>

                {expandedMetric === metric.id && (
                  <div className="color-rules-list">
                    {/* Group Selector */}
                    {(form.selectedGroups || []).length > 0 ? (
                      <>
                        <div className="group-selector">
                          <label>Välj grupp att konfigurera:</label>
                          <select
                            value={selectedGroupForRules || ''}
                            onChange={(e) => setSelectedGroupForRules(e.target.value)}
                            className="group-select"
                          >
                            {(form.selectedGroups || []).map((groupId) => {
                              const group = userGroups.find(g => g.id === groupId);
                              const metricRules = (form.colorRules || {})[metric.id] || {};
                              const rulesCount = Array.isArray(metricRules) ? 0 : ((metricRules[groupId] || []).length);
                              return (
                                <option key={groupId} value={groupId}>
                                  {group?.name || groupId} ({rulesCount} regler)
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {/* Rules for selected group */}
                        {selectedGroupForRules && (
                          <>
                            <button
                              type="button"
                              className="btn-add-rule"
                              onClick={() => addColorRule(metric.id, selectedGroupForRules)}
                            >
                              + Lägg till regel för {userGroups.find(g => g.id === selectedGroupForRules)?.name}
                            </button>

                            {(() => {
                              const metricRules = (form.colorRules || {})[metric.id] || {};
                              const groupRules = Array.isArray(metricRules) ? [] : (metricRules[selectedGroupForRules] || []);
                              return groupRules.map((rule, ruleIndex) => (
                                <div key={ruleIndex} className="color-rule">
                                  <div className="rule-fields">
                                    <div className="rule-field">
                                      <label>Min:</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={rule.min !== undefined ? rule.min : ''}
                                        onChange={(e) =>
                                          updateColorRule(metric.id, selectedGroupForRules, ruleIndex, 'min', e.target.value ? parseFloat(e.target.value) : undefined)
                                        }
                                        placeholder="Valfri"
                                      />
                                    </div>

                                    <div className="rule-field">
                                      <label>Max:</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={rule.max !== undefined ? rule.max : ''}
                                        onChange={(e) =>
                                          updateColorRule(metric.id, selectedGroupForRules, ruleIndex, 'max', e.target.value ? parseFloat(e.target.value) : undefined)
                                        }
                                        placeholder="Valfri"
                                      />
                                    </div>

                                    <div className="rule-field">
                                      <label>Färg:</label>
                                      <select
                                        value={rule.color}
                                        onChange={(e) => updateColorRule(metric.id, selectedGroupForRules, ruleIndex, 'color', e.target.value)}
                                        style={{
                                          backgroundColor: colors.find(c => c.value === rule.color)?.hex,
                                          color: ['red', 'blue', 'green'].includes(rule.color) ? 'white' : 'black'
                                        }}
                                      >
                                        {colors.map(c => (
                                          <option key={c.value} value={c.value}>{c.label}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <button
                                      type="button"
                                      className="btn-remove-rule"
                                      onClick={() => removeColorRule(metric.id, selectedGroupForRules, ruleIndex)}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  <small className="rule-description">
                                    {rule.min !== undefined && rule.max !== undefined
                                      ? `${rule.min} ≤ värde < ${rule.max}`
                                      : rule.min !== undefined
                                      ? `värde ≥ ${rule.min}`
                                      : rule.max !== undefined
                                      ? `värde < ${rule.max}`
                                      : 'Ange min och/eller max'}
                                  </small>
                                </div>
                              ));
                            })()}
                          </>
                        )}
                      </>
                    ) : (
                      <p style={{ textAlign: 'center', color: '#999', padding: '1rem' }}>
                        Välj grupper först för att konfigurera färgkodning
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

          {(form.metrics || []).length === 0 && (
            <div className="no-metrics">
              <p>Inga metrics tillagda än.</p>
              <p>Klicka på "Lägg till metric" ovan för att komma igång!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricsGridConfigForm;
