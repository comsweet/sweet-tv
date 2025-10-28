import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSlideshows } from '../services/api';
import './SlideshowsList.css';

/**
 * SLIDESHOWS ÖVERSIKT
 * Visar alla aktiva slideshows som användaren kan välja att öppna
 */
const SlideshowsList = () => {
  const [slideshows, setSlideshows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadSlideshows();
  }, []);

  const loadSlideshows = async () => {
    try {
      setIsLoading(true);
      const data = await getSlideshows();
      // Visa bara aktiva slideshows
      const activeSlideshows = data.filter(ss => ss.active);
      setSlideshows(activeSlideshows);
    } catch (error) {
      console.error('Error loading slideshows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSlideshow = (slideshowId) => {
    navigate(`/slideshow/${slideshowId}`);
  };

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
              {slideshow.type === 'dual' ? '⚡' : '📊'}
            </div>
            
            <div className="slideshow-card-info">
              <h2>{slideshow.name}</h2>
              
              <div className="slideshow-card-meta">
                <span className="slideshow-type">
                  {slideshow.type === 'single' ? 'Single Slideshow' : 'Dual Slideshow'}
                </span>
                
                {slideshow.type === 'single' && (
                  <span className="slideshow-detail">
                    📈 {slideshow.leaderboards?.length || 0} leaderboards
                  </span>
                )}
                
                {slideshow.type === 'dual' && (
                  <span className="slideshow-detail">
                    ⚡ {slideshow.dualSlides?.length || 0} dual slides
                  </span>
                )}
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
