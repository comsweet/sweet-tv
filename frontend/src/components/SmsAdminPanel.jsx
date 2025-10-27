import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function SmsAdminPanel() {
  const [smsStats, setSmsStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    fetchSmsStats();
    
    // Auto-refresh var 30:e sekund
    const interval = setInterval(fetchSmsStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchSmsStats = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/sms/stats`);
      setSmsStats(response.data);
    } catch (error) {
      console.error('Error fetching SMS stats:', error);
    }
  };

  const handleQuickSync = async () => {
    if (loading) return;
    
    setLoading(true);
    setActionMessage('🔄 Synkar nya SMS...');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/sms/sync`, {}, { timeout: 60000 });
      setActionMessage(`✅ ${response.data.message}`);
      await fetchSmsStats();
    } catch (error) {
      console.error('Error quick syncing SMS:', error);
      setActionMessage('❌ Fel vid snabb-synkning');
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(''), 3000);
    }
  };

  const handleFullSync = async () => {
    if (loading) return;
    
    if (!window.confirm('Detta kan ta 1-2 minuter. Vill du göra en fullständig synkning?')) {
      return;
    }
    
    setLoading(true);
    setActionMessage('⚡ Fullständig synkning pågår...');
    
    try {
      const response = await axios.post(`${API_BASE_URL}/sms/sync/full`, {}, { timeout: 180000 });
      setActionMessage(`✅ ${response.data.message}`);
      await fetchSmsStats();
    } catch (error) {
      console.error('Error full syncing SMS:', error);
      setActionMessage('❌ Fel vid fullständig synkning');
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(''), 3000);
    }
  };

  const handleClearCache = async () => {
    if (loading) return;
    
    if (!window.confirm('⚠️ Detta raderar alla cachade SMS. En full synkning kommer att behövas efter detta. Fortsätt?')) {
      return;
    }
    
    setLoading(true);
    setActionMessage('🧹 Rensar cache...');
    
    try {
      await axios.post(`${API_BASE_URL}/sms/cache/clear`);
      setActionMessage('✅ Cache rensad');
      await fetchSmsStats();
    } catch (error) {
      console.error('Error clearing SMS cache:', error);
      setActionMessage('❌ Fel vid rensning');
    } finally {
      setLoading(false);
      setTimeout(() => setActionMessage(''), 3000);
    }
  };

  const formatDate = (isoDate) => {
    if (!isoDate) return 'Aldrig';
    
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return 'Nu';
    if (diffMins < 60) return `${diffMins} min sedan`;
    if (diffHours < 24) return `${diffHours} h sedan`;
    
    return date.toLocaleString('sv-SE', { 
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDateRange = (startDate, endDate) => {
    if (!startDate || !endDate) return 'N/A';
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    return `${start.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric', year: 'numeric' })} → ${end.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  if (!smsStats) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center">
          <div className="text-gray-400">Laddar SMS-statistik...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">📱</span>
            <h2 className="text-xl font-bold text-gray-800">SMS Cache Hantering</h2>
          </div>
          {actionMessage && (
            <span className="text-sm font-medium text-gray-600">{actionMessage}</span>
          )}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Cache Status */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <span className="mr-2">📊</span>
            Cache Status
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-xs text-blue-600 font-medium mb-1">Total SMS</div>
              <div className="text-2xl font-bold text-blue-700">
                {smsStats.totalSms.toLocaleString()}
              </div>
            </div>
            
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-xs text-green-600 font-medium mb-1">Unika SMS</div>
              <div className="text-2xl font-bold text-green-700">
                {smsStats.totalUniqueSms.toLocaleString()}
              </div>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-xs text-purple-600 font-medium mb-1">Unika Agenter</div>
              <div className="text-2xl font-bold text-purple-700">
                {smsStats.uniqueAgents}
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-600 font-medium mb-1">Queue Längd</div>
              <div className="text-2xl font-bold text-gray-700">
                {smsStats.queueLength}
              </div>
            </div>
          </div>
        </div>

        {/* Sync Info */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <span className="mr-2">🕐</span>
            Synkning Info
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Senaste Synkning:</span>
              <span className="text-sm font-medium text-gray-800">
                {formatDate(smsStats.lastSync)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Senaste Full Synkning:</span>
              <span className="text-sm font-medium text-gray-800">
                {formatDate(smsStats.lastFullSync)}
              </span>
            </div>
          </div>
        </div>

        {/* Rolling Window */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <span className="mr-2">📅</span>
            Rolling Window
          </h3>
          <div className="bg-indigo-50 rounded-lg p-4">
            <div className="text-sm text-indigo-700 font-medium">
              {formatDateRange(smsStats.rollingWindow.start, smsStats.rollingWindow.end)}
            </div>
            <div className="text-xs text-indigo-600 mt-1">
              Nuvarande månad + 7 dagar innan
            </div>
          </div>
        </div>

        {/* Actions */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <span className="mr-2">⚙️</span>
            Actions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={handleQuickSync}
              disabled={loading}
              className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg transition-colors font-medium"
            >
              <span>🔄</span>
              <span>Quick Sync</span>
            </button>
            
            <button
              onClick={handleFullSync}
              disabled={loading}
              className="flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg transition-colors font-medium"
            >
              <span>⚡</span>
              <span>Full Sync</span>
            </button>
            
            <button
              onClick={handleClearCache}
              disabled={loading}
              className="flex items-center justify-center space-x-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-lg transition-colors font-medium"
            >
              <span>🧹</span>
              <span>Clear Cache</span>
            </button>
          </div>
          
          <div className="mt-3 text-xs text-gray-500 space-y-1">
            <div><strong>Quick Sync:</strong> Hämtar nya SMS (sista 3 min) - Snabb (~5 sek)</div>
            <div><strong>Full Sync:</strong> Hämtar ALLA SMS på nytt - Långsam (1-2 min)</div>
            <div><strong>Clear Cache:</strong> Tömmer hela SMS-cachen</div>
          </div>
        </div>

        {/* Storage Path Info */}
        <div className="text-xs text-gray-400 pt-2 border-t">
          <span className="font-medium">Storage:</span> {smsStats.storagePath}
        </div>
      </div>
    </div>
  );
}
