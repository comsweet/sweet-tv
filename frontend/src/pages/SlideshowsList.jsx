import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSlideshows } from '../services/api';
import TVAccessCodeModal from '../components/TVAccessCodeModal';
import './SlideshowsList.css';

/**
 * SLIDESHOWS ÖVERSIKT
 * Visar alla aktiva slideshows som användaren kan välja att öppna
 */
const SlideshowsList = () => {
  const [slideshows, setSlideshows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // 🔑 TV ACCESS CODE STATE
  const [hasAccess, setHasAccess] = useState(() => {
    return sessionStorage.getItem('tvAccessGranted') === 'true';
  });

  useEffect(() => {
    loadSlideshows();
  }, []);

  const loadSlideshows = async () => {
    try {
      setIsLoading(true);
      const response = await getSlideshows();
      // 🔥 FIX: API returnerar { data: [...] }
      const allSlideshows = response.data || [];
      // Visa bara aktiva slideshows
      const activeSlideshows = allSlideshows.filter(ss => ss.active);
      setSlideshows(activeSlideshows);
      console.log('✅ Loaded slideshows:', activeSlideshows);
    } catch (error) {
      console.error('Error loading slideshows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSlideshow = (slideshowId) => {
    navigate(`/slideshow/${slideshowId}`);
  };

  // 🔑 Show access code modal if not granted
  if (!hasAccess) {
    return <TVAccessCodeModal onAccessGranted={() => setHasAccess(true)} />;
  }

  if (isLoading) {
    return (
      <div className="slideshows-list-container">
        <div className="slideshows-list-loading">
          <h1>🎬 Sweet TV Slideshows</h1>
          <p>Laddar slideshows...</p>
        </div>
      </div>
    );
  }

  if (slideshows.length === 0) {
    return (
      <div className="slideshows-list-container">
        <div className="slideshows-list-empty">
          <h1>🎬 Sweet TV Slideshows</h1>
          <p>Inga aktiva slideshows finns just nu.</p>
          <p className="hint">Skapa en slideshow i admin-panelen först!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="slideshows-list-container">
      <div className="slideshows-list-header">
        <h1>🎬 Välj Slideshow</h1>
        <p className="slideshows-count">{slideshows.length} aktiv{slideshows.length !== 1 ? 'a' : ''} slideshow{slideshows.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="slideshows-grid">
        {slideshows.map(slideshow => (
          <div 
            key={slideshow.id} 
            className="slideshow-card-select"
            onClick={() => handleSelectSlideshow(slideshow.id)}
          >
            <div className="slideshow-card-icon">
              📊
            </div>

            <div className="slideshow-card-info">
              <h2>{slideshow.name}</h2>

              <div className="slideshow-card-meta">
                <span className="slideshow-type">
                  Slideshow
                </span>

                <span className="slideshow-detail">
                  📈 {slideshow.slides?.length || slideshow.leaderboards?.length || 0} slides
                </span>
              </div>
            </div>

            <div className="slideshow-card-arrow">
              →
            </div>
          </div>
        ))}
      </div>

      <div className="slideshows-list-footer">
        <button 
          onClick={() => navigate('/admin')} 
          className="btn-admin"
        >
          ⚙️ Till Admin
        </button>
      </div>
    </div>
  );
};

export default SlideshowsList;
