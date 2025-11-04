import { useState } from 'react';
import {
  getSlideshows,
  createSlideshow,
  updateSlideshow,
  deleteSlideshow
} from '../services/api';

/**
 * Custom hook för att hantera slideshows
 */
export const useSlideshows = () => {
  const [slideshows, setSlideshows] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSlideshow, setEditingSlideshow] = useState(null);
  const [form, setForm] = useState({
    name: '',
    slides: [],
    duration: 30,
    active: true
  });

  const fetchSlideshows = async () => {
    try {
      const response = await getSlideshows();
      setSlideshows(response.data);
    } catch (error) {
      console.error('Error fetching slideshows:', error);
      throw error;
    }
  };

  const openAddModal = () => {
    setEditingSlideshow(null);
    setForm({
      name: '',
      slides: [],
      duration: 30,
      active: true
    });
    setShowModal(true);
  };

  const openEditModal = (slideshow) => {
    setEditingSlideshow(slideshow);

    // Konvertera gamla formatet till nya om nödvändigt
    let slides = [];
    if (slideshow.slides && slideshow.slides.length > 0) {
      slides = slideshow.slides;
    } else if (slideshow.leaderboards && slideshow.leaderboards.length > 0) {
      slides = slideshow.leaderboards.map(lbId => ({
        leaderboardId: lbId,
        duration: slideshow.duration || 30
      }));
    }

    setForm({
      name: slideshow.name,
      slides: slides,
      duration: slideshow.duration || 30,
      active: slideshow.active
    });
    setShowModal(true);
  };

  const saveSlideshow = async () => {
    try {
      if (!form.name.trim()) {
        throw new Error('Namn krävs!');
      }

      if (!form.slides || form.slides.length === 0) {
        throw new Error('Lägg till minst en slide!');
      }

      // Validate leaderboard and trend slides have leaderboardId
      const invalidLeaderboardSlides = form.slides.filter(
        slide => slide.type !== 'quotes' && !slide.leaderboardId
      );
      if (invalidLeaderboardSlides.length > 0) {
        throw new Error('Alla leaderboard- och trend-slides måste ha en leaderboard vald!');
      }

      if (editingSlideshow) {
        await updateSlideshow(editingSlideshow.id, form);
      } else {
        await createSlideshow(form);
      }

      setShowModal(false);
      await fetchSlideshows();
    } catch (error) {
      console.error('Error saving slideshow:', error);
      throw error;
    }
  };

  const removeSlideshow = async (id) => {
    try {
      await deleteSlideshow(id);
      await fetchSlideshows();
    } catch (error) {
      console.error('Error deleting slideshow:', error);
      throw error;
    }
  };

  const toggleSlideshowActive = async (slideshow) => {
    try {
      await updateSlideshow(slideshow.id, {
        ...slideshow,
        active: !slideshow.active
      });
      await fetchSlideshows();
    } catch (error) {
      console.error('Error toggling slideshow:', error);
      throw error;
    }
  };

  const addSlide = (type = 'leaderboard') => {
    setForm(prev => {
      let newSlide;

      if (type === 'quotes') {
        newSlide = { type: 'quotes', duration: prev.duration || 15 };
      } else if (type === 'trend') {
        newSlide = {
          type: 'trend',
          leaderboardId: null,
          duration: prev.duration || 20,
          config: {
            hours: 24,
            topN: 5,
            metric: 'commission'
          }
        };
      } else {
        newSlide = { type: 'leaderboard', leaderboardId: null, duration: prev.duration || 30 };
      }

      return {
        ...prev,
        slides: [...prev.slides, newSlide]
      };
    });
  };

  const removeSlide = (index) => {
    setForm(prev => ({
      ...prev,
      slides: prev.slides.filter((_, i) => i !== index)
    }));
  };

  const updateSlide = (index, field, value) => {
    setForm(prev => ({
      ...prev,
      slides: prev.slides.map((slide, i) =>
        i === index ? { ...slide, [field]: value } : slide
      )
    }));
  };

  const reorderSlide = (index, direction) => {
    const newSlides = [...form.slides];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newSlides.length) return;

    [newSlides[index], newSlides[targetIndex]] =
      [newSlides[targetIndex], newSlides[index]];

    setForm(prev => ({ ...prev, slides: newSlides }));
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingSlideshow(null);
  };

  return {
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
  };
};
