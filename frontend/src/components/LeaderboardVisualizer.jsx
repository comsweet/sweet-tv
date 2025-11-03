import MiniStats from './MiniStats';
import CardLayout from './CardLayout';
import ProgressBarsLayout from './ProgressBarsLayout';
import RocketRaceLayout from './RocketRaceLayout';
import RaceLayout from './RaceLayout';
import './LeaderboardVisualizer.css';

/**
 * LeaderboardVisualizer - Wrapper component that renders the appropriate visualization
 * based on the leaderboard's visualizationMode setting
 */
const LeaderboardVisualizer = ({
  leaderboard,
  stats,
  miniStats,
  isActive,
  displaySize,
  renderDefaultTable
}) => {
  const visualizationMode = leaderboard.visualizationMode || 'table';
  const displayMode = leaderboard.displayMode || 'individual';

  return (
    <div className={`leaderboard-visualizer ${isActive ? 'active' : ''}`}>
      {/* Mini Stats Header (if enabled) */}
      {leaderboard.showMiniStats && miniStats && (
        <MiniStats miniStats={miniStats} displayMode={displayMode} />
      )}

      {/* Main Visualization */}
      <div className="visualization-content">
        {visualizationMode === 'table' && renderDefaultTable && renderDefaultTable()}
        {visualizationMode === 'cards' && (
          <CardLayout stats={stats} leaderboard={leaderboard} displayMode={displayMode} />
        )}
        {visualizationMode === 'progress' && (
          <ProgressBarsLayout stats={stats} leaderboard={leaderboard} displayMode={displayMode} />
        )}
        {visualizationMode === 'rocket' && (
          <RocketRaceLayout stats={stats} leaderboard={leaderboard} displayMode={displayMode} displaySize={displaySize} />
        )}
        {visualizationMode === 'race' && (
          <RaceLayout stats={stats} leaderboard={leaderboard} displayMode={displayMode} displaySize={displaySize} />
        )}
      </div>
    </div>
  );
};

export default LeaderboardVisualizer;
