/**
 * Ban API Service
 * Handles all ban-related API calls for React Native app
 */

const API_BASE_URL = 'YOUR_API_BASE_URL'; // Replace with your actual API URL

/**
 * Ban a user
 * @param {string} userId - The ID of the user to ban
 * @param {string} reason - Reason for the ban
 * @param {boolean} permanent - Whether the ban is permanent
 * @param {number} duration - Duration in hours (for temporary bans)
 * @param {string} token - Admin authentication token
 */
export const banUserAPI = async (userId, reason, permanent = true, duration = null, token) => {
  try {
 } catch (error) {
    console.error('Error banning user:', error);
    throw error;
  }
};

/**
 * Unban a user
 * @param {string} userId - The ID of the user to unban
 * @param {string} token - Admin authentication token
 */
export const unbanUserAPI = async (userId, token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/unban`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to unban user');
    }

    return data;
  } catch (error) {
    console.error('Error unbanning user:', error);
    throw error;
  }
};

/**
 * Get ban status for a user
 * @param {string} userId - The ID of the user
 * @param {string} token - Admin authentication token
 */
export const getBanStatusAPI = async (userId, token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/ban-status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to get ban status');
    }

    return data;
  } catch (error) {
    console.error('Error getting ban status:', error);
    throw error;
  }
};

/**
 * Get all banned users
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @param {boolean} permanent - Filter by permanent bans (optional)
 * @param {string} token - Admin authentication token
 */
export const getBannedUsersAPI = async (page = 1, limit = 10, permanent = null, token) => {
  try {
    let url = `${API_BASE_URL}/api/admin/users/banned?page=${page}&limit=${limit}`;
    if (permanent !== null) {
      url += `&permanent=${permanent}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to get banned users');
    }

    return data;
  } catch (error) {
    console.error('Error getting banned users:', error);
    throw error;
  }
};

/**
 * Update ban details
 * @param {string} userId - The ID of the user
 * @param {object} updates - Updated ban details { reason?, duration?, permanent? }
 * @param {string} token - Admin authentication token
 */
export const updateBanAPI = async (userId, updates, token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/ban`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to update ban');
    }

    return data;
  } catch (error) {
    console.error('Error updating ban:', error);
    throw error;
  }
};