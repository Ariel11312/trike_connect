import axios from 'axios';

const API_BASE_URL = 'http://192.168.100.37:5000/api';

export const apiService = {
  async getMessages(limit = 50) {
    try {
      const response = await axios.get(`${API_BASE_URL}/messages`, {
        params: { limit }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching messages:', error);
      throw error;
    }
  },

  async getOnlineUsers() {
    try {
      const response = await axios.get(`${API_BASE_URL}/users/online`);
      return response.data;
    } catch (error) {
      console.error('Error fetching online users:', error);
      throw error;
    }
  }
};