import { useState, useEffect } from 'react';
import { getLeaderboardStats } from '../services/api';
import * as XLSX from 'xlsx';
import './AdminStats.css';

const AdminStats = () => {
  const [stats, setStats] = useState([]);
  const [filteredStats, setFilteredStats] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Campaign group filter
  const [availableCampaignGroups, setAvailableCampaignGroups] = useState([]);
  const [selectedCampaignGroups, setSelectedCampaignGroups] = useState([]);

  // Expandable rows
  const [expandedRows, setExpandedRows] = useState(new Set());

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const statsRes = await getLeaderboardStats(
        new Date(startDate).toISOString(),
        new Date(endDate + 'T23:59:59').toISOString()
      );

      let statsData = [];
      if (statsRes && statsRes.data) {
        if (Array.isArray(statsRes.data)) {
          statsData = statsRes.data;
        } else if (statsRes.data.stats && Array.isArray(statsRes.data.stats)) {
          statsData = statsRes.data.stats;
        } else {
          setStats([]);
          setFilteredStats([]);
          alert('Oväntat format på statistikdata');
          setIsLoading(false);
          return;
        }
      } else {
        setStats([]);
        setFilteredStats([]);
        alert('Ingen data returnerades');
        setIsLoading(false);
        return;
      }

      setStats(statsData);

      // Extract unique campaign groups from bonus details
      const campaignGroupsSet = new Set();
      statsData.forEach(stat => {
        if (stat.campaignBonusDetails && Array.isArray(stat.campaignBonusDetails)) {
          stat.campaignBonusDetails.forEach(detail => {
            if (detail.campaignGroup && detail.campaignGroup !== 'Unknown') {
              campaignGroupsSet.add(detail.campaignGroup);
            }
          });
        }
      });

      const groups = Array.from(campaignGroupsSet).sort();
      setAvailableCampaignGroups(groups);

      // Reset filter
      setSelectedCampaignGroups([]);
      setFilteredStats(statsData);

    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      setStats([]);
      setFilteredStats([]);
      alert('Fel vid hämtning av statistik: ' + error.message);
    }
    setIsLoading(false);
  };

  // Filter stats when campaign groups selection changes
  useEffect(() => {
    if (selectedCampaignGroups.length === 0) {
      // No filter - show all
      setFilteredStats(stats);
    } else {
      // Filter: Show ONLY agents that have deals in selected campaign groups
      const filtered = stats.filter(stat => {
        if (!stat.campaignBonusDetails || stat.campaignBonusDetails.length === 0) {
          return false;
        }

        // Check if agent has ANY deals in selected campaign groups
        return stat.campaignBonusDetails.some(detail =>
          selectedCampaignGroups.includes(detail.campaignGroup)
        );
      });

      setFilteredStats(filtered);
    }
  }, [selectedCampaignGroups, stats]);

  const toggleCampaignGroup = (group) => {
    setSelectedCampaignGroups(prev => {
      if (prev.includes(group)) {
        return prev.filter(g => g !== group);
      } else {
        return [...prev, group];
      }
    });
  };

  const toggleRowExpansion = (userId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const exportToExcel = () => {
    if (filteredStats.length === 0) {
      alert('Ingen data att exportera');
      return;
    }

    // Prepare data for Excel
    const excelData = filteredStats.map((stat, index) => {
      const row = {
        'Placering': index + 1,
        'Agent': stat.agent?.name || `Agent ${stat.userId}`,
        'Antal affärer': stat.dealCount || 0,
        'Total provision (THB)': stat.totalCommission || 0,
        'Campaign Bonus (THB)': stat.campaignBonus || 0,
        'Total (THB)': (stat.totalCommission || 0) + (stat.campaignBonus || 0)
      };

      // Add campaign bonus details
      if (stat.campaignBonusDetails && stat.campaignBonusDetails.length > 0) {
        const detailsByDate = {};
        stat.campaignBonusDetails.forEach(detail => {
          if (!detailsByDate[detail.date]) {
            detailsByDate[detail.date] = [];
          }
          detailsByDate[detail.date].push(`${detail.campaignGroup}: ${detail.deals} deals → ${detail.bonus} THB`);
        });

        const detailsString = Object.entries(detailsByDate)
          .map(([date, details]) => `${date}: ${details.join(', ')}`)
          .join(' | ');

        row['Campaign Bonus Details'] = detailsString;
      } else {
        row['Campaign Bonus Details'] = 'Ingen bonus';
      }

      return row;
    });

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 10 },  // Placering
      { wch: 25 },  // Agent
      { wch: 15 },  // Antal affärer
      { wch: 20 },  // Total provision
      { wch: 20 },  // Campaign Bonus
      { wch: 15 },  // Total
      { wch: 80 }   // Details
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Statistik');

    // Generate filename with date range
    const filename = `statistik_${startDate}_till_${endDate}.xlsx`;

    // Download
    XLSX.writeFile(wb, filename);
  };

  return (
    <div className="stats-section">
      <div className="stats-header">
        <h2>📊 Statistik</h2>
        <div className="stats-controls">
          <div className="date-picker">
            <label>
              Från:
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <label>
              Till:
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
            <button onClick={fetchStats} className="btn-primary">
              📈 Ladda statistik
            </button>
          </div>

          {availableCampaignGroups.length > 0 && (
            <div className="campaign-filter">
              <label>Filtrera kampanjgrupper:</label>
              <div className="campaign-checkboxes">
                {availableCampaignGroups.map(group => (
                  <label key={group} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedCampaignGroups.includes(group)}
                      onChange={() => toggleCampaignGroup(group)}
                    />
                    <span>{group}</span>
                  </label>
                ))}
              </div>
              {selectedCampaignGroups.length > 0 && (
                <button
                  onClick={() => setSelectedCampaignGroups([])}
                  className="btn-clear-filter"
                >
                  ✕ Rensa filter
                </button>
              )}
            </div>
          )}

          {filteredStats.length > 0 && (
            <button onClick={exportToExcel} className="btn-export">
              📥 Exportera till Excel
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="loading">Laddar statistik...</div>
      ) : !filteredStats || filteredStats.length === 0 ? (
        <div className="no-data">
          {selectedCampaignGroups.length > 0
            ? 'Inga agenter har affärer i valda kampanjgrupper'
            : 'Inga affärer för vald period'}
        </div>
      ) : (
        <div className="stats-table-wrapper">
          <div className="stats-summary">
            Visar {filteredStats.length} agenter
            {selectedCampaignGroups.length > 0 && (
              <span> (filtrerade på: {selectedCampaignGroups.join(', ')})</span>
            )}
          </div>

          <table className="stats-table">
            <thead>
              <tr>
                <th></th>
                <th>Placering</th>
                <th>Agent</th>
                <th>Antal affärer</th>
                <th>Total provision</th>
                <th>Campaign Bonus</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.map((stat, index) => {
                if (!stat || !stat.agent) {
                  return null;
                }

                const isExpanded = expandedRows.has(stat.userId);
                const hasBonusDetails = stat.campaignBonusDetails && stat.campaignBonusDetails.length > 0;
                const total = (stat.totalCommission || 0) + (stat.campaignBonus || 0);

                return (
                  <>
                    <tr key={stat.userId || index} className={isExpanded ? 'expanded' : ''}>
                      <td className="expand-cell">
                        {hasBonusDetails && (
                          <button
                            onClick={() => toggleRowExpansion(stat.userId)}
                            className="btn-expand"
                            title={isExpanded ? 'Dölj detaljer' : 'Visa detaljer'}
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        )}
                      </td>
                      <td className="rank-cell">
                        {index === 0 && '🥇'}
                        {index === 1 && '🥈'}
                        {index === 2 && '🥉'}
                        {index > 2 && `#${index + 1}`}
                      </td>
                      <td>
                        <div className="stat-agent">
                          {stat.agent.profileImage ? (
                            <img
                              src={stat.agent.profileImage}
                              alt={stat.agent.name || 'Agent'}
                            />
                          ) : (
                            <div className="stat-avatar-placeholder">
                              {stat.agent.name?.charAt(0) || '?'}
                            </div>
                          )}
                          <span>{stat.agent.name || `Agent ${stat.userId}`}</span>
                        </div>
                      </td>
                      <td className="number-cell">{stat.dealCount || 0}</td>
                      <td className="number-cell">{(stat.totalCommission || 0).toLocaleString('sv-SE')} THB</td>
                      <td className="number-cell campaign-bonus-cell">
                        {(stat.campaignBonus || 0).toLocaleString('sv-SE')} THB
                      </td>
                      <td className="number-cell total-cell">
                        {total.toLocaleString('sv-SE')} THB
                      </td>
                    </tr>

                    {isExpanded && hasBonusDetails && (
                      <tr className="details-row">
                        <td colSpan="7">
                          <div className="bonus-details">
                            <h4>💰 Campaign Bonus Detaljer</h4>
                            {(() => {
                              // Group by date
                              const detailsByDate = {};
                              stat.campaignBonusDetails.forEach(detail => {
                                if (!detailsByDate[detail.date]) {
                                  detailsByDate[detail.date] = [];
                                }
                                detailsByDate[detail.date].push(detail);
                              });

                              return Object.entries(detailsByDate).map(([date, details]) => (
                                <div key={date} className="details-date-group">
                                  <div className="details-date">{date}:</div>
                                  <div className="details-list">
                                    {details.map((detail, idx) => (
                                      <div key={idx} className="detail-item">
                                        <span className="detail-group">{detail.campaignGroup}</span>:
                                        <span className="detail-deals">{detail.deals} deals</span> →
                                        <span className="detail-bonus">{detail.bonus.toLocaleString('sv-SE')} THB</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AdminStats;
