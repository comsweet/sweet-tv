# 📈 Trend Chart Slides - Documentation

## Overview

Trend Chart Slides visartidsutveckling för top performers i en leaderboard. Perfekt för att visa momentum och tävlingsanda på TV-displayen.

## Features

- ✅ **Realtidsdata**: Uppdateras automatiskt var 5:e minut
- ✅ **Kumulativa värden**: Visar hur agenter bygger upp sina värden över tid
- ✅ **Top N filtering**: Visa bara top 3, 5 eller fler agents
- ✅ **Flera metriker**: Visa deals ELLER commission (THB)
- ✅ **Responsiv design**: Fungerar på alla skärmstorlekar
- ✅ **Färgkodade linjer**: Varje agent får sin egen färg

## Configuration

### Lägg till en Trend Slide i Slideshow

För att lägga till en trend chart slide, uppdatera `slideshows.json`:

```json
{
  "slideshows": [
    {
      "id": "example-slideshow",
      "name": "My Slideshow",
      "slides": [
        {
          "type": "leaderboard",
          "leaderboardId": "leaderboard-1",
          "duration": 30
        },
        {
          "type": "trend",
          "leaderboardId": "leaderboard-1",
          "duration": 20,
          "config": {
            "hours": 24,
            "topN": 5,
            "metric": "commission",
            "refreshInterval": 300000
          }
        },
        {
          "type": "quotes",
          "duration": 15
        }
      ]
    }
  ]
}
```

### Configuration Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | string | **required** | Must be `"trend"` |
| `leaderboardId` | string | **required** | ID of the leaderboard to show trends for |
| `duration` | number | 20 | How long (in seconds) the slide is shown |
| `config.hours` | number | 24 | How many hours back to show (1-72) |
| `config.topN` | number | 5 | Number of top performers to display (1-10) |
| `config.metric` | string | `"commission"` | `"commission"` or `"deals"` |
| `config.refreshInterval` | number | 300000 | How often to fetch new data (ms), default 5 min |

### Metrics

**`commission`** (default)
- Shows cumulative commission in THB
- Y-axis: "Commission (THB)"
- Best for seeing financial performance

**`deals`**
- Shows cumulative number of deals
- Y-axis: "Antal affärer"
- Best for seeing activity level

### Examples

**Example 1: Last 24 hours, Top 3, Commission**
```json
{
  "type": "trend",
  "leaderboardId": "daily-board",
  "duration": 25,
  "config": {
    "hours": 24,
    "topN": 3,
    "metric": "commission"
  }
}
```

**Example 2: Last 12 hours, Top 5, Deals**
```json
{
  "type": "trend",
  "leaderboardId": "today-board",
  "duration": 20,
  "config": {
    "hours": 12,
    "topN": 5,
    "metric": "deals"
  }
}
```

**Example 3: Last 48 hours, Top 8, Commission**
```json
{
  "type": "trend",
  "leaderboardId": "weekly-board",
  "duration": 30,
  "config": {
    "hours": 48,
    "topN": 8,
    "metric": "commission"
  }
}
```

## API Endpoint

The trend data is fetched from:

```
GET /api/leaderboards/:leaderboardId/history?hours=24&topN=5&metric=commission
```

### Response Format

```json
{
  "leaderboard": {
    "id": "leaderboard-1",
    "name": "Daily Sales"
  },
  "timeSeries": [
    {
      "time": "2025-11-03T08:00:00.000Z",
      "Maria": 0,
      "Johan": 0,
      "Sara": 0
    },
    {
      "time": "2025-11-03T09:00:00.000Z",
      "Maria": 1200,
      "Johan": 800,
      "Sara": 900
    },
    {
      "time": "2025-11-03T10:00:00.000Z",
      "Maria": 2500,
      "Johan": 1900,
      "Sara": 1800
    }
  ],
  "topUsers": [
    { "userId": "123", "name": "Maria", "total": 2500 },
    { "userId": "456", "name": "Johan", "total": 1900 },
    { "userId": "789", "name": "Sara", "total": 1800 }
  ],
  "metric": "commission",
  "dateRange": {
    "startDate": "2025-11-03T08:00:00.000Z",
    "endDate": "2025-11-03T18:00:00.000Z"
  }
}
```

## Data Availability

- Data is available for **current month + 7 days before**
- Data is grouped by **hour** for time series
- Values are **cumulative** (total since start of period)
- Only shows data from deals in the database cache

## Troubleshooting

**Q: Chart shows "Ingen data tillgänglig"**
- Check that the leaderboard has deals in the selected time period
- Verify that deals are being synced to the database
- Try increasing `hours` to include more data

**Q: Not all agents showing up**
- Only top N agents are shown (check `topN` setting)
- Agents with 0 deals/commission are excluded

**Q: Chart not updating**
- Check `refreshInterval` setting (default is 5 minutes)
- Verify backend API endpoint is working: `/api/leaderboards/:id/history`

## Future Enhancements (Ideas)

- [ ] Admin UI for configuring trend slides
- [ ] Daily vs. Weekly comparison overlays
- [ ] Prediction lines based on current pace
- [ ] Goal markers on Y-axis
- [ ] Zoom in/out on time range
- [ ] Export chart as image
- [ ] Multiple leaderboards on same chart

## Technical Details

**Frontend Components:**
- `/frontend/src/components/TrendChartSlide.jsx`
- `/frontend/src/components/TrendChartSlide.css`

**Backend API:**
- `/backend/routes/modules/leaderboards.js` - Route handler
- Endpoint: `GET /api/leaderboards/:id/history`

**Dependencies:**
- **Recharts** - Chart rendering library
- **React** - Component framework

---

**Created:** 2025-11-03
**Author:** Claude
