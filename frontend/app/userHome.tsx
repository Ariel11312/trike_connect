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
  passengerType: 'regular' | 'senior_pwd';
}

interface RideHistory {
  id: string;
  pickupLocation: LocationData;
  dropoffLocation: LocationData;
  distance: number;
  fare: number;
  date: string;
  timestamp: number;
  passengerType: 'regular' | 'senior_pwd';
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

// FARE MATRIX - Based on the uploaded image
interface FareMatrixEntry {
  destination: string;
  toda: string;
  regularFare: number;
  seniorPwdFare: number;
  bayangFare2Pax: number;
  bayangFareSM: number;
  latitude: number;
  longitude: number;
}

const FARE_MATRIX: FareMatrixEntry[] = [
  { destination: "Bayan", toda: "All TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.8847, longitude: 120.8572 },
  { destination: "SM", toda: "All TODA", regularFare: 15.00, seniorPwdFare: 10.00, bayangFare2Pax: 30.00, bayangFareSM: 0, latitude: 14.8889, longitude: 120.8543 },
  { destination: "Bagong Nayon", toda: "BNBB TODA", regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8920, longitude: 120.8590 },
  { destination: "Barangka", toda: "BPP TODA", regularFare: 20.00, seniorPwdFare: 16.00, bayangFare2Pax: 60.00, bayangFareSM: 60.00, latitude: 14.8950, longitude: 120.8620 },
  { destination: "Sapang", toda: "BPP TODA", regularFare: 25.00, seniorPwdFare: 20.00, bayangFare2Pax: 75.00, bayangFareSM: 75.00, latitude: 14.9000, longitude: 120.8650 },
  { destination: "Calantipay", toda: "CALANTIPAY TODA", regularFare: 25.00, seniorPwdFare: 20.00, bayangFare2Pax: 75.00, bayangFareSM: 75.00, latitude: 14.8780, longitude: 120.8500 },
  { destination: "Catulnan", toda: "PC TODA", regularFare: 25.00, seniorPwdFare: 20.00, bayangFare2Pax: 50.00, bayangFareSM: 45.00, latitude: 14.8700, longitude: 120.8450 },
  { destination: "Concepcion", toda: "PC TODA", regularFare: 22.50, seniorPwdFare: 18.50, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.8650, longitude: 120.8400 },
  { destination: "Concepcion Bungahan", toda: "CONCEPCION TODA", regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8600, longitude: 120.8350 },
  { destination: "Concepcion Dulo", toda: "CONCEPCION TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.8550, longitude: 120.8300 },
  { destination: "Hinukay", toda: "HINUKAY TODA", regularFare: 25.00, seniorPwdFare: 20.00, bayangFare2Pax: 75.00, bayangFareSM: 55.00, latitude: 14.9100, longitude: 120.8700 },
  { destination: "Matagtubig", toda: "MT TODA", regularFare: 27.50, seniorPwdFare: 22.00, bayangFare2Pax: 55.00, bayangFareSM: 55.00, latitude: 14.9150, longitude: 120.8750 },
  { destination: "Pagala", toda: "PAGALA TODA", regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8800, longitude: 120.8520 },
  { destination: "Piel", toda: "PIEL TODA", regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.9050, longitude: 120.8680 },
  { destination: "Poblacion", toda: "API, BA, LB TODA", regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8870, longitude: 120.8560 },
  { destination: "Sabang", toda: "BB, MA NO. SM, STA ELENA TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 35.00, latitude: 14.8750, longitude: 120.8480 },
  { destination: "Sabang Dulo", toda: "BB, MA NO. SM, STA ELENA TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 35.00, latitude: 14.8720, longitude: 120.8460 },
  { destination: "San Roque", toda: "SR TODA", regularFare: 20.00, seniorPwdFare: 16.00, bayangFare2Pax: 40.00, bayangFareSM: 40.00, latitude: 14.8680, longitude: 120.8420 },
  { destination: "Sta. Babrara", toda: "ASBATODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.9200, longitude: 120.8800 },
  { destination: "San Jose", toda: "SM TODA", regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8820, longitude: 120.8540 },
  { destination: "Tarcan", toda: "SM TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 45.00, latitude: 14.8900, longitude: 120.8580 },
  { destination: "Tarcan Mulawin Bata", toda: "SM TODA", regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.8950, longitude: 120.8600 },
  { destination: "Tarcan Mulawin Matanda", toda: "SM TODA", regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.8980, longitude: 120.8620 },
  { destination: "Makinabang", toda: "SM TODA", regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.9020, longitude: 120.8640 },
  { destination: "Sto. Cristo", toda: "APO TODA", regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 25.00, latitude: 14.8850, longitude: 120.8550 },
  { destination: "Sto. Niño", toda: "SM TODA", regularFare: 17.50, seniorPwdFare: 14.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.8920, longitude: 120.8570 },
  { destination: "Subic", toda: "SS, STS TODA", regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8780, longitude: 120.8510 },
  { destination: "Sulivan", toda: "STA TODA", regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.9080, longitude: 120.8720 },
  { destination: "Tangos Bungao Citiva", toda: "TPA TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.8680, longitude: 120.8440 },
  { destination: "Tangos Dulo", toda: "TPA TODA", regularFare: 20.00, seniorPwdFare: 16.00, bayangFare2Pax: 40.00, bayangFareSM: 30.00, latitude: 14.8650, longitude: 120.8420 },
  { destination: "Tigaon", toda: "BTI TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 40.00, latitude: 14.9250, longitude: 120.8850 },
  { destination: "Tibag", toda: "TC TODA", regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8830, longitude: 120.8530 },
  { destination: "Tilapayong", toda: "TILAPAYONG TODA", regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 40.00, latitude: 14.9300, longitude: 120.8900 },
  { destination: "VDF", toda: "VDF TODA", regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8860, longitude: 120.8545 },
  { destination: "VDF Northville", toda: "VDF TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.8880, longitude: 120.8555 },
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
  const [passengerType, setPassengerType] = useState<'regular' | 'senior_pwd'>('regular');

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
  const [searchResults, setSearchResults] = useState<FareMatrixEntry[]>([]);

  // Route line coordinates
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);

  // Get unique TODA names from fare matrix
  useEffect(() => {
    const uniqueTodas = Array.from(new Set(FARE_MATRIX.map(entry => entry.toda)));
    setTodaNames(uniqueTodas);
  }, []);

  // Function to check if address is in Baliuag/Baliwag
  const isInBaliuag = (addressName: string): boolean => {
    const address = addressName.toLowerCase();
    return address.includes('baliuag') || address.includes('baliwag') || address.includes('bulacan');
  };

  // Function to find matching destination in fare matrix from address
  const findDestinationFromAddress = (addressName: string): FareMatrixEntry | null => {
    const address = addressName.toLowerCase();
    
    // Try to find exact match
    for (const entry of FARE_MATRIX) {
      if (address.includes(entry.destination.toLowerCase())) {
        return entry;
      }
    }
    
    return null;
  };

  // Function to calculate fare based on destination and passenger type
  const calculateFareFromMatrix = (
    pickupAddress: string,
    dropoffAddress: string,
    pickupLocation: LocationData | null,
    dropoffLocation: LocationData | null,
    toda: string,
    passType: 'regular' | 'senior_pwd'
  ): { fare: number; calculationType: 'matrix' | 'distance' | 'cross-location' } => {
    // Check if pickup location is in Baliuag
    if (!isInBaliuag(pickupAddress)) {
      return { fare: 0, calculationType: 'matrix' };
    }

    // Find if pickup address matches a matrix destination
    const pickupDestination = findDestinationFromAddress(pickupAddress);
    const dropoffDestination = findDestinationFromAddress(dropoffAddress);

    // Case 1: Both pickup and dropoff are in the fare matrix
    // Example: Pickup is "Piel" and dropoff is "SM"
    if (pickupDestination && dropoffDestination && pickupLocation && dropoffLocation) {
      // Calculate distance between the two matrix locations
      const distanceKm = calculateDistance(
        pickupDestination.latitude,
        pickupDestination.longitude,
        dropoffDestination.latitude,
        dropoffDestination.longitude
      );

      // Get the base fare for the dropoff destination
      const dropoffEntry = FARE_MATRIX.find(e => 
        e.destination.toLowerCase() === dropoffDestination.destination.toLowerCase() &&
        (e.toda === toda || e.toda === "All TODA")
      );

      if (dropoffEntry) {
        const baseFare = passType === 'senior_pwd' ? dropoffEntry.seniorPwdFare : dropoffEntry.regularFare;
        
        // If distance is significant (> 2km), calculate proportional fare
        if (distanceKm > 2) {
          // Use ₱15/km as base rate for cross-location trips
          const calculatedFare = Math.ceil(distanceKm * 15);
          // Apply senior/PWD discount (20% off)
          const finalFare = passType === 'senior_pwd' ? Math.ceil(calculatedFare * 0.8) : calculatedFare;
          return { fare: finalFare, calculationType: 'cross-location' };
        } else {
          // Use matrix fare for short distances
          return { fare: baseFare, calculationType: 'matrix' };
        }
      }
    }

    // Case 2: Only dropoff is in the matrix (pickup is somewhere else in Baliuag)
    if (dropoffDestination) {
      const entry = FARE_MATRIX.find(e => 
        e.destination.toLowerCase() === dropoffDestination.destination.toLowerCase() &&
        (e.toda === toda || e.toda === "All TODA")
      );

      if (entry) {
        return { 
          fare: passType === 'senior_pwd' ? entry.seniorPwdFare : entry.regularFare,
          calculationType: 'matrix'
        };
      }
    }

    // Case 3: Neither location is in matrix, use distance-based calculation
    if (pickupLocation && dropoffLocation) {
      const distanceKm = calculateDistance(
        pickupLocation.latitude,
        pickupLocation.longitude,
        dropoffLocation.latitude,
        dropoffLocation.longitude
      );

      // Use ₱15/km as base rate
      const calculatedFare = Math.ceil(distanceKm * 15);
      // Apply senior/PWD discount (20% off)
      const finalFare = passType === 'senior_pwd' ? Math.ceil(calculatedFare * 0.8) : calculatedFare;
      return { fare: finalFare, calculationType: 'distance' };
    }

    // Fallback
    return { fare: 0, calculationType: 'matrix' };
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

        setCurrentRide(ride);
        setIsWaitingForDriver(true);

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
          setPassengerType(bookingData.passengerType || 'regular');

          if (bookingData.currentLocation && bookingData.dropoffMarker) {
            fitMapToMarkers(bookingData.currentLocation, bookingData.dropoffMarker);
          }
        }

        const driverId = ride.driver || ride.driverId || ride.acceptedBy;

        if (driverId) {
          console.log('🚗 Ride has driver, fetching info for:', driverId);
          fetchDriverInfo(driverId);
        }
      }
    } catch (error) {
      console.error('❌ Error restoring state:', error);
    } finally {
      setIsRestoringState(false);
    }
  };

  const fetchDriverInfo = async (driverIdOrObject: any) => {
    try {
      if (typeof driverIdOrObject === 'object' && driverIdOrObject !== null) {
        const driverData = {
          _id: driverIdOrObject._id || driverIdOrObject.id,
          firstName: driverIdOrObject.firstName,
          lastName: driverIdOrObject.lastName,
          phoneNumber: driverIdOrObject.phoneNumber,
          todaName: driverIdOrObject.todaName || '',
          licensePlate: driverIdOrObject.licensePlate || '',
        };
        setAssignedDriver(driverData);
        return;
      }

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
      }
    } catch (error) {
      console.error('❌ Error loading ride history:', error);
    }
  };

  const saveToHistory = async (pickup: LocationData, dropoff: LocationData, dist: number, cost: number, passType: 'regular' | 'senior_pwd') => {
    try {
      const newEntry: RideHistory = {
        id: Date.now().toString(),
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        distance: dist,
        fare: cost,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        passengerType: passType,
      };

      const updatedHistory = [newEntry, ...rideHistory];
      const trimmedHistory = updatedHistory.slice(0, 50);

      await AsyncStorage.setItem(STORAGE_KEYS.RIDE_HISTORY, JSON.stringify(trimmedHistory));
      setRideHistory(trimmedHistory);
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
    setPassengerType(historyItem.passengerType);
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

  // Persist ride state
  useEffect(() => {
    if (isRestoringState) return;

    const persistState = async () => {
      try {
        if (currentRide && isWaitingForDriver) {
          const bookingData: BookingData = {
            pickupLocation,
            dropoffLocation,
            currentLocation,
            dropoffMarker,
            distance,
            fare,
            routeCoordinates,
            selectedTodaName,
            passengerType,
          };

          await Promise.all([
            AsyncStorage.setItem(STORAGE_KEYS.CURRENT_RIDE, JSON.stringify(currentRide)),
            AsyncStorage.setItem(STORAGE_KEYS.IS_WAITING, 'true'),
            AsyncStorage.setItem(STORAGE_KEYS.BOOKING_DATA, JSON.stringify(bookingData)),
          ]);
        } else {
          await Promise.all([
            AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_RIDE),
            AsyncStorage.removeItem(STORAGE_KEYS.IS_WAITING),
            AsyncStorage.removeItem(STORAGE_KEYS.BOOKING_DATA),
          ]);
        }
      } catch (error) {
        console.error('❌ Error persisting state:', error);
      }
    };

    persistState();
  }, [currentRide, isWaitingForDriver, pickupLocation, dropoffLocation, distance, fare, selectedTodaName, passengerType, isRestoringState]);

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
        if (data.success && data.user) {
          setUser({
            id: data.user.id,
            firstname: data.user.firstName,
            lastname: data.user.lastName,
          });
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
          const driverId = data.ride.driver || data.ride.driverId || data.ride.acceptedBy;

          setCurrentRide(data.ride);

          if (rideStatus === 'accepted') {
            const isNewAcceptance = previousStatus !== 'accepted' && !assignedDriver;

            if (!assignedDriver && driverId) {
              await fetchDriverInfo(driverId);

              if (isNewAcceptance) {
                Alert.alert(
                  '🎉 Ride Accepted!',
                  'A driver has accepted your ride. They will arrive shortly!',
                  [{ text: 'OK' }]
                );
              }
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
    checkRideStatus();

    return () => clearInterval(interval);
  }, [currentRide, isWaitingForDriver]);

  const getCurrentLocation = async () => {
    if (currentLocation) {
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

      // Check if location is in Baliuag/Baliwag coverage area
      if (!isInBaliuag(addressText)) {
        Alert.alert(
          "⚠️ Outside Coverage Area",
          `Your current location (${addressText}) is outside Baliuag/Baliwag. This service only operates within Baliuag/Baliwag, Bulacan.`,
          [
            {
              text: "OK",
              style: "cancel"
            }
          ]
        );
      }

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
      const filtered = FARE_MATRIX.filter((entry) =>
        entry.destination.toLowerCase().includes(query.toLowerCase())
      );

      setSearchResults(filtered);
      setShowSearchResults(filtered.length > 0);
    }
  };

  const handleSelectSearchResult = (location: FareMatrixEntry) => {
    if (isWaitingForDriver || currentRide) {
      Alert.alert("Ongoing Ride", "Please complete or cancel your current ride before booking a new one.");
      return;
    }

    const dropoffLoc: LocationData = {
      name: location.destination,
      latitude: location.latitude,
      longitude: location.longitude,
    };

    setDropoffMarker(dropoffLoc);
    setDropoffLocation(location.destination);
    setSearchQuery("");
    setShowSearchResults(false);
    Keyboard.dismiss();

    if (currentLocation) {
      // Calculate fare based on both pickup and dropoff locations
      if (selectedTodaName) {
        const { fare: calculatedFare, calculationType } = calculateFareFromMatrix(
          pickupLocation,
          location.destination,
          currentLocation,
          dropoffLoc,
          selectedTodaName,
          passengerType
        );
        
        if (calculatedFare > 0) {
          setFare(calculatedFare);
          
          // Show info about calculation type
          if (calculationType === 'cross-location') {
            console.log(`💰 Fare calculated based on distance between ${pickupLocation} and ${location.destination}`);
          } else if (calculationType === 'distance') {
            console.log('💰 Fare calculated based on distance (locations not in matrix)');
          } else {
            console.log('💰 Fare from matrix');
          }
        }
      }

      getDirections(currentLocation, dropoffLoc);
      fitMapToMarkers(currentLocation, dropoffLoc);
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

      // Validate that location is in Baliuag
      if (!isInBaliuag(addressText)) {
        Alert.alert(
          "⚠️ Outside Coverage Area",
          `The selected location (${addressText}) is outside Baliuag/Baliwag. Please select a location within Baliuag/Baliwag, Bulacan.`,
          [{ text: "OK" }]
        );
        return;
      }

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
        
        // Calculate fare based on locations
        if (selectedTodaName) {
          const { fare: calculatedFare } = calculateFareFromMatrix(
            pickupLocation,
            addressText,
            currentLocation,
            dropoffLoc,
            selectedTodaName,
            passengerType
          );
          if (calculatedFare > 0) {
            setFare(calculatedFare);
          }
        }
      }

      if (!showBookingForm) {
        setShowBookingForm(true);
      }
    } catch (error) {
      console.error("Error reverse geocoding:", error);
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

      const response = await fetch(url);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates = route.geometry.coordinates;

        const points: { latitude: number; longitude: number }[] = coordinates.map((coord: number[]) => ({
          latitude: coord[1],
          longitude: coord[0],
        }));

        setRouteCoordinates(points);

        const distanceInKm = route.distance / 1000;
        setDistance(Math.round(distanceInKm * 100) / 100);
      } else {
        const dist = calculateDistance(
          origin.latitude,
          origin.longitude,
          destination.latitude,
          destination.longitude
        );
        setDistance(dist);
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
      setRouteCoordinates([
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: destination.latitude, longitude: destination.longitude }
      ]);
    }
  };

  // Update fare when TODA or passenger type changes
  useEffect(() => {
    if (dropoffLocation && selectedTodaName && currentLocation && dropoffMarker) {
      const { fare: calculatedFare } = calculateFareFromMatrix(
        pickupLocation,
        dropoffLocation,
        currentLocation,
        dropoffMarker,
        selectedTodaName,
        passengerType
      );
      if (calculatedFare > 0) {
        setFare(calculatedFare);
      }
    }
  }, [selectedTodaName, passengerType, dropoffLocation]);

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
      setPassengerType('regular');
    }
  };

  const handleBookRide = async () => {
    if (!pickupLocation || !dropoffLocation) {
      showModal("error", "Please select a dropoff location");
      return;
    }

    // Validate pickup location is in Baliuag
    if (!isInBaliuag(pickupLocation)) {
      showModal("error", "⚠️ Your pickup location is outside Baliuag/Baliwag coverage area. This service only operates within Baliuag/Baliwag, Bulacan.");
      return;
    }

    // Validate dropoff location is in Baliuag
    if (!isInBaliuag(dropoffLocation)) {
      showModal("error", "⚠️ Your dropoff location is outside Baliuag/Baliwag coverage area. Please select a destination within Baliuag/Baliwag, Bulacan.");
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

    if (fare === 0) {
      showModal("error", "Unable to calculate fare. Please try again.");
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
          passengerType,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        await saveToHistory(currentLocation, dropoffMarker, distance, fare, passengerType);

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
        setPassengerType('regular');
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
      const otherUserId = assignedDriver._id;

      const response = await fetch('http://192.168.100.37:5000/api/chat/create-new-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          members: [user.id, otherUserId]
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();

      if (responseData.success) {
        router.push({
          pathname: '/chat',
          params: {
            chatId: responseData.data._id,
            driverName: `${assignedDriver.firstName} ${assignedDriver.lastName}`,
            otherUserId: otherUserId,
          }
        });
      } else {
        Alert.alert("Error", responseData.message || "Failed to start chat. Please try again.");
      }
    } catch (error) {
      console.error('❌ Error creating chat:', error);
      Alert.alert("Error", "Unable to start chat. Please check your connection.");
    }
  };

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

                  {/* Passenger Type Selection */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>👤</Text>
                      <Text style={styles.label}>Passenger Type</Text>
                    </View>
                    <View style={styles.passengerTypeContainer}>
                      <TouchableOpacity
                        style={[
                          styles.passengerTypeButton,
                          passengerType === 'regular' && styles.passengerTypeButtonActive
                        ]}
                        onPress={() => setPassengerType('regular')}
                      >
                        <Text style={[
                          styles.passengerTypeText,
                          passengerType === 'regular' && styles.passengerTypeTextActive
                        ]}>
                          Regular
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.passengerTypeButton,
                          passengerType === 'senior_pwd' && styles.passengerTypeButtonActive
                        ]}
                        onPress={() => setPassengerType('senior_pwd')}
                      >
                        <Text style={[
                          styles.passengerTypeText,
                          passengerType === 'senior_pwd' && styles.passengerTypeTextActive
                        ]}>
                          Senior Citizen / PWD
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

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

                  {/* Dropoff Location (Search) */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>🔴</Text>
                      <Text style={styles.label}>Dropoff Location</Text>
                    </View>

                    <TextInput
                      style={styles.input}
                      placeholder="Search destination..."
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
                              <View style={styles.searchItemContent}>
                                <Text style={styles.searchItemText}>{location.destination}</Text>
                                <Text style={styles.searchItemSubtext}>{location.toda}</Text>
                              </View>
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
                        {FARE_MATRIX.slice(0, 12).map((location, index) => (
                          <TouchableOpacity
                            key={index}
                            style={styles.chip}
                            onPress={() => handleSelectSearchResult(location)}
                          >
                            <Text style={styles.chipText}>{location.destination}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Distance and Fare */}
                  {distance > 0 && fare > 0 && (
                    <View style={styles.fareContainer}>
                      <View style={styles.fareRow}>
                        <Text style={styles.fareLabel}>Distance</Text>
                        <Text style={styles.fareValue}>{distance} km</Text>
                      </View>

                      <View style={styles.fareRow}>
                        <Text style={styles.fareLabel}>Passenger Type</Text>
                        <Text style={styles.fareValue}>
                          {passengerType === 'senior_pwd' ? 'Senior/PWD' : 'Regular'}
                        </Text>
                      </View>

                      <View style={styles.divider} />

                      <View style={styles.fareRow}>
                        <Text style={styles.totalLabel}>Total Fare</Text>
                        <Text style={styles.totalValue}>₱{fare.toFixed(2)}</Text>
                      </View>

                      {passengerType === 'senior_pwd' && (
                        <Text style={styles.discountNotice}>
                          ✨ Discounted fare applied for Senior Citizen/PWD
                        </Text>
                      )}
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
                            <View style={styles.historyFareContainer}>
                              <Text style={styles.historyFare}>₱{ride.fare.toFixed(2)}</Text>
                              {ride.passengerType === 'senior_pwd' && (
                                <Text style={styles.historyPassengerBadge}>PWD/Senior</Text>
                              )}
                            </View>
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
  passengerTypeContainer: {
    flexDirection: "row",
    gap: 10,
  },
  passengerTypeButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  passengerTypeButtonActive: {
    borderColor: "#007AFF",
    backgroundColor: "#e7f3ff",
  },
  passengerTypeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    textAlign: "center",
  },
  passengerTypeTextActive: {
    color: "#007AFF",
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
    maxHeight: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchScroll: {
    maxHeight: 200,
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
  searchItemContent: {
    flex: 1,
  },
  searchItemText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "600",
  },
  searchItemSubtext: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
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
  discountNotice: {
    fontSize: 12,
    color: "#28a745",
    textAlign: "center",
    marginTop: 8,
    fontWeight: "600",
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
  historyFareContainer: {
    alignItems: "flex-end",
  },
  historyFare: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#28a745",
  },
  historyPassengerBadge: {
    fontSize: 10,
    color: "#007AFF",
    backgroundColor: "#e7f3ff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
    fontWeight: "600",
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