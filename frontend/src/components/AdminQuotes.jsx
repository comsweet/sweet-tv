import { useState, useEffect } from 'react';
import {
  getQuotesSlideConfig,
  updateQuotesSlideConfig,
  refreshQuotesSlide,
  getCurrentQuotes,
  getAllQuotes,
  createQuote,
  updateQuote,
  deleteQuote
} from '../services/api';
import './AdminQuotes.css';

const AdminQuotes = () => {
  const [config, setConfig] = useState({
    enabled: false,
    mode: 'random', // 'random' or 'manual'
    refreshInterval: 3600, // seconds (1 hour default)
    selectedQuoteIds: []
  });

  const [currentQuotes, setCurrentQuotes] = useState([]);
  const [allQuotes, setAllQuotes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const quotesPerPage = 20;

  // Modal for add/edit quote
  const [showModal, setShowModal] = useState(false);
  const [editingQuote, setEditingQuote] = useState(null);
  const [quoteForm, setQuoteForm] = useState({ quote: '', attribution: '', active: true });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [configRes, currentRes, allRes] = await Promise.all([
        getQuotesSlideConfig(),
        getCurrentQuotes(),
        getAllQuotes()
      ]);

      setConfig(configRes.data);
      setCurrentQuotes(currentRes.data.quotes || []);
      setAllQuotes(allRes.data);
    } catch (error) {
      console.error('Error loading quotes data:', error);
      alert('Fel vid laddning: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await updateQuotesSlideConfig(config);
      alert('✅ Konfiguration sparad!');
      await loadData();
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Fel vid sparande: ' + error.message);
    }
    setIsSaving(false);
  };

  const handleRefreshNow = async () => {
    try {
      await refreshQuotesSlide();
      alert('✅ Citat uppdaterade!');
      await loadData();
    } catch (error) {
      console.error('Error refreshing quotes:', error);
      alert('Fel vid refresh: ' + error.message);
    }
  };

  const handleAddQuote = () => {
    setEditingQuote(null);
    setQuoteForm({ quote: '', attribution: '', active: true });
    setShowModal(true);
  };

  const handleEditQuote = (quote) => {
    setEditingQuote(quote);
    setQuoteForm({ quote: quote.quote, attribution: quote.attribution, active: quote.active });
    setShowModal(true);
  };

  const handleSaveQuote = async () => {
    if (!quoteForm.quote.trim() || !quoteForm.attribution.trim()) {
      alert('Fyll i både citat och attribution!');
      return;
    }

    try {
      if (editingQuote) {
        await updateQuote(editingQuote.id, quoteForm);
        alert('✅ Citat uppdaterat!');
      } else {
        await createQuote(quoteForm);
        alert('✅ Citat skapat!');
      }
      setShowModal(false);
      await loadData();
    } catch (error) {
      console.error('Error saving quote:', error);
      alert('Fel: ' + error.message);
    }
  };

  const handleDeleteQuote = async (id) => {
    if (!confirm('Säker på att du vill radera detta citat?')) return;

    try {
      await deleteQuote(id);
      alert('✅ Citat raderat!');
      await loadData();
    } catch (error) {
      console.error('Error deleting quote:', error);
      alert('Fel: ' + error.message);
    }
  };

  const toggleQuoteSelection = (quoteId) => {
    setConfig(prev => ({
      ...prev,
      selectedQuoteIds: prev.selectedQuoteIds.includes(quoteId)
        ? prev.selectedQuoteIds.filter(id => id !== quoteId)
        : [...prev.selectedQuoteIds, quoteId]
    }));
  };

  // Filter quotes by search term
  const filteredQuotes = allQuotes.filter(q =>
    q.quote.toLowerCase().includes(searchTerm.toLowerCase()) ||
    q.attribution.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const indexOfLastQuote = currentPage * quotesPerPage;
  const indexOfFirstQuote = indexOfLastQuote - quotesPerPage;
  const paginatedQuotes = filteredQuotes.slice(indexOfFirstQuote, indexOfLastQuote);
  const totalPages = Math.ceil(filteredQuotes.length / quotesPerPage);

  const formatInterval = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    return `${hours} timme${hours > 1 ? 'r' : ''}`;
  };

  if (isLoading) {
    return <div className="loading">Laddar citat...</div>;
  }

  return (
    <div className="admin-quotes">
      <h2>💬 Quotes Slide</h2>

      {/* Configuration Section */}
      <div className="quotes-config-section">
        <h3>⚙️ Konfiguration</h3>

        <div className="config-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
            />
            <span>Aktivera Quotes Slide</span>
          </label>
        </div>

        {config.enabled && (
          <>
            <div className="config-row">
              <label>Mode:</label>
              <select
                value={config.mode}
                onChange={(e) => setConfig({ ...config, mode: e.target.value })}
              >
                <option value="random">🎲 Random (auto-refresh)</option>
                <option value="manual">✋ Manuell (välj citat)</option>
              </select>
            </div>

            {config.mode === 'random' && (
              <div className="config-row">
                <label>Refresh-intervall:</label>
                <div className="interval-controls">
                  <input
                    type="number"
                    min="300"
                    max="86400"
                    value={config.refreshInterval}
                    onChange={(e) => setConfig({ ...config, refreshInterval: parseInt(e.target.value) })}
                  />
                  <span className="interval-display">({formatInterval(config.refreshInterval)})</span>
                  <div className="interval-presets">
                    <button onClick={() => setConfig({ ...config, refreshInterval: 1800 })}>30 min</button>
                    <button onClick={() => setConfig({ ...config, refreshInterval: 3600 })}>1h</button>
                    <button onClick={() => setConfig({ ...config, refreshInterval: 7200 })}>2h</button>
                    <button onClick={() => setConfig({ ...config, refreshInterval: 14400 })}>4h</button>
                  </div>
                </div>
              </div>
            )}

            <div className="config-actions">
              <button onClick={handleSaveConfig} className="btn-primary" disabled={isSaving}>
                {isSaving ? 'Sparar...' : '💾 Spara Konfiguration'}
              </button>
              <button onClick={handleRefreshNow} className="btn-secondary">
                🔄 Refresh Citat Nu
              </button>
            </div>
          </>
        )}
      </div>

      {/* Current Quotes Display */}
      {currentQuotes.length > 0 && (
        <div className="current-quotes-section">
          <h3>📺 Aktuella Citat (visas nu på TVs)</h3>
          <div className="current-quotes-grid">
            {currentQuotes.map((q, index) => (
              <div key={index} className="current-quote-card">
                <div className="quote-text">"{q.quote}"</div>
                <div className="quote-attribution">— {q.attribution}</div>
                <div className="quote-meta">Visad {q.times_shown || 0} gånger</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quotes Library */}
      <div className="quotes-library-section">
        <div className="library-header">
          <h3>📚 Citat-bibliotek ({allQuotes.length})</h3>
          <button onClick={handleAddQuote} className="btn-primary">
            ➕ Lägg till Citat
          </button>
        </div>

        <div className="library-controls">
          <input
            type="text"
            placeholder="🔍 Sök citat eller författare..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="search-input"
          />
          <div className="library-stats">
            Visar {filteredQuotes.length} av {allQuotes.length} citat
            {config.mode === 'manual' && ` (${config.selectedQuoteIds.length} valda)`}
          </div>
        </div>

        {/* Quotes Table */}
        <table className="quotes-table">
          <thead>
            <tr>
              {config.mode === 'manual' && <th>Välj</th>}
              <th>Status</th>
              <th>Citat</th>
              <th>Attribution</th>
              <th>Visningar</th>
              <th>Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {paginatedQuotes.map(quote => (
              <tr key={quote.id} className={quote.active ? '' : 'inactive-quote'}>
                {config.mode === 'manual' && (
                  <td>
                    <input
                      type="checkbox"
                      checked={config.selectedQuoteIds.includes(quote.id)}
                      onChange={() => toggleQuoteSelection(quote.id)}
                    />
                  </td>
                )}
                <td>
                  <span className={`status-badge ${quote.active ? 'active' : 'inactive'}`}>
                    {quote.active ? '✅' : '❌'}
                  </span>
                </td>
                <td className="quote-cell">"{quote.quote}"</td>
                <td className="attribution-cell">{quote.attribution}</td>
                <td className="count-cell">{quote.times_shown || 0}</td>
                <td className="actions-cell">
                  <button
                    onClick={() => handleEditQuote(quote)}
                    className="btn-edit"
                    title="Redigera"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteQuote(quote.id)}
                    className="btn-delete"
                    title="Ta bort"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              ← Föregående
            </button>
            <span>Sida {currentPage} av {totalPages}</span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Nästa →
            </button>
          </div>
        )}
      </div>

      {/* Modal for Add/Edit Quote */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingQuote ? 'Redigera' : 'Lägg till'} Citat</h2>

            <div className="form-group">
              <label>Citat:</label>
              <textarea
                value={quoteForm.quote}
                onChange={(e) => setQuoteForm({ ...quoteForm, quote: e.target.value })}
                placeholder="Skriv citat här..."
                rows={4}
              />
            </div>

            <div className="form-group">
              <label>Attribution (författare/källa):</label>
              <input
                type="text"
                value={quoteForm.attribution}
                onChange={(e) => setQuoteForm({ ...quoteForm, attribution: e.target.value })}
                placeholder="T.ex. Frank Ocean, Unknown, etc."
              />
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={quoteForm.active}
                  onChange={(e) => setQuoteForm({ ...quoteForm, active: e.target.checked })}
                />
                <span>Aktivt (kan visas)</span>
              </label>
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowModal(false)} className="btn-secondary">
                Avbryt
              </button>
              <button onClick={handleSaveQuote} className="btn-primary">
                💾 Spara
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminQuotes;
