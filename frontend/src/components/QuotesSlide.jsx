import React, { useState, useEffect } from 'react';
import { getCurrentQuotes } from '../services/api';
import './QuotesSlide.css';

const QuotesSlide = ({ isActive, tvSize }) => {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuotes();

    // Polling för att kolla om nya citat finns (varje minut)
    const interval = setInterval(fetchQuotes, 60000);

    return () => clearInterval(interval);
  }, []);

  const fetchQuotes = async () => {
    try {
      const response = await getCurrentQuotes();
      const data = response.data;

      if (data.quotes && data.quotes.length > 0) {
        setQuotes(data.quotes);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching quotes:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`quotes-slide ${tvSize ? `size-${tvSize}` : ''}`}>
        <div className="quotes-loading">Loading quotes...</div>
      </div>
    );
  }

  if (quotes.length === 0) {
    return null;
  }

  return (
    <div className={`quotes-slide ${isActive ? 'active' : ''} ${tvSize ? `size-${tvSize}` : ''}`}>
      <div className="quotes-container">
        {quotes.map((quote, index) => (
          <div key={index} className="quote-item" style={{ animationDelay: `${index * 0.3}s` }}>
            <div className="quote-mark opening">&ldquo;</div>
            <div className="quote-text">{quote.quote}</div>
            <div className="quote-mark closing">&rdquo;</div>
            <div className="quote-attribution">&mdash; {quote.attribution}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QuotesSlide;
