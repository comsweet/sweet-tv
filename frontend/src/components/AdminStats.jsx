import { useState, useEffect } from 'react';
import { getLeaderboardStats } from '../services/api';

const AdminStats = () => {
  const [stats, setStats] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [startDate, setStartDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      const statsRes = await getLeaderboardStats(
        new Date(startDate).toISOString(),
        new Date(endDate + 'T23:59:59').toISOString()
      );

      if (statsRes && statsRes.data) {
        if (Array.isArray(statsRes.data)) {
          setStats(statsRes.data);
        } else if (statsRes.data.stats && Array.isArray(statsRes.data.stats)) {
          setStats(statsRes.data.stats);
        } else {
          setStats([]);
          alert('Oväntat format på statistikdata');
        }
      } else {
        setStats([]);
        alert('Ingen data returnerades');
      }
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      setStats([]);
      alert('Fel vid hämtning av statistik: ' + error.message);
    }
    setIsLoading(false);
  };

  return (
    <div className="stats-section">
      <div className="stats-header">
        <h2>Statistik</h2>
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
            Ladda statistik
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">Laddar statistik...</div>
      ) : !stats || stats.length === 0 ? (
        <div className="no-data">Inga affärer för vald period</div>
      ) : (
        <div className="stats-table">
          <table>
            <thead>
              <tr>
                <th>Placering</th>
                <th>Agent</th>
                <th>Antal affärer</th>
                <th>Total provision</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat, index) => {
                if (!stat || !stat.agent) {
                  return null;
                }

                return (
                  <tr key={stat.userId || index}>
                    <td>
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
                    <td>{stat.dealCount || 0}</td>
                    <td>{(stat.totalCommission || 0).toLocaleString('sv-SE')} THB</td>
                  </tr>
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
