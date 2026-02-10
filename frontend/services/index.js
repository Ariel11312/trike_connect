import axios from "axios";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace this with your actual server IP address
// For Android emulator: use 10.0.2.2
// For iOS simulator: use localhost or 127.0.0.1
// For physical device: use your computer's IP address (e.g., 192.168.1.100)
const API_BASE_URL = "http://192.168.100.37:5000/api"; // Change this to your server IP

export const axiosInstanceWithCookies = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000, // 10 seconds timeout
});

// Add request interceptor to include JWT token from AsyncStorage
axiosInstanceWithCookies.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('Error retrieving token from AsyncStorage:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle authentication errors
axiosInstanceWithCookies.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired
      try {
        await AsyncStorage.removeItem('token');
        // You might want to navigate to login screen here
        // NavigationService.navigate('Login');
        console.log('Token expired or invalid. Please login again.');
      } catch (e) {
        console.error('Error removing token:', e);
      }
    }
    return Promise.reject(error);
  }
);

export default axiosInstanceWithCookies;