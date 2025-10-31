import { useState, useEffect } from 'react';
import { getCampaignBonusTiers, createCampaignBonusTier, updateCampaignBonusTier, deleteCampaignBonusTier } from '../services/api';
import './AdminCampaignBonusTiers.css';

const AdminCampaignBonusTiers = () => {
  const [tiers, setTiers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTier, setEditingTier] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    campaignGroup: '',
    enabled: true,
    tiers: [
      { deals: 3, bonusPerDeal: 300 }
    ],
    maxDeals: 8
  });

  useEffect(() => {
    loadTiers();
  }, []);

  const loadTiers = async () => {
    setIsLoading(true);
    try {
      const response = await getCampaignBonusTiers();
      setTiers(response.data.tiers || []);
    } catch (error) {
      console.error('Error loading campaign bonus tiers:', error);
      alert('Fel vid laddning av bonustrappor: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleCreate = () => {
    setEditingTier(null);
    setFormData({
      campaignGroup: '',
      enabled: true,
      tiers: [
        { deals: 3, bonusPerDeal: 300 }
      ],
      maxDeals: 8
    });
    setShowCreateForm(true);
  };

  const handleEdit = (tier) => {
    setEditingTier(tier);
    setFormData({
      campaignGroup: tier.campaignGroup,
      enabled: tier.enabled,
      tiers: [...tier.tiers],
      maxDeals: tier.maxDeals
    });
    setShowCreateForm(true);
  };

  const handleSave = async () => {
    try {
      // Validate
      if (!formData.campaignGroup.trim()) {
        alert('Kampanj-grupp måste anges');
        return;
      }

      if (formData.tiers.length === 0) {
        alert('Minst en bonustrappa måste finnas');
        return;
      }

      // Sort tiers by deals
      const sortedTiers = [...formData.tiers].sort((a, b) => a.deals - b.deals);

      const payload = {
        ...formData,
        tiers: sortedTiers
      };

      if (editingTier) {
        await updateCampaignBonusTier(editingTier.id, payload);
        alert('Bonustrappa uppdaterad!');
      } else {
        await createCampaignBonusTier(payload);
        alert('Bonustrappa skapad!');
      }

      setShowCreateForm(false);
      loadTiers();
    } catch (error) {
      console.error('Error saving tier:', error);
      alert('Fel vid sparande: ' + error.message);
    }
  };

  const handleDelete = async (tier) => {
    if (!window.confirm(`Är du säker på att du vill ta bort bonustrappan för "${tier.campaignGroup}"?`)) {
      return;
    }

    try {
      await deleteCampaignBonusTier(tier.id);
      alert('Bonustrappa borttagen!');
      loadTiers();
    } catch (error) {
      console.error('Error deleting tier:', error);
      alert('Fel vid borttagning: ' + error.message);
    }
  };

  const addTierLevel = () => {
    setFormData({
      ...formData,
      tiers: [
        ...formData.tiers,
        { deals: 1, bonusPerDeal: 100 }
      ]
    });
  };

  const removeTierLevel = (index) => {
    const newTiers = [...formData.tiers];
    newTiers.splice(index, 1);
    setFormData({ ...formData, tiers: newTiers });
  };

  const updateTierLevel = (index, field, value) => {
    const newTiers = [...formData.tiers];
    newTiers[index][field] = parseInt(value) || 0;
    setFormData({ ...formData, tiers: newTiers });
  };

  if (isLoading) {
    return <div className="campaign-bonus-section loading">Laddar...</div>;
  }

  return (
    <div className="campaign-bonus-section">
      <div className="section-header">
        <h2>📊 Kampanj-baserad Daglig Bonus</h2>
        <button onClick={handleCreate} className="btn-primary">
          ➕ Skapa Bonustrappa
        </button>
      </div>

      <div className="bonus-info">
        <p>💡 <strong>Så fungerar det:</strong></p>
        <ul>
          <li>Bonus beräknas per kampanj-grupp, per dag</li>
          <li>Retroaktiv bonus: När agent når nästa nivå får de högre bonus för ALLA deals den dagen</li>
          <li>Exempel: Om trappan är [3→300, 4→350] och agent gör 4 deals får de 4×350 = 1400 THB</li>
          <li>Max deals sätter en gräns för hur många deals som räknas</li>
        </ul>
      </div>

      {/* Tier List */}
      <div className="tiers-list">
        {tiers.length === 0 ? (
          <div className="no-tiers">Inga bonustrappor skapade än</div>
        ) : (
          tiers.map(tier => (
            <div key={tier.id} className={`tier-card ${!tier.enabled ? 'disabled' : ''}`}>
              <div className="tier-header">
                <h3>{tier.campaignGroup}</h3>
                <div className="tier-actions">
                  <button onClick={() => handleEdit(tier)} className="btn-secondary">
                    ✏️ Redigera
                  </button>
                  <button onClick={() => handleDelete(tier)} className="btn-danger">
                    🗑️ Ta bort
                  </button>
                </div>
              </div>

              <div className="tier-body">
                <div className="tier-status">
                  Status: <span className={tier.enabled ? 'enabled' : 'disabled'}>
                    {tier.enabled ? '✅ Aktiverad' : '❌ Inaktiverad'}
                  </span>
                </div>

                <div className="tier-levels">
                  <h4>Bonustrappor:</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Deals</th>
                        <th>Bonus/Deal</th>
                        <th>Total (exempel)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tier.tiers.map((level, idx) => (
                        <tr key={idx}>
                          <td>{level.deals} deals</td>
                          <td>{level.bonusPerDeal} THB</td>
                          <td>{level.deals * level.bonusPerDeal} THB</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="tier-max">
                  <strong>Max deals per dag:</strong> {tier.maxDeals}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Form */}
      {showCreateForm && (
        <div className="modal-overlay" onClick={() => setShowCreateForm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{editingTier ? 'Redigera Bonustrappa' : 'Skapa Bonustrappa'}</h3>

            <div className="form-group">
              <label>Kampanj-grupp *</label>
              <input
                type="text"
                value={formData.campaignGroup}
                onChange={(e) => setFormData({ ...formData, campaignGroup: e.target.value })}
                placeholder="t.ex. Dentle Kallkund"
              />
              <small>Exakt namn som visas i kampanj-namn före första bindestreck</small>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                />
                Aktiverad
              </label>
            </div>

            <div className="form-group">
              <label>Max Deals per Dag *</label>
              <input
                type="number"
                value={formData.maxDeals}
                onChange={(e) => setFormData({ ...formData, maxDeals: parseInt(e.target.value) || 0 })}
                min="1"
              />
            </div>

            <div className="form-group">
              <label>Bonustrappor *</label>
              {formData.tiers.map((tier, index) => (
                <div key={index} className="tier-level-row">
                  <input
                    type="number"
                    value={tier.deals}
                    onChange={(e) => updateTierLevel(index, 'deals', e.target.value)}
                    placeholder="Deals"
                    min="1"
                  />
                  <span>deals →</span>
                  <input
                    type="number"
                    value={tier.bonusPerDeal}
                    onChange={(e) => updateTierLevel(index, 'bonusPerDeal', e.target.value)}
                    placeholder="Bonus/deal"
                    min="0"
                  />
                  <span>THB/deal</span>
                  {formData.tiers.length > 1 && (
                    <button
                      onClick={() => removeTierLevel(index)}
                      className="btn-danger-small"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addTierLevel} className="btn-secondary">
                ➕ Lägg till nivå
              </button>
            </div>

            <div className="modal-actions">
              <button onClick={handleSave} className="btn-primary">
                💾 Spara
              </button>
              <button onClick={() => setShowCreateForm(false)} className="btn-secondary">
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminCampaignBonusTiers;
