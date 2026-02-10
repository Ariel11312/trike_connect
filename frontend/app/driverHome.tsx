import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  RefreshControl,
  Linking,
} from "react-native";
import { useState, useEffect, useRef } from "react";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Camera } from "react-native-maps";
import * as Location from "expo-location";
import { Stack, useRouter } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io, Socket } from 'socket.io-client';

interface LocationData {
  name: string;
  latitude: number;
  longitude: number;
}

interface Ride {
  _id: string;
  userId: string | {
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phoneNumber?: string;
  };
  firstname: string;
  lastname: string;
  pickupLocation: LocationData;
  dropoffLocation: LocationData;
  distance: number;
  fare: number;
  status: string;
  createdAt: string;
  completedAt?: string;
}

interface Driver {
  id: string;
  firstname: string;
  lastname: string;
  todaName: string;
}

interface LocationWithHeading {
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
}

interface GroupedRides {
  [date: string]: Ride[];
}

interface User {
  _id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

// Storage keys
const STORAGE_KEYS = {
  ACTIVE_RIDE: '@driver_active_ride',
  RIDE_PHASE: '@driver_ride_phase',
  LAST_READ_MESSAGE: '@driver_last_read_message',
};

// CONFIGURATION
const SOCKET_URL = 'http://192.168.100.37:5000';
const API_URL = 'http://192.168.100.37:5000';

export default function DriverHome() {
  const router = useRouter();
  const [driver, setDriver] = useState<Driver | null>(null);
  const [pendingRides, setPendingRides] = useState<Ride[]>([]);
  const [completedRides, setCompletedRides] = useState<Ride[]>([]);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [ridePhase, setRidePhase] = useState<"to-pickup" | "to-dropoff" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showRidesList, setShowRidesList] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [isRestoringState, setIsRestoringState] = useState(true);
  const [historyGrouping, setHistoryGrouping] = useState<"day" | "month" | "year">("day");

  // Chat notification states
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);

  // Passenger/User info
  const [passengerInfo, setPassengerInfo] = useState<User | null>(null);
  const [isLoadingPassengerInfo, setIsLoadingPassengerInfo] = useState(false);

  const [currentLocation, setCurrentLocation] = useState<LocationWithHeading | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 14.8847,
    longitude: 120.8572,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);
  
  // Refs for tracking
  const mapRef = useRef<MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const headingSubscription = useRef<Location.LocationSubscription | null>(null);
  const lastHeading = useRef<number>(0);
  const isNavigating = useRef<boolean>(false);
  const socketRef = useRef<Socket | null>(null);

  // Initialize Socket.IO connection
  useEffect(() => {
    console.log('🔌 Initializing socket connection...');
    
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, {
        autoConnect: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling'],
      });

      console.log('✅ Socket instance created');
    }

    return () => {
      if (socketRef.current?.connected) {
        console.log('🔌 Disconnecting socket');
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Load last read message on mount
  useEffect(() => {
    loadLastReadMessage();
  }, []);

  const loadLastReadMessage = async () => {
    try {
      const savedMessageId = await AsyncStorage.getItem(STORAGE_KEYS.LAST_READ_MESSAGE);
      if (savedMessageId) {
        setLastReadMessageId(savedMessageId);
        console.log('📖 Loaded last read message:', savedMessageId);
      }
    } catch (error) {
      console.error('Error loading last read message:', error);
    }
  };

  // Setup socket listeners when driver is loaded
  useEffect(() => {
    if (!socketRef.current || !driver?.id) return;

    const socket = socketRef.current;

    console.log('🔧 Setting up socket listeners for driver:', driver.id);
    socket.removeAllListeners();

    // Connection events
    socket.on('connect', () => {
      console.log('✅ Connected to server with ID:', socket.id);
      setSocketConnected(true);
      
      console.log('Emitting user-online event for driver:', driver.id);
      socket.emit('user-online', driver.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from server. Reason:', reason);
      setSocketConnected(false);
    });

    socket.on('connect_error', (error: Error) => {
      console.error('❌ Connection error:', error.message);
      setSocketConnected(false);
    });

    // Handle incoming messages
    socket.on('receive-message', (messageData: any) => {
      console.log('📨 Received message:', messageData);

      const { message } = messageData;
      
      // Check if this is a new message (not already read)
      if (driver?.id && message.sender !== driver.id) {
        // Only alert if this message is newer than the last read message
        const isNewMessage = !lastReadMessageId || message._id !== lastReadMessageId;
        
        if (isNewMessage) {
          console.log('💬 New unread message from commuter!');
          setHasUnreadMessages(true);
          setUnreadCount(prev => prev + 1);
          
          Alert.alert(
            '💬 New Message',
            message.text || 'You have a new message from a commuter',
            [
              {
                text: 'View',
                onPress: () => handleMessagePassenger(),
              },
              {
                text: 'Later',
                style: 'cancel',
              },
            ]
          );
        }
      }
    });

    // Connect socket
    if (!socket.connected) {
      console.log('🔌 Connecting socket for driver:', driver.id);
      socket.connect();
    }

    return () => {
      socket.removeAllListeners();
    };
  }, [driver?.id, lastReadMessageId]);

  // Fetch unread message count on mount
  useEffect(() => {
    if (driver?.id) {
      fetchUnreadMessageCount();
    }
  }, [driver?.id]);

  const fetchUnreadMessageCount = async () => {
    try {
      const response = await fetch(`${API_URL}/api/chat/unread-count`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const count = data.count || 0;
        setUnreadCount(count);
        setHasUnreadMessages(count > 0);
      }
    } catch (error) {
      console.error('❌ Error fetching unread count:', error);
    }
  };

  // Extract passenger info when active ride changes
  useEffect(() => {
    if (activeRide?.userId) {
      console.log('🔄 Active ride changed, extracting passenger info from userId:', activeRide.userId);
      
      // Check if userId is already populated (an object) or just a string ID
      if (typeof activeRide.userId === 'object' && '_id' in activeRide.userId) {
        // userId is already populated with user data
        const userData: User = {
          _id: activeRide.userId._id,
          firstName: activeRide.userId.firstName || activeRide.firstname,
          lastName: activeRide.userId.lastName || activeRide.lastname,
          phoneNumber: activeRide.userId.phoneNumber || '',
        };
        console.log('✅ Passenger info extracted from populated userId:', userData);
        setPassengerInfo(userData);
        setIsLoadingPassengerInfo(false);
      } else if (typeof activeRide.userId === 'string') {
        // userId is just a string, need to fetch user data
        console.log('🔄 userId is a string, fetching passenger info...');
        fetchPassengerInfo(activeRide.userId);
      }
    } else {
      console.log('ℹ️ No active ride, clearing passenger info');
      setPassengerInfo(null);
    }
  }, [activeRide?.userId]);

  const fetchPassengerInfo = async (userId: string) => {
    if (!userId || typeof userId !== 'string') {
      console.error('❌ Invalid userId provided to fetchPassengerInfo:', userId);
      return;
    }

    setIsLoadingPassengerInfo(true);
    
    try {
      console.log('🔄 Fetching passenger info for userId:', userId);
      console.log('📡 API URL:', `${API_URL}/api/auth/user/${userId}`);
      
      const res = await fetch(`${API_URL}/api/auth/user/${userId}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('📊 Response status:', res.status);
      const data = await res.json();
      console.log('📦 Response data:', JSON.stringify(data, null, 2));

      if (data.success && data.user) {
        const userData: User = {
          _id: data.user._id || data.user.id,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          phoneNumber: data.user.phoneNumber || '',
        };
        
        console.log('✅ Successfully loaded passenger info:', userData);
        setPassengerInfo(userData);
      } else {
        console.error('❌ Failed to fetch passenger info - Invalid response:', data);
        setPassengerInfo(null);
      }
    } catch (error) {
      console.error('❌ Error fetching passenger info:', error);
      setPassengerInfo(null);
    } finally {
      setIsLoadingPassengerInfo(false);
    }
  };

  const handleCallPassenger = () => {
    console.log('📞 handleCallPassenger called');
    console.log('📊 passengerInfo:', passengerInfo);
    console.log('📊 activeRide:', activeRide);

    if (!passengerInfo) {
      console.error('❌ No passenger info available');
      Alert.alert("Error", "Passenger information not available. Please wait while we load it.");
      
      // Try to fetch again if we have userId
      if (activeRide?.userId) {
        console.log('🔄 Retrying passenger info fetch...');
        fetchPassengerInfo(activeRide.userId);
      }
      return;
    }

    if (!passengerInfo.phoneNumber) {
      console.error('❌ No phone number available');
      Alert.alert("Error", "Passenger phone number not available.");
      return;
    }

    const phoneNumber = passengerInfo.phoneNumber.replace(/[^0-9+]/g, '');
    console.log('📞 Calling:', phoneNumber);
    
    Linking.openURL(`tel:${phoneNumber}`)
      .then(() => {
        console.log('✅ Call initiated successfully');
      })
      .catch((error) => {
        console.error('❌ Error initiating call:', error);
        Alert.alert("Error", "Unable to make call. Please check your phone settings.");
      });
  };

  const handleMessagePassenger = async () => {
    console.log('💬 handleMessagePassenger called');
    console.log('📊 passengerInfo:', passengerInfo);
    console.log('📊 driver:', driver);
    console.log('📊 activeRide:', activeRide);

    if (!driver) {
      console.error('❌ No driver info available');
      Alert.alert("Error", "Driver information not loaded. Please try again.");
      return;
    }

    if (!passengerInfo) {
      console.error('❌ No passenger info available');
      Alert.alert("Error", "Passenger information not available. Please wait while we load it.");
      
      // Try to fetch again if we have userId
      if (activeRide?.userId) {
        console.log('🔄 Retrying passenger info fetch...');
        await fetchPassengerInfo(activeRide.userId);
      }
      return;
    }

    try {
      console.log('🔄 Creating/opening chat with passenger...');
      console.log('Current Driver ID:', driver.id);
      console.log('Passenger ID:', passengerInfo._id);

      const otherUserId = passengerInfo._id;

      // Create or get existing chat with the passenger
      const response = await fetch(`${API_URL}/api/chat/create-new-chat`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          members: [driver.id, otherUserId]
        })
      });

      console.log('📊 Chat creation response status:', response.status);

      // Check if response is ok
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Server error:', errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Parse JSON response
      const responseData = await response.json();
      console.log('📦 Chat response data:', responseData);

      if (responseData.success) {
        console.log('✅ Chat created/retrieved:', responseData.data._id);

        // Navigate to chat interface
        router.push({
          pathname: '/chat',
          params: {
            chatId: responseData.data._id,
            driverName: `${passengerInfo.firstName} ${passengerInfo.lastName}`,
            otherUserId: otherUserId,
          }
        });
      } else {
        console.error('❌ Failed to create chat:', responseData);
        Alert.alert("Error", responseData.message || "Failed to start chat. Please try again.");
      }
    } catch (error) {
      console.error('❌ Error creating chat:', error);
      Alert.alert("Error", "Unable to start chat. Please check your connection.");
    }
  };

  // This function should be called from the chat page when messages are viewed
  const markMessagesAsRead = async (latestMessageId: string) => {
    try {
      console.log('✅ Marking messages as read up to:', latestMessageId);
      setLastReadMessageId(latestMessageId);
      setHasUnreadMessages(false);
      setUnreadCount(0);
      
      // Persist to AsyncStorage
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_READ_MESSAGE, latestMessageId);
    } catch (error) {
      console.error('Error saving last read message:', error);
    }
  };

  // Restore persisted state on app launch
  useEffect(() => {
    restorePersistedState();
  }, []);

  const restorePersistedState = async () => {
    try {
      console.log('🔄 Restoring persisted state...');
      
      const [savedRide, savedPhase] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_RIDE),
        AsyncStorage.getItem(STORAGE_KEYS.RIDE_PHASE),
      ]);

      if (savedRide && savedPhase) {
        const ride: Ride = JSON.parse(savedRide);
        const phase = savedPhase as "to-pickup" | "to-dropoff";
        
        console.log('✅ Restored active ride:', ride._id);
        console.log('✅ Restored phase:', phase);
        
        setActiveRide(ride);
        setRidePhase(phase);
        setShowRidesList(false);
        
        console.log(`🔄 Ride restored - continuing ${phase === "to-pickup" ? "to pickup" : "to dropoff"} location`);
      } else {
        console.log('ℹ️ No persisted ride state found');
      }
    } catch (error) {
      console.error('❌ Error restoring state:', error);
    } finally {
      setIsRestoringState(false);
    }
  };

  // Persist active ride state whenever it changes
  useEffect(() => {
    if (isRestoringState) return;
    
    const persistState = async () => {
      try {
        if (activeRide && ridePhase) {
          console.log('💾 Persisting ride state...');
          await Promise.all([
            AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_RIDE, JSON.stringify(activeRide)),
            AsyncStorage.setItem(STORAGE_KEYS.RIDE_PHASE, ridePhase),
          ]);
          console.log('✅ State persisted');
        } else {
          console.log('🗑️ Clearing persisted state...');
          await Promise.all([
            AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_RIDE),
            AsyncStorage.removeItem(STORAGE_KEYS.RIDE_PHASE),
          ]);
          console.log('✅ State cleared');
        }
      } catch (error) {
        console.error('❌ Error persisting state:', error);
      }
    };

    persistState();
  }, [activeRide, ridePhase, isRestoringState]);

  // Restore route when state is restored
  useEffect(() => {
    if (!isRestoringState && activeRide && ridePhase && currentLocation) {
      console.log('🗺️ Restoring route...');
      const destination = ridePhase === "to-pickup" 
        ? activeRide.pickupLocation 
        : activeRide.dropoffLocation;
      
      getDirections(
        { name: "Current", latitude: currentLocation.latitude, longitude: currentLocation.longitude },
        destination
      );
      
      setTimeout(() => {
        if (currentLocation && mapRef.current) {
          updateMapCamera(currentLocation);
        }
      }, 500);
    }
  }, [isRestoringState, currentLocation]);

  // Fetch driver info
  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(res => res.json())
      .then(data => {
        console.log('Driver data received:', data);
        if (data.success && data.user) {
          setDriver({
            id: data.user.id,
            firstname: data.user.firstName,
            lastname: data.user.lastName,
            todaName: data.user.todaName, 
          });
        }
      })
      .catch(error => console.error('Error fetching driver:', error));
  }, []);

  // Initialize location tracking
  useEffect(() => {
    startLocationTracking();
    
    return () => {
      stopLocationTracking();
    };
  }, []);

  // Update navigation state
  useEffect(() => {
    isNavigating.current = !!(activeRide && ridePhase);
  }, [activeRide, ridePhase]);

  // Poll for ride status updates to detect cancellations
  useEffect(() => {
    if (!activeRide) return;

    const checkRideStatus = async () => {
      try {
        const res = await fetch(`${API_URL}/api/rides/${activeRide._id}`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await res.json();

        if (data.success && data.ride) {
          const rideStatus = data.ride.status;
          
          console.log('📊 Ride status check:', {
            rideId: data.ride._id,
            status: rideStatus,
            previousStatus: activeRide.status,
          });
          
          // Update the active ride with fresh data (including potentially populated userId)
          if (rideStatus === 'accepted' || rideStatus === 'in-progress') {
            console.log('🔄 Updating active ride with fresh data');
            setActiveRide(data.ride);
          }
          
          if (rideStatus === 'cancelled') {
            console.log('❌ Ride was cancelled');
            
            // Clear active ride state
            setActiveRide(null);
            setRidePhase(null);
            setPassengerInfo(null);
            setRouteCoordinates([]);
            setShowRidesList(true);
            
            // Reset map camera
            if (currentLocation && mapRef.current) {
              const camera: Partial<Camera> = {
                center: {
                  latitude: currentLocation.latitude,
                  longitude: currentLocation.longitude,
                },
                zoom: 15,
                heading: 0,
                pitch: 0,
              };
              mapRef.current.animateCamera(camera, { duration: 1000 });
            }
            
            // Show alert
            Alert.alert(
              '❌ Ride Cancelled',
              data.ride.cancelledReason || 'The ride has been cancelled by the passenger.',
              [{ 
                text: 'OK',
                onPress: () => {
                  // Refresh pending rides list
                  fetchPendingRides();
                }
              }]
            );
          }
        }
      } catch (error) {
        console.error('❌ Error checking ride status:', error);
      }
    };

    // Poll every 3 seconds
    const interval = setInterval(checkRideStatus, 3000);
    
    // Run immediately on mount
    checkRideStatus();
    
    return () => clearInterval(interval);
  }, [activeRide]);

  const startLocationTracking = async () => {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== "granted") {
        Alert.alert("Permission Denied", "Location permission is required");
        return;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== "granted") {
        console.log("Background location permission not granted");
      }

      const initialLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const initialLoc: LocationWithHeading = {
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
        heading: initialLocation.coords.heading,
        speed: initialLocation.coords.speed,
      };

      setCurrentLocation(initialLoc);
      lastHeading.current = initialLocation.coords.heading || 0;

      if (!activeRide) {
        setMapRegion({
          latitude: initialLoc.latitude,
          longitude: initialLoc.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 5,
        },
        (location) => {
          handleLocationUpdate(location);
        }
      );

      headingSubscription.current = await Location.watchHeadingAsync((headingData) => {
        handleHeadingUpdate(headingData);
      });

      console.log('✅ Location tracking started');
    } catch (error) {
      console.error("Error starting location tracking:", error);
      Alert.alert("Error", "Unable to start location tracking");
    }
  };

  const stopLocationTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }
    if (headingSubscription.current) {
      headingSubscription.current.remove();
      headingSubscription.current = null;
    }
    console.log('🛑 Location tracking stopped');
  };

  const handleLocationUpdate = (location: Location.LocationObject) => {
    const newLocation: LocationWithHeading = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      heading: location.coords.heading,
      speed: location.coords.speed,
    };

    setCurrentLocation(newLocation);

    if (location.coords.heading !== null && location.coords.heading !== undefined) {
      lastHeading.current = location.coords.heading;
    }

    if (isNavigating.current && mapRef.current) {
      updateMapCamera(newLocation);
    }

    if (isNavigating.current && activeRide && ridePhase) {
      const destination = ridePhase === "to-pickup" 
        ? activeRide.pickupLocation 
        : activeRide.dropoffLocation;
      
      if (shouldRecalculateRoute(newLocation, destination)) {
        getDirections(
          { name: "Current", latitude: newLocation.latitude, longitude: newLocation.longitude },
          destination
        );
      }
    }
  };

  const handleHeadingUpdate = (headingData: Location.LocationHeadingObject) => {
    const heading = headingData.trueHeading !== -1 ? headingData.trueHeading : headingData.magHeading;
    lastHeading.current = heading;

    setCurrentLocation(prev => {
      if (!prev) return prev;
      
      const updatedLocation: LocationWithHeading = {
        ...prev,
        heading: heading,
      };

      if (isNavigating.current && mapRef.current) {
        updateMapCamera(updatedLocation);
      }

      return updatedLocation;
    });
  };

  const updateMapCamera = (location: LocationWithHeading) => {
    if (!mapRef.current) return;

    const camera: Partial<Camera> = {
      center: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
      zoom: 17,
      heading: location.heading || lastHeading.current || 0,
      pitch: 45,
    };

    mapRef.current.animateCamera(camera, { duration: 500 });
  };

  const shouldRecalculateRoute = (current: LocationWithHeading, destination: LocationData): boolean => {
    return false;
  };

  // Fetch pending rides
  const fetchPendingRides = async () => {
    if (!driver?.todaName) return;

    try {
      const res = await fetch(
        `${API_URL}/api/rides?status=pending&todaName=${encodeURIComponent(driver.todaName)}`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await res.json();

      if (data.success) {
        setPendingRides(data.rides);
      }
    } catch (error) {
      console.error('Error fetching rides:', error);
    }
  };

  // Fetch completed rides history
  const fetchCompletedRides = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rides?status=completed`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (data.success) {
        setCompletedRides(data.rides);
      }
    } catch (error) {
      console.error('Error fetching completed rides:', error);
    }
  };

  useEffect(() => {
    console.log('Component mounted, starting interval');
    fetchPendingRides();
    
    const interval = setInterval(() => {
      fetchPendingRides();
    }, 5000);
    
    return () => {
      console.log('Component unmounting, clearing interval');
      clearInterval(interval);
    };
  }, [driver?.todaName]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPendingRides();
    if (showHistory) {
      await fetchCompletedRides();
    }
    setRefreshing(false);
  };

  // Group rides by date
  const groupRidesByDate = (rides: Ride[]): GroupedRides => {
    const grouped: GroupedRides = {};
    
    rides.forEach(ride => {
      const date = new Date(ride.completedAt || ride.createdAt);
      let key: string;
      
      if (historyGrouping === "day") {
        key = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      } else if (historyGrouping === "month") {
        key = date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long' 
        });
      } else {
        key = date.getFullYear().toString();
      }
      
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(ride);
    });
    
    return grouped;
  };

  // Calculate total earnings
  const calculateTotalEarnings = (rides: Ride[]): number => {
    return rides.reduce((total, ride) => total + ride.fare, 0);
  };

  const getDirections = async (origin: LocationData, destination: LocationData) => {
    try {
      if (!origin.latitude || !origin.longitude || !destination.latitude || !destination.longitude) {
        console.error('❌ Invalid coordinates provided');
        return;
      }

      if (Math.abs(origin.latitude) > 90 || Math.abs(destination.latitude) > 90 ||
          Math.abs(origin.longitude) > 180 || Math.abs(destination.longitude) > 180) {
        console.error('❌ Coordinates out of valid range');
        return;
      }

      console.log('🗺️ Fetching directions from OSRM');
      
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates;

        const points: { latitude: number; longitude: number }[] = coordinates.map((coord: number[]) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));

        console.log('✅ Road route found with', points.length, 'points');
        setRouteCoordinates(points);
        
        if (!isNavigating.current) {
          fitMapToMarkers(origin, destination);
        }
      } else {
        const straightLine = [
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: destination.latitude, longitude: destination.longitude }
        ];
        setRouteCoordinates(straightLine);
        if (!isNavigating.current) {
          fitMapToMarkers(origin, destination);
        }
      }
    } catch (error) {
      console.error('❌ Error fetching route:', error);
      const straightLine = [
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude }
      ];
      setRouteCoordinates(straightLine);
      if (!isNavigating.current) {
        fitMapToMarkers(origin, destination);
      }
    }
  };

  const fitMapToMarkers = (start: LocationData, end: LocationData) => {
    const minLat = Math.min(start.latitude, end.latitude);
    const maxLat = Math.max(start.latitude, end.latitude);
    const minLng = Math.min(start.longitude, end.longitude);
    const maxLng = Math.max(start.longitude, end.longitude);

    const latDelta = Math.max((maxLat - minLat) * 2, 0.02);
    const lngDelta = Math.max((maxLng - minLng) * 2, 0.02);

    const newRegion = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };

    setMapRegion(newRegion);
  };

  const handleAcceptRide = async (ride: Ride) => {
    if (!driver) {
      Alert.alert("Error", "Driver information not loaded");
      return;
    }

    try {
      console.log('🎯 Accepting ride:', ride._id);
      console.log('👤 Driver ID:', driver.id);
      console.log('👤 Passenger User ID:', ride.userId);
      
      // First, update the ride status to accepted
      const statusRes = await fetch(`${API_URL}/api/rides/${ride._id}/status`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'accepted'
        }),
      });

      const statusData = await statusRes.json();
      console.log('Status update response:', statusData);

      // Then, assign the driver to the ride
      const driverRes = await fetch(`${API_URL}/api/rides/${ride._id}/driver`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          driver: driver.id,
        }),
      });

      const driverData = await driverRes.json();
      console.log('Driver assignment response:', driverData);
      
      if ((statusData.success || statusRes.ok) && (driverData.success || driverRes.ok)) {
        console.log('✅ Ride accepted and driver assigned successfully');
        setActiveRide(ride);
        setRidePhase("to-pickup");
        setShowRidesList(false);
        
        // Passenger info will be extracted automatically by the useEffect
        
        if (currentLocation) {
          await getDirections(
            { name: "Current", latitude: currentLocation.latitude, longitude: currentLocation.longitude },
            ride.pickupLocation
          );
          
          setTimeout(() => {
            if (currentLocation && mapRef.current) {
              updateMapCamera(currentLocation);
            }
          }, 500);
        }

        Alert.alert("Ride Accepted", "Navigate to pickup location");
      } else {
        console.error('❌ Failed to accept ride');
        console.error('Status response:', statusData);
        console.error('Driver response:', driverData);
        Alert.alert("Error", "Failed to accept ride");
      }
    } catch (error) {
      console.error('❌ Error accepting ride:', error);
      Alert.alert("Error", "Failed to accept ride");
    }
  };

  const handleRejectRide = async (rideId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/rides/${rideId}/cancel`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cancelledBy: 'driver',
          cancelledReason: 'Driver declined the ride'
        }),
      });

      if (res.ok) {
        Alert.alert("Ride Rejected", "Ride has been declined");
        fetchPendingRides();
      }
    } catch (error) {
      console.error('Error rejecting ride:', error);
    }
  };

  const handlePickupComplete = async () => {
    Alert.alert(
      "Passenger Picked Up?",
      "Have you picked up the passenger?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Yes, Start Trip",
          onPress: async () => {
            console.log('🚗 Starting trip to dropoff');
            setRidePhase("to-dropoff");
            
            if (activeRide && currentLocation) {
              await getDirections(
                { name: "Current", latitude: currentLocation.latitude, longitude: currentLocation.longitude },
                activeRide.dropoffLocation
              );
              
              setTimeout(() => {
                if (currentLocation && mapRef.current) {
                  updateMapCamera(currentLocation);
                }
              }, 500);
            }
            
            Alert.alert("Trip Started", "Navigate to dropoff location");
          }
        }
      ]
    );
  };

  const handleDropoffComplete = async () => {
    if (!activeRide) return;

    Alert.alert(
      "Complete Trip?",
      "Has the passenger reached their destination?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Yes, Complete",
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/api/rides/${activeRide._id}/status`, {
                method: 'PUT',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  status: 'completed'
                }),
              });

              if (res.ok) {
                Alert.alert("Trip Completed", `You earned ₱${activeRide.fare}!`);
                setActiveRide(null);
                setRidePhase(null);
                setPassengerInfo(null);
                setRouteCoordinates([]);
                setShowRidesList(true);
                
                if (currentLocation && mapRef.current) {
                  const camera: Partial<Camera> = {
                    center: {
                      latitude: currentLocation.latitude,
                      longitude: currentLocation.longitude,
                    },
                    zoom: 15,
                    heading: 0,
                    pitch: 0,
                  };
                  mapRef.current.animateCamera(camera, { duration: 1000 });
                }
                
                fetchPendingRides();
              }
            } catch (error) {
              console.error('Error completing ride:', error);
            }
          }
        }
      ]
    );
  };

  const centerOnUser = () => {
    if (currentLocation && mapRef.current) {
      if (isNavigating.current) {
        updateMapCamera(currentLocation);
      } else {
        const camera: Partial<Camera> = {
          center: {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          },
          zoom: 15,
          heading: 0,
          pitch: 0,
        };
        mapRef.current.animateCamera(camera, { duration: 500 });
      }
    }
  };

  const getDestinationMarker = () => {
    if (!activeRide) return null;
    
    if (ridePhase === "to-pickup") {
      return (
        <Marker
          coordinate={{
            latitude: activeRide.pickupLocation.latitude,
            longitude: activeRide.pickupLocation.longitude,
          }}
          title="Pickup Location"
          description={activeRide.pickupLocation.name}
          pinColor="green"
        />
      );
    } else if (ridePhase === "to-dropoff") {
      return (
        <Marker
          coordinate={{
            latitude: activeRide.dropoffLocation.latitude,
            longitude: activeRide.dropoffLocation.longitude,
          }}
          title="Dropoff Location"
          description={activeRide.dropoffLocation.name}
          pinColor="red"
        />
      );
    }
    return null;
  };

  const getCarRotation = () => {
    if (currentLocation?.heading !== null && currentLocation?.heading !== undefined) {
      return currentLocation.heading;
    }
    return lastHeading.current || 0;
  };

  const openHistory = () => {
    fetchCompletedRides();
    setShowHistory(true);
  };

  const groupedRides = groupRidesByDate(completedRides);
  const sortedDates = Object.keys(groupedRides).sort((a, b) => {
    const dateA = new Date(groupedRides[a][0].completedAt || groupedRides[a][0].createdAt);
    const dateB = new Date(groupedRides[b][0].completedAt || groupedRides[b][0].createdAt);
    return dateB.getTime() - dateA.getTime();
  });

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          region={mapRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          followsUserLocation={false}
          rotateEnabled={true}
          pitchEnabled={true}
          zoomEnabled={true}
          scrollEnabled={true}
          mapType="standard"
        >
          {currentLocation && (
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat={true}
              rotation={getCarRotation()}
            >
              <View style={styles.driverMarker}>
                <View style={styles.carIcon}>
                  <Text style={styles.carEmoji}>🚗</Text>
                </View>
                <View style={styles.accuracyCircle} />
              </View>
            </Marker>
          )}

          {getDestinationMarker()}

          {routeCoordinates.length >= 2 && (
            <>
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#000000"
                strokeWidth={10}
                lineCap="round"
                lineJoin="round"
                geodesic={true}
              />
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#4285F4"
                strokeWidth={6}
                lineCap="round"
                lineJoin="round"
                geodesic={true}
              />
            </>
          )}
        </MapView>

        <TouchableOpacity
          style={styles.recenterButton}
          onPress={centerOnUser}
        >
          <Text style={styles.recenterIcon}>🎯</Text>
        </TouchableOpacity>

        {isNavigating.current && currentLocation?.speed != null && currentLocation.speed >= 0 && (
          <View style={styles.speedIndicator}>
            <Text style={styles.speedText}>
              {Math.round(currentLocation.speed * 3.6)} km/h
            </Text>
          </View>
        )}

        <View style={styles.driverCard}>
          <Text style={styles.emoji}>🚗</Text>
          <Text style={styles.driverName}>
            {driver ? `${driver.firstname} ${driver.lastname}` : "Loading..."}
          </Text>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={openHistory}
          >
            <Text style={styles.historyButtonText}>📋</Text>
          </TouchableOpacity>
        </View>

        {activeRide && (
          <View style={styles.activeRideCard}>
            <Text style={styles.activeRideTitle}>
              {ridePhase === "to-pickup" ? "📍 Going to Pickup" : "🎯 Going to Dropoff"}
            </Text>
            <Text style={styles.passengerName}>
              Passenger: {activeRide.firstname} {activeRide.lastname}
            </Text>
            <Text style={styles.destination}>
              {ridePhase === "to-pickup" 
                ? activeRide.pickupLocation.name 
                : activeRide.dropoffLocation.name}
            </Text>
            <Text style={styles.fareInfo}>Fare: ₱{activeRide.fare}</Text>
            
            {/* Passenger Info Container with Message and Call Buttons */}
            <View style={styles.passengerInfoContainer}>
              <View style={styles.passengerInfo}>
                <Text style={styles.passengerInfoName}>
                  👤 {passengerInfo ? `${passengerInfo.firstName} ${passengerInfo.lastName}` : `${activeRide.firstname} ${activeRide.lastname}`}
                </Text>
                {passengerInfo?.phoneNumber ? (
                  <Text style={styles.passengerInfoPhone}>
                    📞 {passengerInfo.phoneNumber}
                  </Text>
                ) : isLoadingPassengerInfo ? (
                  <Text style={styles.passengerInfoPhone}>
                    Loading contact info...
                  </Text>
                ) : (
                  <Text style={styles.passengerInfoPhone}>
                    Contact info not available
                  </Text>
                )}
              </View>

              {/* Action Buttons - Message and Call */}
              <View style={styles.passengerActionButtons}>
                <TouchableOpacity
                  style={[styles.messageButton, !passengerInfo && styles.disabledButton]}
                  onPress={handleMessagePassenger}
                  disabled={!passengerInfo}
                >
                  <Text style={styles.actionIcon}>💬</Text>
                  {hasUnreadMessages && (
                    <View style={styles.notificationBadge}>
                      <Text style={styles.notificationText}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.callButton, (!passengerInfo || !passengerInfo.phoneNumber) && styles.disabledButton]}
                  onPress={handleCallPassenger}
                  disabled={!passengerInfo || !passengerInfo.phoneNumber}
                >
                  <Text style={styles.actionIcon}>📞</Text>
                </TouchableOpacity>
              </View>
            </View>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={ridePhase === "to-pickup" ? handlePickupComplete : handleDropoffComplete}
            >
              <Text style={styles.actionButtonText}>
                {ridePhase === "to-pickup" ? "✓ Picked Up Passenger" : "✓ Complete Trip"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {!activeRide && (
          <TouchableOpacity
            style={styles.showRidesButton}
            onPress={() => setShowRidesList(true)}
          >
            <Text style={styles.showRidesButtonText}>
              📋 Available Rides ({pendingRides.length})
            </Text>
          </TouchableOpacity>
        )}

        {/* Pending Rides Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={showRidesList && !activeRide}
          onRequestClose={() => setShowRidesList(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Available Rides</Text>
                <TouchableOpacity onPress={() => setShowRidesList(false)}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.ridesList}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
              >
                {pendingRides.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateEmoji}>😴</Text>
                    <Text style={styles.emptyStateText}>No rides available</Text>
                    <Text style={styles.emptyStateSubtext}>Pull down to refresh</Text>
                  </View>
                ) : (
                  pendingRides.map((ride) => (
                    <View key={ride._id} style={styles.rideCard}>
                      <View style={styles.rideHeader}>
                        <Text style={styles.passengerNameCard}>
                          👤 {ride.firstname} {ride.lastname}
                        </Text>
                        <Text style={styles.fareCard}>₱{ride.fare}</Text>
                      </View>

                      <View style={styles.locationInfo}>
                        <View style={styles.locationRow}>
                          <Text style={styles.locationIcon}>🟢</Text>
                          <Text style={styles.locationText} numberOfLines={2}>
                            {ride.pickupLocation.name}
                          </Text>
                        </View>
                        <View style={styles.locationRow}>
                          <Text style={styles.locationIcon}>🔴</Text>
                          <Text style={styles.locationText} numberOfLines={2}>
                            {ride.dropoffLocation.name}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.rideDetails}>
                        <Text style={styles.detailText}>
                          📏 {ride.distance} km
                        </Text>
                        <Text style={styles.detailText}>
                          🕐 {new Date(ride.createdAt).toLocaleTimeString()}
                        </Text>
                      </View>

                      <View style={styles.rideActions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.acceptBtn]}
                          onPress={() => handleAcceptRide(ride)}
                        >
                          <Text style={styles.actionBtnText}>✓ Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.rejectBtn]}
                          onPress={() => handleRejectRide(ride._id)}
                        >
                          <Text style={styles.actionBtnText}>✕ Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* History Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={showHistory}
          onRequestClose={() => setShowHistory(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Ride History</Text>
                <TouchableOpacity onPress={() => setShowHistory(false)}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Grouping Controls */}
              <View style={styles.groupingControls}>
                <TouchableOpacity
                  style={[styles.groupingBtn, historyGrouping === "day" && styles.groupingBtnActive]}
                  onPress={() => setHistoryGrouping("day")}
                >
                  <Text style={[styles.groupingBtnText, historyGrouping === "day" && styles.groupingBtnTextActive]}>
                    Day
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.groupingBtn, historyGrouping === "month" && styles.groupingBtnActive]}
                  onPress={() => setHistoryGrouping("month")}
                >
                  <Text style={[styles.groupingBtnText, historyGrouping === "month" && styles.groupingBtnTextActive]}>
                    Month
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.groupingBtn, historyGrouping === "year" && styles.groupingBtnActive]}
                  onPress={() => setHistoryGrouping("year")}
                >
                  <Text style={[styles.groupingBtnText, historyGrouping === "year" && styles.groupingBtnTextActive]}>
                    Year
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.ridesList}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
              >
                {completedRides.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateEmoji}>📭</Text>
                    <Text style={styles.emptyStateText}>No completed rides yet</Text>
                    <Text style={styles.emptyStateSubtext}>Your ride history will appear here</Text>
                  </View>
                ) : (
                  sortedDates.map((date) => {
                    const ridesForDate = groupedRides[date];
                    const totalEarnings = calculateTotalEarnings(ridesForDate);

                    return (
                      <View key={date} style={styles.historySection}>
                        <View style={styles.historySectionHeader}>
                          <Text style={styles.historySectionDate}>{date}</Text>
                          <View style={styles.historySectionStats}>
                            <Text style={styles.historySectionCount}>
                              {ridesForDate.length} {ridesForDate.length === 1 ? 'ride' : 'rides'}
                            </Text>
                            <Text style={styles.historySectionEarnings}>₱{totalEarnings.toFixed(2)}</Text>
                          </View>
                        </View>

                        {ridesForDate.map((ride) => (
                          <View key={ride._id} style={styles.historyRideCard}>
                            <View style={styles.historyRideHeader}>
                              <Text style={styles.historyPassengerName}>
                                👤 {ride.firstname} {ride.lastname}
                              </Text>
                              <Text style={styles.historyFare}>₱{ride.fare}</Text>
                            </View>

                            <View style={styles.historyLocationInfo}>
                              <View style={styles.locationRow}>
                                <Text style={styles.locationIcon}>🟢</Text>
                                <Text style={styles.historyLocationText} numberOfLines={1}>
                                  {ride.pickupLocation.name}
                                </Text>
                              </View>
                              <View style={styles.locationRow}>
                                <Text style={styles.locationIcon}>🔴</Text>
                                <Text style={styles.historyLocationText} numberOfLines={1}>
                                  {ride.dropoffLocation.name}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.historyRideFooter}>
                              <Text style={styles.historyDetailText}>
                                📏 {ride.distance} km
                              </Text>
                              <Text style={styles.historyDetailText}>
                                🕐 {new Date(ride.completedAt || ride.createdAt).toLocaleTimeString()}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  driverMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  carIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#4285F4',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  carEmoji: {
    fontSize: 20,
  },
  accuracyCircle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(66, 133, 244, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(66, 133, 244, 0.3)',
  },
  recenterButton: {
    position: 'absolute',
    bottom: 140,
    right: 20,
    width: 50,
    height: 50,
    backgroundColor: 'white',
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  recenterIcon: {
    fontSize: 24,
  },
  speedIndicator: {
    position: 'absolute',
    top: 140,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  speedText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  driverCard: {
    position: "absolute",
    top: 60,
    left: 20,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  emoji: {
    fontSize: 24,
    marginRight: 8,
  },
  driverName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  historyButton: {
    marginLeft: 12,
    paddingHorizontal: 8,
  },
  historyButtonText: {
    fontSize: 20,
  },
  activeRideCard: {
    position: "absolute",
    bottom: 140,
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 2,
    borderColor: "#28a745",
  },
  activeRideTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#28a745",
    marginBottom: 8,
  },
  passengerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  destination: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  fareInfo: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#007AFF",
    marginBottom: 12,
  },
  // Passenger Info Container
  passengerInfoContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  passengerInfo: {
    flex: 1,
  },
  passengerInfoName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  passengerInfoPhone: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  passengerActionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginLeft: 12,
  },
  messageButton: {
    backgroundColor: '#007AFF',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  callButton: {
    backgroundColor: '#28a745',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  disabledButton: {
    backgroundColor: '#cccccc',
    opacity: 0.5,
  },
  actionIcon: {
    fontSize: 28,
  },
  notificationBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: 'white',
  },
  notificationText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  actionButton: {
    backgroundColor: "#28a745",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  showRidesButton: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: "#007AFF",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  showRidesButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "80%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    fontSize: 28,
    color: "#999",
  },
  groupingControls: {
    flexDirection: "row",
    padding: 20,
    paddingBottom: 10,
    gap: 10,
  },
  groupingBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    alignItems: "center",
  },
  groupingBtnActive: {
    backgroundColor: "#007AFF",
  },
  groupingBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  groupingBtnTextActive: {
    color: "#fff",
  },
  ridesList: {
    padding: 20,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyStateEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#999",
  },
  rideCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  rideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  passengerNameCard: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
  },
  fareCard: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#28a745",
  },
  locationInfo: {
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  locationIcon: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 2,
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: "#666",
  },
  rideDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  detailText: {
    fontSize: 14,
    color: "#666",
  },
  rideActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginHorizontal: 5,
  },
  acceptBtn: {
    backgroundColor: "#28a745",
  },
  rejectBtn: {
    backgroundColor: "#dc3545",
  },
  actionBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  historySection: {
    marginBottom: 24,
  },
  historySectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: "#007AFF",
  },
  historySectionDate: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  historySectionStats: {
    alignItems: "flex-end",
  },
  historySectionCount: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  historySectionEarnings: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#28a745",
  },
  historyRideCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  historyRideHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  historyPassengerName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  historyFare: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#28a745",
  },
  historyLocationInfo: {
    marginBottom: 10,
  },
  historyLocationText: {
    flex: 1,
    fontSize: 13,
    color: "#666",
  },
  historyRideFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
  },
  historyDetailText: {
    fontSize: 12,
    color: "#999",
  },
});