import { useState, useEffect } from 'react';
import { getAvailableGroups } from '../services/api';

const AdminGroups = () => {
  const [userGroups, setUserGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      const groupsRes = await getAvailableGroups();
      setUserGroups(groupsRes.data.groups || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
      alert('Fel vid hämtning: ' + error.message);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return <div className="loading">Laddar grupper...</div>;
  }

  return (
    <div className="groups-section">
      <div className="section-header">
        <h2>User Groups från Adversus ({userGroups.length})</h2>
      </div>

      {userGroups.length === 0 ? (
        <div className="empty-state">
          <p>Inga user groups hittades</p>
        </div>
      ) : (
        <div className="groups-grid">
          {userGroups.map(group => (
            <div key={group.id} className="group-card">
              <div className="group-header">
                <h3>{group.name}</h3>
                <span className="group-id">ID: {group.id}</span>
              </div>
              <div className="group-stats">
                <div className="stat-item">
                  <span className="stat-icon">👥</span>
                  <span className="stat-value">{group.agentCount}</span>
                  <span className="stat-label">agenter</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminGroups;
