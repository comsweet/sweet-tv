import { useEffect, useState } from 'react';
import { useSlideshows } from '../hooks/useSlideshows';
import { getLeaderboards } from '../services/api';

const AdminSlideshows = () => {
  const {
    slideshows,
    showModal,
    editingSlideshow,
    form,
    setForm,
    fetchSlideshows,
    openAddModal,
    openEditModal,
    saveSlideshow,
    removeSlideshow,
    toggleSlideshowActive,
    addSlide,
    removeSlide,
    updateSlide,
    reorderSlide,
    closeModal
  } = useSlideshows();

  const [leaderboards, setLeaderboards] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      await fetchSlideshows();
      const lbRes = await getLeaderboards();
      setLeaderboards(lbRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Fel vid laddning: ' + error.message);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    try {
      await saveSlideshow();
    } catch (error) {
      alert('Fel: ' + error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Säker på att du vill radera denna slideshow?')) return;
    try {
      await removeSlideshow(id);
    } catch (error) {
      alert('Fel: ' + error.message);
    }
  };

  const formatDuration = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const getTotalSlideshowDuration = (slideshow) => {
    return slideshow.slides?.reduce((sum, slide) => sum + (slide.duration || slideshow.duration || 30), 0) || 0;
  };

  const getSlideshowUrl = (id) => {
    // Use hash-based routing (HashRouter requires #)
    return `${window.location.origin}/#/slideshow/${id}`;
  };

  const handleCopySlideshowUrl = (id) => {
    const url = getSlideshowUrl(id);
    navigator.clipboard.writeText(url);
    alert('URL kopierad till urklipp!');
  };

  const handleOpenSlideshow = (id) => {
    // Use hash-based routing for consistency
    window.open(`/#/slideshow/${id}`, '_blank');
  };

  if (isLoading) {
    return <div className="loading">Laddar slideshows...</div>;
  }

  return (
    <div className="slideshows-section">
      <div className="section-header">
        <h2>Slideshows ({slideshows.length})</h2>
        <button onClick={openAddModal} className="btn-primary">
          ➕ Skapa Slideshow
        </button>
      </div>

      <div className="slideshows-list">
        {slideshows.map(ss => {
          const totalDuration = getTotalSlideshowDuration(ss);

          return (
            <div key={ss.id} className="slideshow-card">
              <div className="slideshow-card-header">
                <div className="slideshow-name-container">
                  <h3>{ss.name}</h3>
                  <div className="slideshow-status">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={ss.active}
                        onChange={() => toggleSlideshowActive(ss)}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className={ss.active ? 'status-active' : 'status-inactive'}>
                      {ss.active ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="slideshow-card-body">
                <div className="slideshow-info">
                  <span className="info-label">Slides:</span>
                  <span className="info-value">
                    {ss.slides?.length || ss.leaderboards?.length || 0}
                  </span>
                </div>
                <div className="slideshow-info">
                  <span className="info-label">⏱️ Total tid:</span>
                  <span className="info-value">{formatDuration(totalDuration)}</span>
                </div>

                <div className="slideshow-info slideshow-url-info">
                  <span className="info-label">🔗 URL:</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1 }}>
                    <input
                      type="text"
                      value={getSlideshowUrl(ss.id)}
                      readOnly
                      className="slideshow-url-input"
                      onClick={(e) => e.target.select()}
                    />
                    <button
                      onClick={() => handleCopySlideshowUrl(ss.id)}
                      className="btn-icon"
                      title="Kopiera URL"
                    >
                      📋
                    </button>
                  </div>
                </div>
              </div>

              <div className="slideshow-card-footer">
                <button onClick={() => handleOpenSlideshow(ss.id)} className="btn-primary">
                  🚀 Öppna
                </button>
                <button onClick={() => openEditModal(ss)} className="btn-secondary">
                  ✏️ Redigera
                </button>
                <button onClick={() => handleDelete(ss.id)} className="btn-danger">
                  🗑️ Ta bort
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal large-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editingSlideshow ? 'Redigera' : 'Skapa'} Slideshow</h2>

            <div className="form-group">
              <label>Namn:</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="T.ex. 'Daglig Leaderboard'"
              />
            </div>

            <div className="slideshow-config-section">
              <div className="form-group">
                <label>⏱️ Fallback Duration (sekunder):</label>
                <input
                  type="number"
                  min="10"
                  max="300"
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: parseInt(e.target.value) })}
                />
                <small className="form-hint">
                  Används som standard om ingen slide-specifik duration är satt
                </small>
              </div>

              <div className="form-group">
                <div className="section-header-inline">
                  <label>📊 Slides (Leaderboards med individuella tider):</label>
                  <button onClick={addSlide} className="btn-secondary btn-sm">
                    ➕ Lägg till slide
                  </button>
                </div>

                {form.slides.length === 0 ? (
                  <div className="empty-state-box">
                    <p>Inga slides än. Klicka "Lägg till slide" för att skapa!</p>
                  </div>
                ) : (
                  <>
                    <div className="slides-list">
                      {form.slides.map((slide, index) => {
                        const selectedLb = leaderboards.find(lb => lb.id === slide.leaderboardId);

                        return (
                          <div key={index} className="slide-config-card">
                            <div className="slide-config-header">
                              <div className="slide-number">
                                <span className="slide-badge">#{index + 1}</span>
                                <h4>Slide {index + 1}</h4>
                              </div>
                              <div className="slide-actions">
                                <button
                                  onClick={() => reorderSlide(index, 'up')}
                                  disabled={index === 0}
                                  className="btn-icon"
                                  title="Flytta upp"
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => reorderSlide(index, 'down')}
                                  disabled={index === form.slides.length - 1}
                                  className="btn-icon"
                                  title="Flytta ner"
                                >
                                  ▼
                                </button>
                                <button
                                  onClick={() => removeSlide(index)}
                                  className="btn-icon btn-danger"
                                  title="Ta bort"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>

                            <div className="slide-config-body">
                              <div className="form-group">
                                <label>Leaderboard:</label>
                                <select
                                  value={slide.leaderboardId || ''}
                                  onChange={(e) => updateSlide(index, 'leaderboardId', e.target.value)}
                                  className={!slide.leaderboardId ? 'select-error' : ''}
                                >
                                  <option value="">Välj leaderboard...</option>
                                  {leaderboards.map(lb => (
                                    <option key={lb.id} value={lb.id}>
                                      {lb.name}
                                    </option>
                                  ))}
                                </select>
                                {selectedLb && (
                                  <div className="lb-meta-badges">
                                    <span className="meta-badge">
                                      {selectedLb.timePeriod === 'day' && '📅 Dag'}
                                      {selectedLb.timePeriod === 'week' && '📅 Vecka'}
                                      {selectedLb.timePeriod === 'month' && '📅 Månad'}
                                      {selectedLb.timePeriod === 'custom' && '📅 Anpassad'}
                                    </span>
                                    <span className="meta-badge">
                                      {selectedLb.userGroups?.length === 0 ? '👥 Alla' : `👥 ${selectedLb.userGroups.length}`}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="form-group">
                                <label>⏱️ Visningstid:</label>
                                <div className="duration-input-group">
                                  <input
                                    type="number"
                                    min="10"
                                    max="300"
                                    value={slide.duration}
                                    onChange={(e) => updateSlide(index, 'duration', parseInt(e.target.value))}
                                    className="duration-input"
                                  />
                                  <span className="duration-unit">sekunder</span>
                                  <span className="duration-display">
                                    ({formatDuration(slide.duration)})
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="slideshow-summary">
                      <h4>📊 Sammanfattning</h4>
                      <div className="summary-stats">
                        <div className="summary-stat">
                          <span className="stat-label">Slides:</span>
                          <span className="stat-value">{form.slides.length}</span>
                        </div>
                        <div className="summary-stat">
                          <span className="stat-label">Total tid:</span>
                          <span className="stat-value">
                            {formatDuration(form.slides.reduce((sum, s) => sum + (s.duration || form.duration || 30), 0))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                <span>Aktiv</span>
              </label>
            </div>

            <div className="modal-actions">
              <button onClick={closeModal} className="btn-secondary">
                Avbryt
              </button>
              <button onClick={handleSave} className="btn-primary">
                💾 Spara Slideshow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSlideshows;
