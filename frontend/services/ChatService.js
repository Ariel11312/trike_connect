const API_BASE_URL = 'http://192.168.100.37:5000';

export const getAllChats = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/get-all-chats`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    return await response.json();
  } catch (error) {
    console.error('Error in getAllChats:', error);
    throw error;
  }
};

export const createNewChat = async (members) => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/create-new-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ members }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    return await response.json();
  } catch (error) {
    console.error('Error in createNewChat:', error);
    throw error;
  }
};

export const getChatById = async (chatId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/${chatId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    return await response.json();
  } catch (error) {
    console.error('Error in getChatById:', error);
    throw error;
  }
};

export const deleteChat = async (chatId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/${chatId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw error;
    }

    return await response.json();
  } catch (error) {
    console.error('Error in deleteChat:', error);
    throw error;
  }
};