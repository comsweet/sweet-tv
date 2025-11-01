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
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '400px',
        fontSize: '16px',
        color: '#666'
      }}>
        Laddar grupper...
      </div>
    );
  }

  return (
    <div className="admin-section">
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h2 style={{ color: '#005A9C', margin: 0 }}>
          👨‍👩‍👧‍👦 User Groups från Adversus
        </h2>
        <div style={{
          background: 'linear-gradient(135deg, #005A9C 0%, #00B2E3 100%)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '14px',
          fontWeight: '600'
        }}>
          {userGroups.length} grupper
        </div>
      </div>

      {userGroups.length === 0 ? (
        <div style={{
          background: 'white',
          padding: '60px 40px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          textAlign: 'center',
          color: '#666'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
          <p style={{ fontSize: '16px', margin: 0 }}>Inga user groups hittades</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          {userGroups.map(group => (
            <div
              key={group.id}
              style={{
                background: 'white',
                padding: '24px',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'all 0.3s ease',
                cursor: 'default',
                border: '2px solid transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 90, 156, 0.15)';
                e.currentTarget.style.borderColor = '#00B2E3';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '20px',
                paddingBottom: '16px',
                borderBottom: '2px solid #f0f0f0'
              }}>
                <h3 style={{
                  margin: 0,
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#2c3e50',
                  flex: 1
                }}>
                  {group.name}
                </h3>
                <span style={{
                  background: '#e3f2fd',
                  color: '#005A9C',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  marginLeft: '8px',
                  whiteSpace: 'nowrap'
                }}>
                  ID: {group.id}
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'linear-gradient(135deg, #f5f7fa 0%, #e8f4f8 100%)',
                padding: '16px',
                borderRadius: '8px'
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, #005A9C 0%, #00B2E3 100%)',
                  color: 'white',
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px'
                }}>
                  👥
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '28px',
                    fontWeight: '700',
                    color: '#005A9C',
                    lineHeight: 1
                  }}>
                    {group.agentCount || 0}
                  </div>
                  <div style={{
                    fontSize: '13px',
                    color: '#666',
                    marginTop: '4px'
                  }}>
                    agenter
                  </div>
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
