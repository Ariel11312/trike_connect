import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Linking,
} from "react-native";
import { useState, useEffect } from "react";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { Stack, router } from "expo-router";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { axiosInstanceWithCookies } from '../services';

interface LocationData {
  name: string;
  latitude: number;
  longitude: number;
}

interface User {
  id: string;
  firstname: string;
  lastname: string;
}

interface Driver {
  _id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  todaName: string;
  licensePlate: string;
}

// Storage keys
const STORAGE_KEYS = {
  CURRENT_RIDE: '@user_current_ride',
  IS_WAITING: '@user_is_waiting',
  BOOKING_DATA: '@user_booking_data',
  RIDE_HISTORY: '@user_ride_history',
};

interface BookingData {
  pickupLocation: string;
  dropoffLocation: string;
  currentLocation: LocationData | null;
  dropoffMarker: LocationData | null;
  distance: number;
  fare: number;
  routeCoordinates: { latitude: number; longitude: number }[];
  selectedTodaName: string;
}

interface RideHistory {
  id: string;
  pickupLocation: LocationData;
  dropoffLocation: LocationData;
  distance: number;
  fare: number;
  date: string;
  timestamp: number;
}

// Report reasons
const REPORT_REASONS = [
  "Rude or unprofessional behavior",
  "Unsafe driving",
  "Vehicle condition issues",
  "Wrong route taken",
  "Driver asked for extra payment",
  "Driver cancelled without reason",
  "Late arrival",
  "Other",
];

export default function UserHome() {
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [distance, setDistance] = useState(0);
  const [fare, setFare] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"success" | "error">("success");
  const [modalMessage, setModalMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [currentRide, setCurrentRide] = useState<any>(null);
  const [isWaitingForDriver, setIsWaitingForDriver] = useState(false);
  const [isRestoringState, setIsRestoringState] = useState(true);
  const [rideHistory, setRideHistory] = useState<RideHistory[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedTodaName, setSelectedTodaName] = useState("");
  const [todaNames, setTodaNames] = useState<string[]>([]);
  const [assignedDriver, setAssignedDriver] = useState<Driver | null>(null);

  // Report Driver states
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReportReason, setSelectedReportReason] = useState("");
  const [reportComment, setReportComment] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Location states
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [dropoffMarker, setDropoffMarker] = useState<LocationData | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 14.8847,
    longitude: 120.8572,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });

  // Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults] = useState<LocationData[]>([]);

  // Route line coordinates
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);

  // Sample popular locations
  const popularLocations: LocationData[] = [
    { name: "SM City Clark", latitude: 15.1775, longitude: 120.5886 },
    { name: "Clark Freeport Zone", latitude: 15.1855, longitude: 120.5602 },
    { name: "Angeles City Hall", latitude: 15.1450, longitude: 120.5889 },
    { name: "Marquee Mall", latitude: 15.1608, longitude: 120.5936 },
    { name: "Nepo Mall", latitude: 15.1531, longitude: 120.5864 },
    { name: "Clark International Airport", latitude: 15.1859, longitude: 120.5603 },
    { name: "Balibago", latitude: 15.1598, longitude: 120.5897 },
    { name: "Fields Avenue", latitude: 15.1615, longitude: 120.5912 },
    { name: "Plaridel", latitude: 14.8847, longitude: 120.8572 },
    { name: "WalterMart Plaridel", latitude: 14.8889, longitude: 120.8543 },
    { name: "Primark Center Plaridel", latitude: 14.8901, longitude: 120.8561 },
    { name: "Robinsons Place Angeles", latitude: 15.1519, longitude: 120.5851 },
    { name: "SM Pampanga", latitude: 15.0794, longitude: 120.6200 },
  ];

  const FARE_PER_KM = 20;

  // Fetch available TODA names on mount
  useEffect(() => {
    fetchTodaNames();
  }, []);

  const fetchTodaNames = async () => {
    try {
      const res = await fetch('http://192.168.100.37:5000/api/rides/toda-names', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      if (data.success && data.todaNames) {
        setTodaNames(data.todaNames);
        console.log('✅ Loaded TODA names:', data.todaNames);
      }
    } catch (error) {
      console.error('❌ Error fetching TODA names:', error);
      // Fallback TODA names
      setTodaNames(['TODA 1', 'TODA 2', 'TODA 3', 'TODA 4', 'TODA 5']);
    }
  };

  // Restore persisted state on app launch
  useEffect(() => {
    restorePersistedState();
    loadRideHistory();
  }, []);

  const restorePersistedState = async () => {
    try {
      console.log('🔄 Restoring user ride state...');

      const [savedRide, savedWaiting, savedBooking] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.CURRENT_RIDE),
        AsyncStorage.getItem(STORAGE_KEYS.IS_WAITING),
        AsyncStorage.getItem(STORAGE_KEYS.BOOKING_DATA),
      ]);

      if (savedRide && savedWaiting === 'true') {
        const ride = JSON.parse(savedRide);
        console.log('✅ Restored current ride:', ride._id);
        console.log('📋 Full ride object:', JSON.stringify(ride, null, 2));

        setCurrentRide(ride);
        setIsWaitingForDriver(true);

        // Restore booking data if available
        if (savedBooking) {
          const bookingData: BookingData = JSON.parse(savedBooking);
          console.log('✅ Restored booking data');

          setPickupLocation(bookingData.pickupLocation);
          setDropoffLocation(bookingData.dropoffLocation);
          setCurrentLocation(bookingData.currentLocation);
          setDropoffMarker(bookingData.dropoffMarker);
          setDistance(bookingData.distance);
          setFare(bookingData.fare);
          setRouteCoordinates(bookingData.routeCoordinates);
          setSelectedTodaName(bookingData.selectedTodaName || "");

          // Update map to show the route
          if (bookingData.currentLocation && bookingData.dropoffMarker) {
            fitMapToMarkers(bookingData.currentLocation, bookingData.dropoffMarker);
          }
        }

        // Check for driver ID in multiple possible locations
        const driverId = ride.driver || ride.driverId || ride.acceptedBy;

        // Fetch driver info if ride has been accepted
        if (driverId) {
          console.log('🚗 Ride has driver, fetching info for:', driverId);
          fetchDriverInfo(driverId);
        } else {
          console.log('ℹ️ No driver assigned yet, status:', ride.status);
        }

        console.log('🔄 Ride restored - checking status...');
      } else {
        console.log('ℹ️ No persisted ride state found');
      }
    } catch (error) {
      console.error('❌ Error restoring state:', error);
    } finally {
      setIsRestoringState(false);
    }
  };

  const fetchDriverInfo = async (driverIdOrObject: any) => {
    try {
      // Check if driver is already a populated object
      if (typeof driverIdOrObject === 'object' && driverIdOrObject !== null) {
        console.log('✅ Driver is already populated object:', driverIdOrObject);
        const driverData = {
          _id: driverIdOrObject._id || driverIdOrObject.id,
          firstName: driverIdOrObject.firstName,
          lastName: driverIdOrObject.lastName,
          phoneNumber: driverIdOrObject.phoneNumber,
          todaName: driverIdOrObject.todaName || '',
          licensePlate: driverIdOrObject.licensePlate || '',
        };
        setAssignedDriver(driverData);
        console.log('✅ Set driver info from object:', driverData.firstName, driverData.lastName);
        return;
      }

      // If it's just an ID string, fetch from API
      console.log('🔄 Fetching driver info for ID:', driverIdOrObject);
      const res = await fetch(`http://192.168.100.37:5000/api/auth/user/${driverIdOrObject}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();
      if (data.success && data.user) {
        const driverData = {
          _id: data.user._id || data.user.id,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          phoneNumber: data.user.phoneNumber,
          todaName: data.user.todaName || '',
          licensePlate: data.user.licensePlate || '',
        };
        setAssignedDriver(driverData);
        console.log('✅ Loaded driver info from API:', data.user.firstName, data.user.lastName);
      }
    } catch (error) {
      console.error('❌ Error fetching driver info:', error);
    }
  };

  const loadRideHistory = async () => {
    try {
      const historyData = await AsyncStorage.getItem(STORAGE_KEYS.RIDE_HISTORY);
      if (historyData) {
        const history: RideHistory[] = JSON.parse(historyData);
        history.sort((a, b) => b.timestamp - a.timestamp);
        setRideHistory(history);
        console.log('✅ Loaded ride history:', history.length, 'rides');
      }
    } catch (error) {
      console.error('❌ Error loading ride history:', error);
    }
  };

  const saveToHistory = async (pickup: LocationData, dropoff: LocationData, dist: number, cost: number) => {
    try {
      const newEntry: RideHistory = {
        id: Date.now().toString(),
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        distance: dist,
        fare: cost,
        date: new Date().toISOString(),
        timestamp: Date.now(),
      };

      const updatedHistory = [newEntry, ...rideHistory];
      const trimmedHistory = updatedHistory.slice(0, 50);

      await AsyncStorage.setItem(STORAGE_KEYS.RIDE_HISTORY, JSON.stringify(trimmedHistory));
      setRideHistory(trimmedHistory);
      console.log('✅ Saved ride to history');
    } catch (error) {
      console.error('❌ Error saving to history:', error);
    }
  };

  const groupHistoryByDate = () => {
    const grouped: { [key: string]: RideHistory[] } = {};

    rideHistory.forEach(ride => {
      const date = new Date(ride.date);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dateKey = '';

      if (date.toDateString() === today.toDateString()) {
        dateKey = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateKey = 'Yesterday';
      } else {
        dateKey = date.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        });
      }

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(ride);
    });

    return grouped;
  };

  const selectFromHistory = (historyItem: RideHistory) => {
    if (isWaitingForDriver || currentRide) {
      Alert.alert("Ongoing Ride", "Please complete or cancel your current ride before booking a new one.");
      return;
    }

    setDropoffMarker(historyItem.dropoffLocation);
    setDropoffLocation(historyItem.dropoffLocation.name);
    setShowHistoryModal(false);
    Keyboard.dismiss();

    if (currentLocation) {
      getDirections(currentLocation, historyItem.dropoffLocation);
      fitMapToMarkers(currentLocation, historyItem.dropoffLocation);
    }

    if (!showBookingForm) {
      setShowBookingForm(true);
    }
  };

  // Persist ride state whenever it changes
  useEffect(() => {
    if (isRestoringState) return;

    const persistState = async () => {
      try {
        if (currentRide && isWaitingForDriver) {
          console.log('💾 Persisting ride state...');

          const bookingData: BookingData = {
            pickupLocation,
            dropoffLocation,
            currentLocation,
            dropoffMarker,
            distance,
            fare,
            routeCoordinates,
            selectedTodaName,
          };

          await Promise.all([
            AsyncStorage.setItem(STORAGE_KEYS.CURRENT_RIDE, JSON.stringify(currentRide)),
            AsyncStorage.setItem(STORAGE_KEYS.IS_WAITING, 'true'),
            AsyncStorage.setItem(STORAGE_KEYS.BOOKING_DATA, JSON.stringify(bookingData)),
          ]);
          console.log('✅ Ride state persisted');
        } else {
          console.log('🗑️ Clearing persisted ride state...');
          await Promise.all([
            AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_RIDE),
            AsyncStorage.removeItem(STORAGE_KEYS.IS_WAITING),
            AsyncStorage.removeItem(STORAGE_KEYS.BOOKING_DATA),
          ]);
          console.log('✅ Ride state cleared');
        }
      } catch (error) {
        console.error('❌ Error persisting state:', error);
      }
    };

    persistState();
  }, [currentRide, isWaitingForDriver, pickupLocation, dropoffLocation, distance, fare, selectedTodaName, isRestoringState]);

  useEffect(() => {
    fetch('http://192.168.100.37:5000/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })
      .then(res => res.json())
      .then(data => {
        console.log('User data received:', data);
        if (data.success && data.user) {
          setUser({
            id: data.user.id,
            firstname: data.user.firstName,
            lastname: data.user.lastName,
          });
        } else {
          console.error('Invalid response format:', data);
        }
      })
      .catch(error => console.error('Error fetching user:', error));
  }, []);

  useEffect(() => {
    if (!isRestoringState) {
      getCurrentLocation();
    }
  }, [isRestoringState]);

  // Poll for ride status updates
  useEffect(() => {
    if (!currentRide || !isWaitingForDriver) return;

    const checkRideStatus = async () => {
      try {
        const res = await fetch(`http://192.168.100.37:5000/api/rides/${currentRide._id}`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await res.json();

        if (data.success && data.ride) {
          const rideStatus = data.ride.status;
          const previousStatus = currentRide.status;

          // Check for driver ID in multiple possible locations
          const driverId = data.ride.driver || data.ride.driverId || data.ride.acceptedBy;

          console.log('📊 Ride status check:', {
            rideId: data.ride._id,
            status: rideStatus,
            previousStatus,
            hasDriver: !!driverId,
            driverId: driverId,
            currentAssignedDriver: !!assignedDriver,
            fullRideObject: data.ride
          });

          // Update current ride with latest data
          setCurrentRide(data.ride);

          if (rideStatus === 'accepted') {
            // Check if this is a new acceptance (status changed from pending to accepted)
            const isNewAcceptance = previousStatus !== 'accepted' && !assignedDriver;

            // Always fetch driver info if we don't have it yet and we have a driver ID
            if (!assignedDriver && driverId) {
              console.log('🚗 Fetching driver info for:', driverId);
              await fetchDriverInfo(driverId);

              // Show alert only once when status changes to accepted
              if (isNewAcceptance) {
                Alert.alert(
                  '🎉 Ride Accepted!',
                  'A driver has accepted your ride. They will arrive shortly!',
                  [{ text: 'OK' }]
                );
              }
            } else if (!driverId) {
              console.warn('⚠️ Ride is accepted but no driver ID found in response');
            }
          } else if (rideStatus === 'completed') {
            setIsWaitingForDriver(false);
            setCurrentRide(null);
            setAssignedDriver(null);
            Alert.alert(
              '✅ Ride Completed!',
              'Your ride has been completed. Thank you for using our service!',
              [{ text: 'OK' }]
            );
          } else if (rideStatus === 'cancelled') {
            setIsWaitingForDriver(false);
            setCurrentRide(null);
            setAssignedDriver(null);
            Alert.alert(
              '❌ Ride Cancelled',
              data.ride.cancelledReason || 'Your ride has been cancelled.',
              [{ text: 'OK' }]
            );
          }
        }
      } catch (error) {
        console.error('Error checking ride status:', error);
      }
    };

    const interval = setInterval(checkRideStatus, 3000);

    // Run immediately on mount to check current status
    checkRideStatus();

    return () => clearInterval(interval);
  }, [currentRide, isWaitingForDriver]);

  const getCurrentLocation = async () => {
    if (currentLocation) {
      console.log('ℹ️ Using restored location');
      return;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission is required to use this app");
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;

      const address = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      const addressText = address[0]
        ? `${address[0].street || ""}, ${address[0].city || ""}, ${address[0].region || ""}`.trim()
        : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      const currentLoc: LocationData = {
        name: addressText,
        latitude,
        longitude,
      };

      setCurrentLocation(currentLoc);
      setPickupLocation(addressText);

      setMapRegion({
        latitude,
        longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    } catch (error) {
      console.error("Error getting location:", error);
      Alert.alert("Error", "Unable to get current location");
    }
  };

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return Math.round(distance * 100) / 100;
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);

    if (query.length === 0) {
      setSearchResults([]);
      setShowSearchResults(false);
      setDropoffLocation("");
      setDropoffMarker(null);
      setDistance(0);
      setFare(0);
      setRouteCoordinates([]);
      return;
    }

    if (query.trim().length > 0) {
      const filtered = popularLocations.filter((location) =>
        location.name.toLowerCase().includes(query.toLowerCase())
      );

      setSearchResults(filtered);
      setShowSearchResults(filtered.length > 0);
    }
  };

  const searchLocationByAddress = async (address: string) => {
    if (isWaitingForDriver || currentRide) {
      Alert.alert("Ongoing Ride", "Please complete or cancel your current ride before booking a new one.");
      return;
    }

    if (!address || address.trim().length === 0) return;

    try {
      const geocoded = await Location.geocodeAsync(address);

      if (geocoded && geocoded.length > 0) {
        const { latitude, longitude } = geocoded[0];

        const dropoffLoc: LocationData = {
          name: address,
          latitude,
          longitude,
        };

        setDropoffMarker(dropoffLoc);
        setDropoffLocation(address);
        setSearchQuery("");
        setShowSearchResults(false);
        Keyboard.dismiss();

        if (currentLocation) {
          getDirections(currentLocation, dropoffLoc);
          fitMapToMarkers(currentLocation, dropoffLoc);
        }

        if (!showBookingForm) {
          setShowBookingForm(true);
        }
      } else {
        Alert.alert("Location Not Found", "Please try a different search or tap on the map");
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      Alert.alert("Error", "Unable to find location. Please try again or tap on the map.");
    }
  };

  const handleSelectSearchResult = (location: LocationData) => {
    if (isWaitingForDriver || currentRide) {
      Alert.alert("Ongoing Ride", "Please complete or cancel your current ride before booking a new one.");
      return;
    }

    setDropoffMarker(location);
    setDropoffLocation(location.name);
    setSearchQuery("");
    setShowSearchResults(false);
    Keyboard.dismiss();

    if (currentLocation) {
      getDirections(currentLocation, location);
      fitMapToMarkers(currentLocation, location);
    }

    if (!showBookingForm) {
      setShowBookingForm(true);
    }
  };

  const handleMapPress = async (event: any) => {
    if (isWaitingForDriver || currentRide) {
      Alert.alert("Ongoing Ride", "Please complete or cancel your current ride before booking a new one.");
      return;
    }

    const { latitude, longitude } = event.nativeEvent.coordinate;

    try {
      const address = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      const addressText = address[0]
        ? `${address[0].street || ""}, ${address[0].city || ""}, ${address[0].region || ""}`.trim()
        : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      const dropoffLoc: LocationData = {
        name: addressText,
        latitude,
        longitude,
      };

      setDropoffMarker(dropoffLoc);
      setDropoffLocation(addressText);

      if (currentLocation) {
        getDirections(currentLocation, dropoffLoc);
        fitMapToMarkers(currentLocation, dropoffLoc);
      }

      if (!showBookingForm) {
        setShowBookingForm(true);
      }
    } catch (error) {
      console.error("Error reverse geocoding:", error);
      const dropoffLoc: LocationData = {
        name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        latitude,
        longitude,
      };
      setDropoffMarker(dropoffLoc);
      setDropoffLocation(dropoffLoc.name);
    }
  };

  const fitMapToMarkers = (pickup: LocationData, dropoff: LocationData) => {
    const minLat = Math.min(pickup.latitude, dropoff.latitude);
    const maxLat = Math.max(pickup.latitude, dropoff.latitude);
    const minLng = Math.min(pickup.longitude, dropoff.longitude);
    const maxLng = Math.max(pickup.longitude, dropoff.longitude);

    const latDelta = (maxLat - minLat) * 1.5;
    const lngDelta = (maxLng - minLng) * 1.5;

    setMapRegion({
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(latDelta, 0.02),
      longitudeDelta: Math.max(lngDelta, 0.02),
    });
  };

  const getDirections = async (origin: LocationData, destination: LocationData) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;

      console.log('Fetching route from:', url);

      const response = await fetch(url);
      const data = await response.json();

      console.log('OSRM Response:', data);

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates;

        const points: { latitude: number; longitude: number }[] = coordinates.map((coord: number[]) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));

        console.log('Route points:', points.length);
        setRouteCoordinates(points);

        const distanceInKm = route.distance / 1000;
        setDistance(Math.round(distanceInKm * 100) / 100);
        setFare(Math.ceil(distanceInKm * FARE_PER_KM));
        console.log('Distance:', distanceInKm, 'km');
      } else {
        console.warn('OSRM returned no routes, using fallback');
        const dist = calculateDistance(
          origin.latitude,
          origin.longitude,
          destination.latitude,
          destination.longitude
        );
        setDistance(dist);
        setFare(Math.ceil(dist * FARE_PER_KM));
        setRouteCoordinates([
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: destination.latitude, longitude: destination.longitude }
        ]);
      }
    } catch (error) {
      console.error('Error fetching route:', error);
      const dist = calculateDistance(
        origin.latitude,
        origin.longitude,
        destination.latitude,
        destination.longitude
      );
      setDistance(dist);
      setFare(Math.ceil(dist * FARE_PER_KM));
      setRouteCoordinates([
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude }
      ]);
    }
  };

  const showModal = (type: "success" | "error", message: string) => {
    setModalType(type);
    setModalMessage(message);
    setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    if (modalType === "success" && !isWaitingForDriver) {
      setDropoffLocation("");
      setDropoffMarker(null);
      setDistance(0);
      setFare(0);
      setSearchQuery("");
      setShowSearchResults(false);
      setRouteCoordinates([]);
      setShowBookingForm(false);
      setSelectedTodaName("");
    }
  };

  const handleBookRide = async () => {
    if (!pickupLocation || !dropoffLocation) {
      showModal("error", "Please select a dropoff location by tapping on the map");
      return;
    }

    if (!selectedTodaName) {
      showModal("error", "Please select a TODA");
      return;
    }

    if (!currentLocation || !dropoffMarker) {
      showModal("error", "Location data is missing. Please try again.");
      return;
    }

    if (distance === 0) {
      showModal("error", "Unable to calculate distance. Please try again.");
      return;
    }

    if (!user) {
      showModal("error", "User data not loaded. Please try again.");
      return;
    }

    try {
      const res = await fetch("http://192.168.100.37:5000/api/rides/book", {
        method: "POST",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          firstname: user.firstname,
          lastname: user.lastname,
          pickupLocation: {
            name: pickupLocation,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          },
          dropoffLocation: {
            name: dropoffLocation,
            latitude: dropoffMarker.latitude,
            longitude: dropoffMarker.longitude,
          },
          distance,
          fare,
          todaName: selectedTodaName,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        await saveToHistory(currentLocation, dropoffMarker, distance, fare);

        setCurrentRide(data.ride);
        setIsWaitingForDriver(true);
        showModal("success", `Ride booked successfully! Waiting for driver acceptance...`);
      } else {
        showModal("error", data.message || "Booking failed. Please try again.");
      }
    } catch (error) {
      showModal("error", "Network error. Please check your connection.");
    }
  };

  const handleCancelRide = async () => {
    try {
      const res = await fetch(`http://192.168.100.37:5000/api/rides/${currentRide._id}/cancel`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cancelledBy: 'user',
          cancelledReason: 'Cancelled by user'
        }),
      });

      if (res.ok) {
        setIsWaitingForDriver(false);
        setCurrentRide(null);
        setAssignedDriver(null);
        setDropoffLocation("");
        setDropoffMarker(null);
        setDistance(0);
        setFare(0);
        setSearchQuery("");
        setShowSearchResults(false);
        setRouteCoordinates([]);
        setSelectedTodaName("");
        Alert.alert('Ride Cancelled', 'Your ride has been cancelled successfully.');
      }
    } catch (error) {
      console.error('Error cancelling ride:', error);
    }
  };

  const handleCallDriver = () => {
    if (assignedDriver && assignedDriver.phoneNumber) {
      const phoneNumber = assignedDriver.phoneNumber.replace(/[^0-9+]/g, '');
      Linking.openURL(`tel:${phoneNumber}`);
    }
  };

const handleMessageDriver = async () => {
  if (!assignedDriver || !user) {
    Alert.alert("Error", "Unable to start chat. Driver or user information missing.");
    return;
  }

  try {
    console.log('🔄 Creating/opening chat with driver...');
    console.log('Current User ID:', user.id);
    console.log('Driver ID:', assignedDriver._id);

    const otherUserId = assignedDriver._id;

    // Create or get existing chat with the driver
    const response = await fetch('http://192.168.100.37:5000/api/chat/create-new-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add authorization header if needed
        // 'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        members: [user.id, otherUserId] // ✅ FIXED: Send members array with both user IDs
      })
    });

    // Check if response is ok
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Server error:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Parse JSON response
    const responseData = await response.json();

    if (responseData.success) {
      console.log('✅ Chat created/retrieved:', responseData.data._id);

      // Navigate to chat interface
      router.push({
        pathname: '/chat',
        params: {
          chatId: responseData.data._id, // ✅ FIXED: Use correct path
          driverName: `${assignedDriver.firstName} ${assignedDriver.lastName}`,
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
  // Report Driver Functions
  const handleOpenReportModal = () => {
    setShowReportModal(true);
    setSelectedReportReason("");
    setReportComment("");
  };

  const handleCloseReportModal = () => {
    setShowReportModal(false);
    setSelectedReportReason("");
    setReportComment("");
  };

  const handleSubmitReport = async () => {
    if (!selectedReportReason) {
      Alert.alert("Missing Information", "Please select a reason for reporting.");
      return;
    }

    if (!assignedDriver || !currentRide) {
      Alert.alert("Error", "Driver information not available.");
      return;
    }

    setIsSubmittingReport(true);

    try {
      const res = await fetch('http://192.168.100.37:5000/api/reports/driver', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rideId: currentRide._id,
          driverId: assignedDriver._id,
          reason: selectedReportReason,
          comment: reportComment,
          reportedBy: user?.id,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        Alert.alert(
          "Report Submitted",
          "Thank you for your feedback. We will review this report and take appropriate action.",
          [{ text: "OK" }]
        );
        handleCloseReportModal();
      } else {
        Alert.alert("Error", data.message || "Failed to submit report. Please try again.");
      }
    } catch (error) {
      console.error('Error submitting report:', error);
      Alert.alert("Network Error", "Unable to submit report. Please check your connection.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {/* Map */}
        <MapView
          style={styles.map}
          region={mapRegion}
          onPress={handleMapPress}
          showsUserLocation={true}
          showsMyLocationButton={true}
        >
          {currentLocation && (
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }}
              title="Your Location"
              description="Pickup Point"
              pinColor="green"
            />
          )}

          {dropoffMarker && (
            <Marker
              coordinate={{
                latitude: dropoffMarker.latitude,
                longitude: dropoffMarker.longitude,
              }}
              title="Dropoff Location"
              description={dropoffMarker.name}
              pinColor="red"
            />
          )}

          {routeCoordinates.length > 0 && (
            <>
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="rgba(0, 0, 0, 0.3)"
                strokeWidth={8}
                lineCap="round"
                lineJoin="round"
              />
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#007AFF"
                strokeWidth={6}
                lineCap="round"
                lineJoin="round"
              />
            </>
          )}
        </MapView>

        {/* User Info Card */}
        <View style={styles.userCard}>
          <Text style={styles.emoji}>👋</Text>
          <Text style={styles.userName}>
            {user ? `${user.firstname} ${user.lastname}` : "Loading..."}
          </Text>
        </View>

        {/* Distance Card */}
        {distance > 0 && !isWaitingForDriver && (
          <View style={styles.distanceCard}>
            <Text style={styles.distanceLabel}>Distance to Destination</Text>
            <Text style={styles.distanceValue}>{distance} km</Text>
          </View>
        )}

        {/* Book Ride Button / Driver Card / Waiting Card */}
        {!isWaitingForDriver ? (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.historyButton}
              onPress={() => setShowHistoryModal(true)}
            >
              <Text style={styles.historyButtonText}>📜</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.bookRideButton}
              onPress={() => setShowBookingForm(true)}
            >
              <Text style={styles.bookRideButtonText}>📍 Book a Ride</Text>
            </TouchableOpacity>
          </View>
        ) : currentRide?.status === 'accepted' && assignedDriver ? (
          <View style={styles.driverCard}>
            <View style={styles.driverCardHeader}>
              <Text style={styles.driverCardIcon}>🚗</Text>
              <Text style={styles.driverCardTitle}>Driver Assigned!</Text>
            </View>

            <View style={styles.driverInfoContainer}>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>
                  {assignedDriver.firstName} {assignedDriver.lastName}
                </Text>

                <Text style={styles.driverDetails}>
                  🚕 {assignedDriver.todaName}
                </Text>

                <Text style={styles.driverDetails}>
                  🚙 {assignedDriver.licensePlate}
                </Text>
              </View>

              {/* Action Buttons - Message and Call */}
              <View style={styles.driverActionButtons}>
                <TouchableOpacity
                  style={styles.messageButton}
                  onPress={handleMessageDriver}
                >
                  <Text style={styles.actionIcon}>💬</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.callButton}
                  onPress={handleCallDriver}
                >
                  <Text style={styles.actionIcon}>📞</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.driverSubtext}>
              Your driver is on the way!
            </Text>

            {/* Action Buttons Row */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.reportButton}
                onPress={handleOpenReportModal}
              >
                <Text style={styles.reportButtonText}>⚠️ Report Driver</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelRide}
              >
                <Text style={styles.cancelButtonText}>Cancel Ride</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.waitingCard}>
            <View style={styles.waitingHeader}>
              <Text style={styles.waitingIcon}>⏳</Text>
              <Text style={styles.waitingTitle}>Waiting for Driver</Text>
            </View>

            <Text style={styles.waitingSubtext}>
              Looking for available drivers nearby...
            </Text>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelRide}
            >
              <Text style={styles.cancelButtonText}>Cancel Ride</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Booking Form Overlay */}
        {showBookingForm && !isWaitingForDriver && (
          <View style={styles.overlay}>
            <TouchableOpacity
              style={styles.backdrop}
              activeOpacity={1}
              onPress={() => {
                setShowBookingForm(false);
                Keyboard.dismiss();
              }}
            />

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.keyboardAvoid}
              keyboardVerticalOffset={0}
            >
              <View style={styles.formContainer}>
                <View style={styles.handleBar} />

                <ScrollView
                  style={styles.bookaride}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.scrollContent}
                >
                  <Text style={styles.title}>Book a Ride</Text>

                  <Text style={styles.instructionText}>
                    📍 Search for a location OR tap anywhere on the map
                  </Text>

                  {/* TODA Selection */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>🚕</Text>
                      <Text style={styles.label}>Select TODA</Text>
                    </View>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={selectedTodaName}
                        onValueChange={(itemValue) => setSelectedTodaName(itemValue)}
                        style={styles.picker}
                      >
                        <Picker.Item label="Choose a TODA..." value="" />
                        {todaNames.map((toda, index) => (
                          <Picker.Item key={index} label={toda} value={toda} />
                        ))}
                      </Picker>
                    </View>
                  </View>

                  {/* Pickup Location (Read-only) */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>🟢</Text>
                      <Text style={styles.label}>Pickup Location (Current)</Text>
                    </View>
                    <View style={styles.readOnlyInput}>
                      <Text style={styles.readOnlyText}>
                        {pickupLocation || "Getting current location..."}
                      </Text>
                    </View>
                  </View>

                  {/* Dropoff Location (Search or Tap) */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>🔴</Text>
                      <Text style={styles.label}>Dropoff Location</Text>
                    </View>

                    <TextInput
                      style={styles.input}
                      placeholder="Type address or location name..."
                      value={searchQuery || dropoffLocation}
                      onChangeText={(text) => {
                        if (text.length > 0) {
                          handleSearch(text);
                        } else {
                          setSearchQuery("");
                          setShowSearchResults(false);
                          setSearchResults([]);
                          setDropoffLocation("");
                          setDropoffMarker(null);
                          setDistance(0);
                          setFare(0);
                          setRouteCoordinates([]);
                        }
                      }}
                      onSubmitEditing={() => {
                        if (searchQuery) {
                          searchLocationByAddress(searchQuery);
                        }
                      }}
                      returnKeyType="search"
                      onFocus={() => {
                        if (searchQuery.length > 0) {
                          setShowSearchResults(true);
                        }
                      }}
                    />

                    {showSearchResults && searchResults.length > 0 && (
                      <View style={styles.searchResults}>
                        <ScrollView
                          nestedScrollEnabled
                          style={styles.searchScroll}
                          keyboardShouldPersistTaps="handled"
                        >
                          {searchResults.map((location, index) => (
                            <TouchableOpacity
                              key={index}
                              style={styles.searchItem}
                              onPress={() => handleSelectSearchResult(location)}
                            >
                              <Text style={styles.searchIcon}>📍</Text>
                              <Text style={styles.searchItemText}>{location.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Popular Destinations */}
                  {!dropoffLocation && !searchQuery && (
                    <View style={styles.popularContainer}>
                      <Text style={styles.popularTitle}>Popular Destinations:</Text>
                      <View style={styles.chipContainer}>
                        {popularLocations.slice(0, 6).map((location, index) => (
                          <TouchableOpacity
                            key={index}
                            style={styles.chip}
                            onPress={() => handleSelectSearchResult(location)}
                          >
                            <Text style={styles.chipText}>{location.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Distance and Fare */}
                  {distance > 0 && (
                    <View style={styles.fareContainer}>
                      <View style={styles.fareRow}>
                        <Text style={styles.fareLabel}>Distance</Text>
                        <Text style={styles.fareValue}>{distance} km</Text>
                      </View>

                      <View style={styles.fareRow}>
                        <Text style={styles.fareLabel}>Rate</Text>
                        <Text style={styles.fareValue}>₱{FARE_PER_KM}/km</Text>
                      </View>

                      <View style={styles.divider} />

                      <View style={styles.fareRow}>
                        <Text style={styles.totalLabel}>Total Fare</Text>
                        <Text style={styles.totalValue}>₱{fare}</Text>
                      </View>

                      <Text style={styles.calculation}>
                        {distance} km × ₱{FARE_PER_KM} = ₱{fare}
                      </Text>
                    </View>
                  )}

                  {/* Book Button */}
                  <TouchableOpacity style={styles.bookButton} onPress={handleBookRide}>
                    <Text style={styles.bookButtonText}>Book Now</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        )}

        {/* Report Driver Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={showReportModal}
          onRequestClose={handleCloseReportModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.reportModalContent}>
              <View style={styles.reportModalHeader}>
                <Text style={styles.reportModalTitle}>Report Driver</Text>
                <TouchableOpacity onPress={handleCloseReportModal}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.reportModalBody}>
                {assignedDriver && (
                  <View style={styles.reportDriverInfo}>
                    <Text style={styles.reportDriverName}>
                      {assignedDriver.firstName} {assignedDriver.lastName}
                    </Text>
                    <Text style={styles.reportDriverDetails}>
                      {assignedDriver.todaName} • {assignedDriver.licensePlate}
                    </Text>
                  </View>
                )}

                <Text style={styles.reportSectionLabel}>Reason for Report *</Text>
                <View style={styles.reportReasonsContainer}>
                  {REPORT_REASONS.map((reason, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.reportReasonChip,
                        selectedReportReason === reason && styles.reportReasonChipSelected
                      ]}
                      onPress={() => setSelectedReportReason(reason)}
                    >
                      <Text style={[
                        styles.reportReasonText,
                        selectedReportReason === reason && styles.reportReasonTextSelected
                      ]}>
                        {reason}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.reportSectionLabel}>Additional Comments (Optional)</Text>
                <TextInput
                  style={styles.reportCommentInput}
                  placeholder="Please provide more details..."
                  value={reportComment}
                  onChangeText={setReportComment}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <Text style={styles.reportDisclaimer}>
                  ℹ️ Your report will be reviewed by our team. All reports are kept confidential.
                </Text>
              </ScrollView>

              <View style={styles.reportModalFooter}>
                <TouchableOpacity
                  style={styles.reportCancelButton}
                  onPress={handleCloseReportModal}
                >
                  <Text style={styles.reportCancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.reportSubmitButton,
                    (!selectedReportReason || isSubmittingReport) && styles.reportSubmitButtonDisabled
                  ]}
                  onPress={handleSubmitReport}
                  disabled={!selectedReportReason || isSubmittingReport}
                >
                  <Text style={styles.reportSubmitButtonText}>
                    {isSubmittingReport ? "Submitting..." : "Submit Report"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Ride History Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={showHistoryModal}
          onRequestClose={() => setShowHistoryModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.historyModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Ride History</Text>
                <TouchableOpacity onPress={() => setShowHistoryModal(false)}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.historyList}>
                {rideHistory.length === 0 ? (
                  <View style={styles.emptyHistoryState}>
                    <Text style={styles.emptyHistoryEmoji}>📜</Text>
                    <Text style={styles.emptyHistoryText}>No ride history yet</Text>
                    <Text style={styles.emptyHistorySubtext}>Your past rides will appear here</Text>
                  </View>
                ) : (
                  Object.entries(groupHistoryByDate()).map(([dateKey, rides]) => (
                    <View key={dateKey} style={styles.historyDateGroup}>
                      <Text style={styles.historyDateHeader}>{dateKey}</Text>
                      {rides.map((ride) => (
                        <TouchableOpacity
                          key={ride.id}
                          style={styles.historyItem}
                          onPress={() => selectFromHistory(ride)}
                        >
                          <View style={styles.historyItemHeader}>
                            <Text style={styles.historyTime}>
                              {new Date(ride.date).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Text>
                            <Text style={styles.historyFare}>₱{ride.fare}</Text>
                          </View>
                          <View style={styles.historyLocations}>
                            <View style={styles.historyLocationRow}>
                              <Text style={styles.historyLocationIcon}>🟢</Text>
                              <Text style={styles.historyLocationText} numberOfLines={1}>
                                {ride.pickupLocation.name}
                              </Text>
                            </View>
                            <View style={styles.historyLocationRow}>
                              <Text style={styles.historyLocationIcon}>🔴</Text>
                              <Text style={styles.historyLocationText} numberOfLines={1}>
                                {ride.dropoffLocation.name}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.historyDistance}>📏 {ride.distance} km</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Success/Error Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={modalVisible}
          onRequestClose={handleModalClose}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View
                style={[
                  styles.modalIconContainer,
                  modalType === "success" ? styles.successIcon : styles.errorIcon,
                ]}
              >
                <Text style={styles.modalIcon}>
                  {modalType === "success" ? "✓" : "✕"}
                </Text>
              </View>

              <Text style={styles.modalTitle}>
                {modalType === "success" ? "Success!" : "Error"}
              </Text>

              <Text style={styles.modalMessage}>{modalMessage}</Text>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  modalType === "success" ? styles.successButton : styles.errorButton,
                ]}
                onPress={handleModalClose}
              >
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}

// Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  userCard: {
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
  userName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  distanceCard: {
    position: "absolute",
    top: 140,
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
  },
  distanceLabel: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  distanceValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#007AFF",
  },
  buttonContainer: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    flexDirection: "row",
    gap: 12,
  },
  historyButton: {
    width: 60,
    backgroundColor: "#fff",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: "#007AFF",
  },
  historyButtonText: {
    fontSize: 24,
  },
  bookRideButton: {
    flex: 1,
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
  bookRideButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  // Driver Card Styles
  driverCard: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: "#28a745",
  },
  driverCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  driverCardIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  driverCardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#28a745",
  },
  // Waiting Card Styles
  waitingCard: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: "#FFA500",
  },
  waitingHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  waitingIcon: {
    fontSize: 24,
    marginRight: 8,
  },
  waitingTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  driverInfoContainer: {
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
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  driverDetails: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  driverActionButtons: {
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
  actionIcon: {
    fontSize: 28,
  },
  driverSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  waitingSubtext: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  // Action Buttons Row (Report + Cancel)
  actionButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  reportButton: {
    flex: 1,
    backgroundColor: "#FFA500",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  reportButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F44336",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  // Report Modal Styles
  reportModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    width: "100%",
  },
  reportModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  reportModalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  reportModalBody: {
    padding: 20,
    maxHeight: "70%",
  },
  reportDriverInfo: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  reportDriverName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  reportDriverDetails: {
    fontSize: 14,
    color: "#666",
  },
  reportSectionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
    marginTop: 8,
  },
  reportReasonsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  reportReasonChip: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  reportReasonChipSelected: {
    backgroundColor: "#FFA500",
    borderColor: "#FFA500",
  },
  reportReasonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  reportReasonTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  reportCommentInput: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    backgroundColor: "#fff",
    marginBottom: 16,
  },
  reportDisclaimer: {
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
    textAlign: "center",
    paddingHorizontal: 10,
  },
  reportModalFooter: {
    flexDirection: "row",
    gap: 10,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
  },
  reportCancelButton: {
    flex: 1,
    backgroundColor: "#f0f0f0",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  reportCancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  reportSubmitButton: {
    flex: 1,
    backgroundColor: "#FFA500",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  reportSubmitButtonDisabled: {
    backgroundColor: "#ccc",
  },
  reportSubmitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
    zIndex: 1000,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  keyboardAvoid: {
    width: "100%",
  },
  formContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 30,
    paddingTop: 10,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 20,
  },
  scrollContent: {
    flexGrow: 1,
  },
  handleBar: {
    width: 40,
    height: 5,
    backgroundColor: "#ddd",
    borderRadius: 3,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 14,
    color: "#007AFF",
    backgroundColor: "#e7f3ff",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    textAlign: "center",
  },
  inputContainer: {
    marginBottom: 20,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  picker: {
    height: 50,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  readOnlyInput: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f9f9f9",
    justifyContent: "center",
  },
  readOnlyText: {
    fontSize: 16,
    color: "#333",
  },
  searchResults: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    maxHeight: 150,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchScroll: {
    maxHeight: 150,
  },
  searchItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  searchItemText: {
    fontSize: 16,
    color: "#333",
    flex: 1,
  },
  popularContainer: {
    marginBottom: 20,
  },
  popularTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 12,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#e7f3ff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  chipText: {
    color: "#007AFF",
    fontSize: 13,
    fontWeight: "500",
  },
  fareContainer: {
    backgroundColor: "#f0f8ff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  fareLabel: {
    fontSize: 14,
    color: "#666",
  },
  fareValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  divider: {
    height: 1,
    backgroundColor: "#007AFF",
    marginVertical: 8,
    opacity: 0.3,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#007AFF",
  },
  calculation: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 4,
  },
  bookButton: {
    height: 56,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    marginTop: 10,
  },
  bookButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  historyModalContent: {
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
  historyList: {
    padding: 20,
  },
  emptyHistoryState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyHistoryEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyHistoryText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#666",
    marginBottom: 8,
  },
  emptyHistorySubtext: {
    fontSize: 14,
    color: "#999",
  },
  historyDateGroup: {
    marginBottom: 24,
  },
  historyDateHeader: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
    paddingLeft: 4,
  },
  historyItem: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  historyItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  historyTime: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  historyFare: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#28a745",
  },
  historyLocations: {
    marginBottom: 8,
  },
  historyLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  historyLocationIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  historyLocationText: {
    flex: 1,
    fontSize: 14,
    color: "#333",
  },
  historyDistance: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "80%",
    alignItems: "center",
    marginBottom: "50%",
  },
  modalIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  successIcon: {
    backgroundColor: "#4CAF50",
  },
  errorIcon: {
    backgroundColor: "#F44336",
  },
  modalIcon: {
    fontSize: 32,
    color: "#fff",
    fontWeight: "bold",
  },
  modalMessage: {
    fontSize: 16,
    textAlign: "center",
    color: "#666",
    marginBottom: 24,
  },
  modalButton: {
    width: "100%",
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  successButton: {
    backgroundColor: "#4CAF50",
  },
  errorButton: {
    backgroundColor: "#F44336",
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  bookaride: {
    width: "100%",
    height: "100%",
  },
});