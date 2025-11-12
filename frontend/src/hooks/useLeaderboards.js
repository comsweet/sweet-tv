import { useState } from 'react';
import {
  getLeaderboards,
  createLeaderboard,
  updateLeaderboard,
  deleteLeaderboard
} from '../services/api';

/**
 * Custom hook för att hantera leaderboards
 */
export const useLeaderboards = () => {
  const [leaderboards, setLeaderboards] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingLeaderboard, setEditingLeaderboard] = useState(null);
  const [form, setForm] = useState({
    name: '',
    type: 'standard', // 'standard' | 'metrics-grid' | 'team-battle' | 'trend-chart'
    userGroups: [],
    timePeriod: 'month',
    customStartDate: '',
    customEndDate: '',
    active: true,
    sortBy: 'commission',
    visibleColumns: {
      dealsPerHour: true,
      sms: true,
      commission: true,
      deals: true,
      campaignBonus: true,
      total: true
    },
    columnOrder: ['dealsPerHour', 'deals', 'sms', 'commission', 'campaignBonus', 'total'],
    // NEW: Enhanced display options
    displayMode: 'individual', // 'individual' | 'groups'
    topN: null, // null = show all
    visualizationMode: 'table', // 'table' | 'cards' | 'progress' | 'rocket' | 'race'
    showGraphs: false,
    showGap: true,
    showMiniStats: false,
    // Goal configuration
    goalValue: null, // null = auto
    goalLabel: '',
    // Auto-scroll configuration
    enableAutoScroll: true,
    // Logos
    brandLogo: null, // Left side - varumärke
    companyLogo: null, // Right side - företag
    logo: null, // Legacy fallback
    // METRICS GRID specific fields
    selectedGroups: [], // Array of group IDs to compare
    metrics: [], // Array of metric configs
    colorRules: {}, // Color coding rules per metric
    // TEAM BATTLE specific fields
    description: '',
    battleStartDate: '',
    battleEndDate: '',
    victoryCondition: 'highest_at_end',
    victoryMetric: 'commission_per_hour',
    targetValue: null,
    teams: [
      { teamName: '', teamEmoji: '', color: '#FF6B6B', userGroupIds: [] },
      { teamName: '', teamEmoji: '', color: '#4ECDC4', userGroupIds: [] }
    ],
    // TREND CHART specific fields
    trendDays: 30,
    trendHours: undefined,
    trendMetrics: [{ metric: 'commission', axis: 'left' }],
    refreshInterval: 300000 // 5 minutes default
  });

  const fetchLeaderboards = async () => {
    try {
      const response = await getLeaderboards();
      setLeaderboards(response.data);
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
      throw error;
    }
  };

  const openAddModal = () => {
    setEditingLeaderboard(null);
    setForm({
      name: '',
      type: 'standard',
      userGroups: [],
      timePeriod: 'month',
      customStartDate: '',
      customEndDate: '',
      active: true,
      sortBy: 'commission',
      visibleColumns: {
        dealsPerHour: true,
        sms: true,
        commission: true,
        deals: true,
        campaignBonus: true,
        total: true
      },
      columnOrder: ['dealsPerHour', 'deals', 'sms', 'commission', 'campaignBonus', 'total'],
      // NEW: Enhanced display options
      displayMode: 'individual',
      topN: null,
      visualizationMode: 'table',
      showGraphs: false,
      showGap: true,
      showMiniStats: false,
      // Goal configuration
      goalValue: null,
      goalLabel: '',
      // Auto-scroll configuration
      enableAutoScroll: true,
      // Logos
      brandLogo: null,
      companyLogo: null,
      logo: null,
      // METRICS GRID specific fields
      selectedGroups: [],
      metrics: [],
      colorRules: {},
      // TEAM BATTLE specific fields
      description: '',
      battleStartDate: '',
      battleEndDate: '',
      victoryCondition: 'highest_at_end',
      victoryMetric: 'commission_per_hour',
      targetValue: null,
      teams: [
        { teamName: '', teamEmoji: '', color: '#FF6B6B', userGroupIds: [] },
        { teamName: '', teamEmoji: '', color: '#4ECDC4', userGroupIds: [] }
      ],
      // TREND CHART specific fields
      trendDays: 30,
      trendHours: undefined,
      trendMetrics: [{ metric: 'commission', axis: 'left' }],
      refreshInterval: 300000
    });
    setShowModal(true);
  };

  const openEditModal = (leaderboard) => {
    setEditingLeaderboard(leaderboard);
    setForm({
      name: leaderboard.name,
      type: leaderboard.type || 'standard',
      userGroups: leaderboard.userGroups || [],
      timePeriod: leaderboard.timePeriod,
      customStartDate: leaderboard.customStartDate || '',
      customEndDate: leaderboard.customEndDate || '',
      active: leaderboard.active,
      sortBy: leaderboard.sortBy || 'commission',
      visibleColumns: leaderboard.visibleColumns || {
        dealsPerHour: true,
        sms: true,
        commission: true,
        deals: true,
        campaignBonus: true,
        total: true
      },
      columnOrder: leaderboard.columnOrder || ['dealsPerHour', 'deals', 'sms', 'commission', 'campaignBonus', 'total'],
      // NEW: Enhanced display options
      displayMode: leaderboard.displayMode || 'individual',
      topN: leaderboard.topN || null,
      visualizationMode: leaderboard.visualizationMode || 'table',
      showGraphs: leaderboard.showGraphs !== undefined ? leaderboard.showGraphs : false,
      showGap: leaderboard.showGap !== undefined ? leaderboard.showGap : true,
      showMiniStats: leaderboard.showMiniStats !== undefined ? leaderboard.showMiniStats : false,
      // Goal configuration
      goalValue: leaderboard.goalValue || null,
      goalLabel: leaderboard.goalLabel || '',
      // Auto-scroll configuration
      enableAutoScroll: leaderboard.enableAutoScroll !== undefined ? leaderboard.enableAutoScroll : true,
      // Logos
      brandLogo: leaderboard.brandLogo || null,
      companyLogo: leaderboard.companyLogo || null,
      logo: leaderboard.logo || null,
      // METRICS GRID specific fields
      selectedGroups: leaderboard.selectedGroups || [],
      metrics: leaderboard.metrics || [],
      colorRules: leaderboard.colorRules || {},
      // TEAM BATTLE specific fields
      description: leaderboard.description || '',
      battleStartDate: leaderboard.battleStartDate || '',
      battleEndDate: leaderboard.battleEndDate || '',
      victoryCondition: leaderboard.victoryCondition || 'highest_at_end',
      victoryMetric: leaderboard.victoryMetric || 'commission_per_hour',
      targetValue: leaderboard.targetValue || null,
      teams: leaderboard.teams || [
        { teamName: '', teamEmoji: '', color: '#FF6B6B', userGroupIds: [] },
        { teamName: '', teamEmoji: '', color: '#4ECDC4', userGroupIds: [] }
      ],
      // TREND CHART specific fields
      trendDays: leaderboard.trendDays !== undefined ? leaderboard.trendDays : 30,
      trendHours: leaderboard.trendHours || undefined,
      trendMetrics: leaderboard.trendMetrics || [{ metric: 'commission', axis: 'left' }],
      refreshInterval: leaderboard.refreshInterval || 300000
    });
    setShowModal(true);
  };

  const saveLeaderboard = async () => {
    try {
      if (!form.name.trim()) {
        throw new Error('Namn krävs!');
      }

      const data = {
        ...form,
        userGroups: form.userGroups.length > 0 ? form.userGroups : []
      };

      if (editingLeaderboard) {
        await updateLeaderboard(editingLeaderboard.id, data);
      } else {
        await createLeaderboard(data);
      }

      setShowModal(false);
      await fetchLeaderboards();
    } catch (error) {
      console.error('Error saving leaderboard:', error);
      throw error;
    }
  };

  const removeLeaderboard = async (id) => {
    try {
      await deleteLeaderboard(id);
      await fetchLeaderboards();
    } catch (error) {
      console.error('Error deleting leaderboard:', error);
      throw error;
    }
  };

  const toggleLeaderboardActive = async (leaderboard) => {
    try {
      await updateLeaderboard(leaderboard.id, {
        ...leaderboard,
        active: !leaderboard.active
      });
      await fetchLeaderboards();
    } catch (error) {
      console.error('Error toggling leaderboard:', error);
      throw error;
    }
  };

  const toggleGroup = (groupId) => {
    setForm(prev => ({
      ...prev,
      userGroups: prev.userGroups.includes(groupId)
        ? prev.userGroups.filter(id => id !== groupId)
        : [...prev.userGroups, groupId]
    }));
  };

  const toggleColumn = (columnName) => {
    setForm(prev => ({
      ...prev,
      visibleColumns: {
        ...prev.visibleColumns,
        [columnName]: !prev.visibleColumns[columnName]
      }
    }));
  };

  const moveColumn = (columnName, direction) => {
    setForm(prev => {
      const currentOrder = [...prev.columnOrder];
      const currentIndex = currentOrder.indexOf(columnName);

      if (currentIndex === -1) return prev;

      if (direction === 'up' && currentIndex > 0) {
        // Swap with previous
        [currentOrder[currentIndex - 1], currentOrder[currentIndex]] =
        [currentOrder[currentIndex], currentOrder[currentIndex - 1]];
      } else if (direction === 'down' && currentIndex < currentOrder.length - 1) {
        // Swap with next
        [currentOrder[currentIndex], currentOrder[currentIndex + 1]] =
        [currentOrder[currentIndex + 1], currentOrder[currentIndex]];
      }

      return {
        ...prev,
        columnOrder: currentOrder
      };
    });
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingLeaderboard(null);
  };

  return {
    leaderboards,
    showModal,
    editingLeaderboard,
    form,
    setForm,
    fetchLeaderboards,
    openAddModal,
    openEditModal,
    saveLeaderboard,
    removeLeaderboard,
    toggleLeaderboardActive,
    toggleGroup,
    toggleColumn,
    moveColumn,
    closeModal
  };
};
