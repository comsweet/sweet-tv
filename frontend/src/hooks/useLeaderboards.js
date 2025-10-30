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
    userGroups: [],
    timePeriod: 'month',
    customStartDate: '',
    customEndDate: '',
    active: true,
    visibleColumns: {
      sms: true,
      commission: true,
      deals: true
    }
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
      userGroups: [],
      timePeriod: 'month',
      customStartDate: '',
      customEndDate: '',
      active: true,
      visibleColumns: {
        sms: true,
        commission: true,
        deals: true
      }
    });
    setShowModal(true);
  };

  const openEditModal = (leaderboard) => {
    setEditingLeaderboard(leaderboard);
    setForm({
      name: leaderboard.name,
      userGroups: leaderboard.userGroups || [],
      timePeriod: leaderboard.timePeriod,
      customStartDate: leaderboard.customStartDate || '',
      customEndDate: leaderboard.customEndDate || '',
      active: leaderboard.active,
      visibleColumns: leaderboard.visibleColumns || {
        sms: true,
        commission: true,
        deals: true
      }
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
    closeModal
  };
};
