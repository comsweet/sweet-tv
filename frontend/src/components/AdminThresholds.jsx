import { useState, useEffect } from 'react';
import { getThresholds, updateThresholds, resetThresholds } from '../services/api';
import './AdminThresholds.css';

const AdminThresholds = () => {
  const [thresholds, setThresholds] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editMode, setEditMode] = useState({});
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadThresholds();
  }, []);

  const loadThresholds = async () => {
    setIsLoading(true);
    try {
      const response = await getThresholds();
      setThresholds(response.data);
      setFormData(response.data);
    } catch (error) {
      console.error('Error loading thresholds:', error);
      alert('Fel vid laddning av tröskelvärden: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleEdit = (period) => {
    setEditMode({ ...editMode, [period]: true });
  };

  const handleCancel = (period) => {
    setFormData({ ...formData, [period]: thresholds[period] });
    setEditMode({ ...editMode, [period]: false });
  };

  const handleSave = async (period) => {
    try {
      await updateThresholds(period, formData[period]);
      setThresholds({ ...thresholds, [period]: formData[period] });
      setEditMode({ ...editMode, [period]: false });
      alert('Tröskelvärden uppdaterade!');
    } catch (error) {
      console.error('Error saving thresholds:', error);
      alert('Fel vid sparande: ' + error.message);
    }
  };

  const handleReset = async () => {
    if (!confirm('Återställ alla tröskelvärden till standardvärden?')) return;

    try {
      const response = await resetThresholds();
      setThresholds(response.data.thresholds);
      setFormData(response.data.thresholds);
      setEditMode({});
      alert('Tröskelvärden återställda!');
    } catch (error) {
      console.error('Error resetting thresholds:', error);
      alert('Fel vid återställning: ' + error.message);
    }
  };

  const handleInputChange = (period, field, subfield, value) => {
    setFormData({
      ...formData,
      [period]: {
        ...formData[period],
        [field]: {
          ...formData[period][field],
          [subfield]: parseFloat(value) || 0
        }
      }
    });
  };

  const getPeriodLabel = (period) => {
    const labels = {
      day: 'Dag',
      week: 'Vecka',
      month: 'Månad'
    };
    return labels[period] || period;
  };

  if (isLoading) {
    return <div className="thresholds-loading">Laddar tröskelvärden...</div>;
  }

  if (!thresholds) {
    return <div className="thresholds-error">Kunde inte ladda tröskelvärden</div>;
  }

  return (
    <div className="thresholds-section">
      <div className="thresholds-header">
        <h2>⚙️ Tröskelvärden för Färgkodning</h2>
        <p className="thresholds-desc">
          Konfigurera tröskelvärden per tidsperiod för att styra färgkodningen på slideshow.
        </p>
        <button onClick={handleReset} className="btn-reset">
          🔄 Återställ till Standard
        </button>
      </div>

      <div className="thresholds-info">
        <h3>Färgkodning:</h3>
        <ul>
          <li><strong>Total & Provision:</strong> Grön ≥ tröskelvärde, Orange &lt; tröskelvärde &amp; &gt; 0, Röd = 0</li>
          <li><strong>Kampanjbonus:</strong> Svart om &gt; 0, Röd om = 0</li>
          <li><strong>SMS:</strong> Grön ≥ grönt tröskelvärde, Orange ≥ orange tröskelvärde, Röd &lt; orange tröskelvärde</li>
        </ul>
      </div>

      <div className="thresholds-grid">
        {['day', 'week', 'month'].map(period => (
          <div key={period} className="threshold-card">
            <div className="threshold-card-header">
              <h3>{getPeriodLabel(period)}</h3>
              {!editMode[period] ? (
                <button onClick={() => handleEdit(period)} className="btn-edit-small">
                  ✏️ Redigera
                </button>
              ) : (
                <div className="threshold-actions">
                  <button onClick={() => handleSave(period)} className="btn-save-small">
                    💾 Spara
                  </button>
                  <button onClick={() => handleCancel(period)} className="btn-cancel-small">
                    ✕ Avbryt
                  </button>
                </div>
              )}
            </div>

            <div className="threshold-card-body">
              {/* Total Threshold */}
              <div className="threshold-group">
                <label>
                  💎 Total & 💰 Provision (THB)
                </label>
                <div className="threshold-input-group">
                  <span className="threshold-label">Grönt från:</span>
                  {editMode[period] ? (
                    <input
                      type="number"
                      value={formData[period]?.total?.green || 0}
                      onChange={(e) => handleInputChange(period, 'total', 'green', e.target.value)}
                      min="0"
                      step="100"
                    />
                  ) : (
                    <span className="threshold-value">
                      {thresholds[period]?.total?.green?.toLocaleString('sv-SE')} THB
                    </span>
                  )}
                </div>
                <div className="threshold-preview">
                  <div className="color-box green">Grön</div>
                  <span>≥ {(editMode[period] ? formData[period]?.total?.green : thresholds[period]?.total?.green)?.toLocaleString('sv-SE')} THB</span>
                </div>
                <div className="threshold-preview">
                  <div className="color-box orange">Orange</div>
                  <span>&lt; {(editMode[period] ? formData[period]?.total?.green : thresholds[period]?.total?.green)?.toLocaleString('sv-SE')} THB &amp; &gt; 0</span>
                </div>
                <div className="threshold-preview">
                  <div className="color-box red">Röd</div>
                  <span>= 0 THB</span>
                </div>
              </div>

              {/* Campaign Bonus - Info Only */}
              <div className="threshold-group">
                <label>
                  💸 Kampanjbonus (THB)
                </label>
                <div className="threshold-info-only">
                  <div className="threshold-preview">
                    <div className="color-box black">Svart</div>
                    <span>&gt; 0 THB</span>
                  </div>
                  <div className="threshold-preview">
                    <div className="color-box red">Röd</div>
                    <span>= 0 THB</span>
                  </div>
                </div>
              </div>

              {/* SMS Threshold */}
              <div className="threshold-group">
                <label>
                  📱 SMS (%)
                </label>
                <div className="threshold-input-group">
                  <span className="threshold-label">Grönt från:</span>
                  {editMode[period] ? (
                    <input
                      type="number"
                      value={formData[period]?.sms?.green || 0}
                      onChange={(e) => handleInputChange(period, 'sms', 'green', e.target.value)}
                      min="0"
                      max="100"
                      step="1"
                    />
                  ) : (
                    <span className="threshold-value">
                      {thresholds[period]?.sms?.green}%
                    </span>
                  )}
                </div>
                <div className="threshold-input-group">
                  <span className="threshold-label">Orange från:</span>
                  {editMode[period] ? (
                    <input
                      type="number"
                      value={formData[period]?.sms?.orange || 0}
                      onChange={(e) => handleInputChange(period, 'sms', 'orange', e.target.value)}
                      min="0"
                      max="100"
                      step="1"
                    />
                  ) : (
                    <span className="threshold-value">
                      {thresholds[period]?.sms?.orange}%
                    </span>
                  )}
                </div>
                <div className="threshold-preview">
                  <div className="color-box green">Grön</div>
                  <span>≥ {editMode[period] ? formData[period]?.sms?.green : thresholds[period]?.sms?.green}%</span>
                </div>
                <div className="threshold-preview">
                  <div className="color-box orange">Orange</div>
                  <span>≥ {editMode[period] ? formData[period]?.sms?.orange : thresholds[period]?.sms?.orange}%</span>
                </div>
                <div className="threshold-preview">
                  <div className="color-box red">Röd</div>
                  <span>&lt; {editMode[period] ? formData[period]?.sms?.orange : thresholds[period]?.sms?.orange}%</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminThresholds;
