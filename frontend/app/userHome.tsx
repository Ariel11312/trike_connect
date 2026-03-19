import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

// ─────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────
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

interface MarkerDragEvent {
  nativeEvent: {
    coordinate: {
      latitude: number;
      longitude: number;
    };
  };
}

const STORAGE_KEYS = {
  CURRENT_RIDE: "@user_current_ride",
  IS_WAITING: "@user_is_waiting",
  BOOKING_DATA: "@user_booking_data",
  RIDE_HISTORY: "@user_ride_history",
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
  passengerType: "regular" | "senior_pwd";
  companionCount: number;
}

interface RideHistory {
  id: string;
  pickupLocation: LocationData;
  dropoffLocation: LocationData;
  distance: number;
  fare: number;
  date: string;
  timestamp: number;
  passengerType: "regular" | "senior_pwd";
  companionCount: number;
}

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

// ─────────────────────────────────────────────────────────────────
// TODA TERMINAL LOCATIONS
// ─────────────────────────────────────────────────────────────────
interface TodaTerminal {
  toda: string;
  latitude: number;
  longitude: number;
  description: string;
}

const TODA_TERMINALS: TodaTerminal[] = [
  { toda: "SM TODA",                       latitude: 14.9602, longitude: 120.8904, description: "SM City Baliuag Terminal" },
  { toda: "All TODA",                      latitude: 14.9602, longitude: 120.8904, description: "SM City Baliuag (All TODA)" },
  { toda: "BNBB TODA",                     latitude: 14.9606, longitude: 120.8980, description: "Bagong Nayon Terminal" },
  { toda: "BPP TODA",                      latitude: 14.9878, longitude: 120.8964, description: "Barangka Terminal" },
  { toda: "CALANTIPAY TODA",               latitude: 14.9676, longitude: 120.8642, description: "Calantipay Terminal" },
  { toda: "PC TODA",                       latitude: 14.9485, longitude: 120.8943, description: "Catdinan / San Jose Terminal" },
  { toda: "CONCEPCION TODA",               latitude: 14.9504, longitude: 120.8879, description: "Concepcion / Bungad Terminal" },
  { toda: "HINUKAY TODA",                  latitude: 15.0057, longitude: 120.8872, description: "Hinukay Terminal" },
  { toda: "PAGALA TODA",                   latitude: 14.9647, longitude: 120.8879, description: "Pagala Terminal" },
  { toda: "API, BA, LB TODA",              latitude: 14.9527, longitude: 120.9030, description: "Poblacion Terminal" },
  { toda: "BB, MA NO. SM, STA ELENA TODA", latitude: 14.9670, longitude: 120.9116, description: "Sabang Dulo Terminal" },
  { toda: "SR TODA",                       latitude: 14.9990, longitude: 120.8886, description: "San Roque Terminal" },
  { toda: "ASBATODA",                      latitude: 14.9363, longitude: 120.8915, description: "Sta. Barbara / Sta. Elena Terminal" },
  { toda: "TPA TODA",                      latitude: 14.9693, longitude: 120.8957, description: "Tangos / Bungad Terminal" },
  { toda: "APO TODA",                      latitude: 14.9566, longitude: 120.8944, description: "Sto. Cristo Terminal" },
  { toda: "SS, STS TODA",                  latitude: 14.9631, longitude: 120.9030, description: "Subic Terminal" },
  { toda: "STA TODA",                      latitude: 14.9761, longitude: 120.8858, description: "Sulivan Terminal" },
  { toda: "TC TODA",                       latitude: 14.9585, longitude: 120.8900, description: "Tibag Terminal" },
  { toda: "TILAPAYONG TODA",               latitude: 14.9749, longitude: 120.8808, description: "Tilapayong Terminal" },
  { toda: "PIEL TODA",                     latitude: 14.9865, longitude: 120.8858, description: "Piel Terminal" },
  { toda: "MT TODA",                       latitude: 14.9529, longitude: 120.8585, description: "Matangtubig Terminal" },
  { toda: "BTI TODA",                      latitude: 14.9505, longitude: 120.8840, description: "Pinagbarilan Terminal" },
  { toda: "VDF TODA",                      latitude: 14.9474, longitude: 120.8855, description: "VDF / Northville Terminal" },
];

// ─────────────────────────────────────────────────────────────────
// FARE MATRIX
// ─────────────────────────────────────────────────────────────────
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
  { destination: "Bayan",                   toda: "All TODA",                      regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.8847, longitude: 120.8572 },
  { destination: "SM",                      toda: "All TODA",                      regularFare: 15.00, seniorPwdFare: 10.00, bayangFare2Pax: 30.00, bayangFareSM: 0,     latitude: 14.8889, longitude: 120.8543 },
  { destination: "Bagong Nayon",            toda: "BNBB TODA",                     regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8920, longitude: 120.8590 },
  { destination: "Barangka",               toda: "BPP TODA",                      regularFare: 20.00, seniorPwdFare: 16.00, bayangFare2Pax: 60.00, bayangFareSM: 60.00, latitude: 14.8950, longitude: 120.8620 },
  { destination: "Sapang",                 toda: "BPP TODA",                      regularFare: 25.00, seniorPwdFare: 20.00, bayangFare2Pax: 75.00, bayangFareSM: 75.00, latitude: 14.9000, longitude: 120.8650 },
  { destination: "Calantipay",             toda: "CALANTIPAY TODA",               regularFare: 25.00, seniorPwdFare: 20.00, bayangFare2Pax: 75.00, bayangFareSM: 75.00, latitude: 14.8780, longitude: 120.8500 },
  { destination: "Catulnan",               toda: "PC TODA",                       regularFare: 25.00, seniorPwdFare: 20.00, bayangFare2Pax: 50.00, bayangFareSM: 45.00, latitude: 14.8700, longitude: 120.8450 },
  { destination: "Concepcion",             toda: "PC TODA",                       regularFare: 22.50, seniorPwdFare: 18.50, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.8650, longitude: 120.8400 },
  { destination: "Concepcion Bungahan",    toda: "CONCEPCION TODA",               regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8600, longitude: 120.8350 },
  { destination: "Concepcion Dulo",        toda: "CONCEPCION TODA",               regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.8550, longitude: 120.8300 },
  { destination: "Hinukay",                toda: "HINUKAY TODA",                  regularFare: 25.00, seniorPwdFare: 20.00, bayangFare2Pax: 75.00, bayangFareSM: 55.00, latitude: 14.9100, longitude: 120.8700 },
  { destination: "Matagtubig",             toda: "MT TODA",                       regularFare: 27.50, seniorPwdFare: 22.00, bayangFare2Pax: 55.00, bayangFareSM: 55.00, latitude: 14.9150, longitude: 120.8750 },
  { destination: "Pagala",                 toda: "PAGALA TODA",                   regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8800, longitude: 120.8520 },
  { destination: "Piel",                   toda: "PIEL TODA",                     regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.9050, longitude: 120.8680 },
  { destination: "Poblacion",              toda: "API, BA, LB TODA",              regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8870, longitude: 120.8560 },
  { destination: "Sabang",                 toda: "BB, MA NO. SM, STA ELENA TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 35.00, latitude: 14.8750, longitude: 120.8480 },
  { destination: "Sabang Dulo",            toda: "BB, MA NO. SM, STA ELENA TODA", regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 35.00, latitude: 14.8720, longitude: 120.8460 },
  { destination: "San Roque",              toda: "SR TODA",                       regularFare: 20.00, seniorPwdFare: 16.00, bayangFare2Pax: 40.00, bayangFareSM: 40.00, latitude: 14.8680, longitude: 120.8420 },
  { destination: "Sta. Babrara",           toda: "ASBATODA",                      regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.9200, longitude: 120.8800 },
  { destination: "San Jose",               toda: "SM TODA",                       regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8820, longitude: 120.8540 },
  { destination: "Tarcan",                 toda: "SM TODA",                       regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 45.00, latitude: 14.8900, longitude: 120.8580 },
  { destination: "Tarcan Mulawin Bata",    toda: "SM TODA",                       regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.8950, longitude: 120.8600 },
  { destination: "Tarcan Mulawin Matanda", toda: "SM TODA",                       regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.8980, longitude: 120.8620 },
  { destination: "Makinabang",             toda: "SM TODA",                       regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.9020, longitude: 120.8640 },
  { destination: "Sto. Cristo",            toda: "APO TODA",                      regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 25.00, latitude: 14.8850, longitude: 120.8550 },
  { destination: "Sto. Niño",              toda: "SM TODA",                       regularFare: 17.50, seniorPwdFare: 14.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.8920, longitude: 120.8570 },
  { destination: "Subic",                  toda: "SS, STS TODA",                  regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8780, longitude: 120.8510 },
  { destination: "Sulivan",                toda: "STA TODA",                      regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 45.00, latitude: 14.9080, longitude: 120.8720 },
  { destination: "Tangos Bungao Citiva",   toda: "TPA TODA",                      regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.8680, longitude: 120.8440 },
  { destination: "Tangos Dulo",            toda: "TPA TODA",                      regularFare: 20.00, seniorPwdFare: 16.00, bayangFare2Pax: 40.00, bayangFareSM: 30.00, latitude: 14.8650, longitude: 120.8420 },
  { destination: "Tigaon",                 toda: "BTI TODA",                      regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 40.00, latitude: 14.9250, longitude: 120.8850 },
  { destination: "Tibag",                  toda: "TC TODA",                       regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8830, longitude: 120.8530 },
  { destination: "Tilapayong",             toda: "TILAPAYONG TODA",               regularFare: 22.50, seniorPwdFare: 18.00, bayangFare2Pax: 45.00, bayangFareSM: 40.00, latitude: 14.9300, longitude: 120.8900 },
  { destination: "VDF",                    toda: "VDF TODA",                      regularFare: 12.50, seniorPwdFare: 10.00, bayangFare2Pax: 25.00, bayangFareSM: 30.00, latitude: 14.8860, longitude: 120.8545 },
  { destination: "VDF Northville",         toda: "VDF TODA",                      regularFare: 15.00, seniorPwdFare: 12.00, bayangFare2Pax: 30.00, bayangFareSM: 30.00, latitude: 14.8880, longitude: 120.8555 },
];

interface RecommendedToda extends TodaTerminal {
  distanceKm: number;
}

// ─────────────────────────────────────────────────────────────────
// COMPANION SURCHARGE HELPER
// ─────────────────────────────────────────────────────────────────
const MAX_TOTAL_PASSENGERS = 5;

function applyCompanionSurcharge(baseFare: number, companionCount: number): number {
  const companions = Math.min(Math.max(companionCount, 0), MAX_TOTAL_PASSENGERS - 1);
  const surcharge  = baseFare * 0.20 * companions;
  return Math.round((baseFare + surcharge) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────
export default function UserHome() {
  const [showBookingForm, setShowBookingForm]     = useState(false);
  const [pickupLocation, setPickupLocation]       = useState("");
  const [dropoffLocation, setDropoffLocation]     = useState("");
  const [distance, setDistance]                   = useState(0);
  const [fare, setFare]                           = useState(0);
  const [modalVisible, setModalVisible]           = useState(false);
  const [modalType, setModalType]                 = useState<"success" | "error">("success");
  const [modalMessage, setModalMessage]           = useState("");
  const [user, setUser]                           = useState<User | null>(null);
  const [currentRide, setCurrentRide]             = useState<any>(null);
  const [isWaitingForDriver, setIsWaitingForDriver] = useState(false);
  const [isRestoringState, setIsRestoringState]   = useState(true);
  const [rideHistory, setRideHistory]             = useState<RideHistory[]>([]);
  const [showHistoryModal, setShowHistoryModal]   = useState(false);
  const [selectedTodaName, setSelectedTodaName]   = useState("");
  const [todaNames, setTodaNames]                 = useState<string[]>([]);
  const [assignedDriver, setAssignedDriver]       = useState<Driver | null>(null);
  const [passengerType, setPassengerType]         = useState<"regular" | "senior_pwd">("regular");
  const [recommendedTodas, setRecommendedTodas]   = useState<RecommendedToda[]>([]);
  const [companionCount, setCompanionCount]       = useState(0);
  const [isConfirmingComplete, setIsConfirmingComplete] = useState(false);

  // Report states
  const [showReportModal, setShowReportModal]           = useState(false);
  const [selectedReportReason, setSelectedReportReason] = useState("");
  const [reportComment, setReportComment]               = useState("");
  const [isSubmittingReport, setIsSubmittingReport]     = useState(false);

  // Location / map states
  const [currentLocation, setCurrentLocation]   = useState<LocationData | null>(null);
  const [dropoffMarker, setDropoffMarker]       = useState<LocationData | null>(null);
  const [mapRegion, setMapRegion]               = useState({
    latitude: 14.8847, longitude: 120.8572, latitudeDelta: 0.1, longitudeDelta: 0.1,
  });
  const [searchQuery, setSearchQuery]           = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchResults, setSearchResults]       = useState<FareMatrixEntry[]>([]);
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);

  const base_url = process.env.EXPO_PUBLIC_API_URL;

  useEffect(() => {
    const uniqueTodas = Array.from(new Set(FARE_MATRIX.map((e) => e.toda)));
    setTodaNames(uniqueTodas);
  }, []);

  useEffect(() => {
    if (currentLocation) {
      const recs = getRecommendedTodas(currentLocation.latitude, currentLocation.longitude);
      setRecommendedTodas(recs);
      if (!selectedTodaName && recs.length > 0) setSelectedTodaName(recs[0].toda);
    }
  }, [currentLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  const MAX_RECOMMENDATIONS = 3;

  const getRecommendedTodas = (userLat: number, userLng: number): RecommendedToda[] => {
    const seen = new Set<string>();
    const unique = TODA_TERMINALS.filter((t) => {
      if (seen.has(t.toda)) return false;
      seen.add(t.toda);
      return true;
    });
    const withDist: RecommendedToda[] = unique.map((t) => ({
      ...t,
      distanceKm: calculateDistance(userLat, userLng, t.latitude, t.longitude),
    }));
    withDist.sort((a, b) => a.distanceKm - b.distanceKm);
    return withDist.slice(0, MAX_RECOMMENDATIONS);
  };

  const formatDistanceLabel = (km: number) =>
    km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;

  const isInBaliuag = (name: string) => {
    const n = name.toLowerCase();
    return (
      n.includes("baliuag") ||
      n.includes("pulilan") ||
      n.includes("baliwag") ||
      n.includes("bulacan")
    );
  };

  const findDestinationFromAddress = (name: string): FareMatrixEntry | null => {
    const n = name.toLowerCase();
    return FARE_MATRIX.find((e) => n.includes(e.destination.toLowerCase())) ?? null;
  };

  const calculateFareFromMatrix = (
    pickupAddress: string,
    dropoffAddress: string,
    pickupLoc: LocationData | null,
    dropoffLoc: LocationData | null,
    toda: string,
    passType: "regular" | "senior_pwd"
  ): { fare: number; calculationType: "matrix" | "distance" | "cross-location" } => {
    if (!isInBaliuag(pickupAddress)) return { fare: 0, calculationType: "matrix" };

    const pickupDest  = findDestinationFromAddress(pickupAddress);
    const dropoffDest = findDestinationFromAddress(dropoffAddress);

    if (pickupDest && dropoffDest && pickupLoc && dropoffLoc) {
      const distKm = calculateDistance(
        pickupDest.latitude, pickupDest.longitude,
        dropoffDest.latitude, dropoffDest.longitude
      );
      const entry = FARE_MATRIX.find(
        (e) =>
          e.destination.toLowerCase() === dropoffDest.destination.toLowerCase() &&
          (e.toda === toda || e.toda === "All TODA")
      );
      if (entry) {
        const base = passType === "senior_pwd" ? entry.seniorPwdFare : entry.regularFare;
        if (distKm > 2) {
          const calc = Math.ceil(distKm * 15);
          return {
            fare: passType === "senior_pwd" ? Math.ceil(calc * 0.8) : calc,
            calculationType: "cross-location",
          };
        }
        return { fare: base, calculationType: "matrix" };
      }
    }

    if (dropoffDest) {
      const entry = FARE_MATRIX.find(
        (e) =>
          e.destination.toLowerCase() === dropoffDest.destination.toLowerCase() &&
          (e.toda === toda || e.toda === "All TODA")
      );
      if (entry)
        return {
          fare: passType === "senior_pwd" ? entry.seniorPwdFare : entry.regularFare,
          calculationType: "matrix",
        };
    }

    if (pickupLoc && dropoffLoc) {
      const distKm = calculateDistance(
        pickupLoc.latitude, pickupLoc.longitude,
        dropoffLoc.latitude, dropoffLoc.longitude
      );
      const calc = Math.ceil(distKm * 15);
      return {
        fare: passType === "senior_pwd" ? Math.ceil(calc * 0.8) : calc,
        calculationType: "distance",
      };
    }

    return { fare: 0, calculationType: "matrix" };
  };

  useEffect(() => {
    restorePersistedState();
    loadRideHistory();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const restorePersistedState = async () => {
    try {
      const [savedRide, savedWaiting, savedBooking] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.CURRENT_RIDE),
        AsyncStorage.getItem(STORAGE_KEYS.IS_WAITING),
        AsyncStorage.getItem(STORAGE_KEYS.BOOKING_DATA),
      ]);
      if (savedRide && savedWaiting === "true") {
        const ride = JSON.parse(savedRide);
        setCurrentRide(ride);
        setIsWaitingForDriver(true);
        if (ride.status === "pending_confirmation") setIsConfirmingComplete(true);
        if (savedBooking) {
          const b: BookingData = JSON.parse(savedBooking);
          setPickupLocation(b.pickupLocation);
          setDropoffLocation(b.dropoffLocation);
          setCurrentLocation(b.currentLocation);
          setDropoffMarker(b.dropoffMarker);
          setDistance(b.distance);
          setFare(b.fare);
          setRouteCoordinates(b.routeCoordinates);
          setSelectedTodaName(b.selectedTodaName || "");
          setPassengerType(b.passengerType || "regular");
          setCompanionCount(b.companionCount ?? 0);
          if (b.currentLocation && b.dropoffMarker)
            fitMapToMarkers(b.currentLocation, b.dropoffMarker);
        }
        const driverId = ride.driver || ride.driverId || ride.acceptedBy;
        if (driverId) fetchDriverInfo(driverId);
      }
    } catch (e) {
      console.error("❌ Error restoring state:", e);
    } finally {
      setIsRestoringState(false);
    }
  };

  const fetchDriverInfo = async (driverIdOrObject: any) => {
    try {
      if (typeof driverIdOrObject === "object" && driverIdOrObject !== null) {
        setAssignedDriver({
          _id: driverIdOrObject._id || driverIdOrObject.id,
          firstName: driverIdOrObject.firstName,
          lastName: driverIdOrObject.lastName,
          phoneNumber: driverIdOrObject.phoneNumber,
          todaName: driverIdOrObject.todaName || "",
          licensePlate: driverIdOrObject.licensePlate || "",
        });
        return;
      }
      const res  = await fetch(`${base_url}/api/auth/user/${driverIdOrObject}`, {
        method: "GET", credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success && data.user) {
        setAssignedDriver({
          _id: data.user._id || data.user.id,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          phoneNumber: data.user.phoneNumber,
          todaName: data.user.todaName || "",
          licensePlate: data.user.licensePlate || "",
        });
      }
    } catch (e) {
      console.error("❌ Error fetching driver info:", e);
    }
  };

  const loadRideHistory = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.RIDE_HISTORY);
      if (raw) {
        const h: RideHistory[] = JSON.parse(raw);
        h.sort((a, b) => b.timestamp - a.timestamp);
        setRideHistory(h);
      }
    } catch (e) {
      console.error("❌ Error loading history:", e);
    }
  };

  const saveToHistory = async (
    pickup: LocationData,
    dropoff: LocationData,
    dist: number,
    cost: number,
    passType: "regular" | "senior_pwd",
    companions: number
  ) => {
    try {
      const entry: RideHistory = {
        id: Date.now().toString(),
        pickupLocation: pickup,
        dropoffLocation: dropoff,
        distance: dist,
        fare: cost,
        date: new Date().toISOString(),
        timestamp: Date.now(),
        passengerType: passType,
        companionCount: companions,
      };
      const updated = [entry, ...rideHistory].slice(0, 50);
      await AsyncStorage.setItem(STORAGE_KEYS.RIDE_HISTORY, JSON.stringify(updated));
      setRideHistory(updated);
    } catch (e) {
      console.error("❌ Error saving history:", e);
    }
  };

  const groupHistoryByDate = () => {
    const grouped: { [k: string]: RideHistory[] } = {};
    rideHistory.forEach((ride) => {
      const d = new Date(ride.date);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      let key =
        d.toDateString() === today.toDateString()
          ? "Today"
          : d.toDateString() === yesterday.toDateString()
          ? "Yesterday"
          : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(ride);
    });
    return grouped;
  };

  const selectFromHistory = (item: RideHistory) => {
    if (isWaitingForDriver || currentRide) {
      Alert.alert("Ongoing Ride", "Please complete or cancel your current ride first.");
      return;
    }
    setDropoffMarker(item.dropoffLocation);
    setDropoffLocation(item.dropoffLocation.name);
    setPassengerType(item.passengerType);
    setCompanionCount(item.companionCount ?? 0);
    setShowHistoryModal(false);
    setSearchQuery("");
    setShowSearchResults(false);
    Keyboard.dismiss();
    if (currentLocation) {
      getDirections(currentLocation, item.dropoffLocation);
      fitMapToMarkers(currentLocation, item.dropoffLocation);
    }
    if (!showBookingForm) setShowBookingForm(true);
  };

  useEffect(() => {
    if (isRestoringState) return;
    const persist = async () => {
      try {
        if (currentRide && isWaitingForDriver) {
          const b: BookingData = {
            pickupLocation, dropoffLocation, currentLocation, dropoffMarker,
            distance, fare, routeCoordinates, selectedTodaName, passengerType,
            companionCount,
          };
          await Promise.all([
            AsyncStorage.setItem(STORAGE_KEYS.CURRENT_RIDE,  JSON.stringify(currentRide)),
            AsyncStorage.setItem(STORAGE_KEYS.IS_WAITING,    "true"),
            AsyncStorage.setItem(STORAGE_KEYS.BOOKING_DATA,  JSON.stringify(b)),
          ]);
        } else {
          await Promise.all([
            AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_RIDE),
            AsyncStorage.removeItem(STORAGE_KEYS.IS_WAITING),
            AsyncStorage.removeItem(STORAGE_KEYS.BOOKING_DATA),
          ]);
        }
      } catch (e) {
        console.error("❌ Error persisting state:", e);
      }
    };
    persist();
  }, [currentRide, isWaitingForDriver, pickupLocation, dropoffLocation, distance, fare, selectedTodaName, passengerType, companionCount, isRestoringState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch(`${base_url}/api/auth/me`, {
      method: "GET", credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.user)
          setUser({ id: data.user.id, firstname: data.user.firstName, lastname: data.user.lastName });
      })
      .catch(console.error);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isRestoringState) getCurrentLocation();
  }, [isRestoringState]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentRide || !isWaitingForDriver) return;

    const checkRideStatus = async () => {
      try {
        const res  = await fetch(`${base_url}/api/rides/${currentRide._id}`, {
          method: "GET", credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!data.success || !data.ride) return;

        const rideStatus     = data.ride.status as string;
        const previousStatus = currentRide.status as string;
        const driverId       = data.ride.driver || data.ride.driverId || data.ride.acceptedBy;

        setCurrentRide(data.ride);

        if (rideStatus === "accepted") {
          if (previousStatus !== "accepted") {
            if (!assignedDriver && driverId) await fetchDriverInfo(driverId);
            Alert.alert("🎉 Ride Accepted!", "A driver has accepted your ride. They will arrive shortly!", [{ text: "OK" }]);
          } else if (!assignedDriver && driverId) {
            await fetchDriverInfo(driverId);
          }
        } else if (rideStatus === "pending_confirmation") {
          if (!isConfirmingComplete) {
            setIsConfirmingComplete(true);
          }
        } else if (rideStatus === "completed") {
          setIsWaitingForDriver(false);
          setCurrentRide(null);
          setAssignedDriver(null);
          setIsConfirmingComplete(false);
          Alert.alert("✅ Ride Completed!", "Your ride has been completed. Thank you for using our service!", [{ text: "OK" }]);
        } else if (rideStatus === "cancelled") {
          setIsWaitingForDriver(false);
          setCurrentRide(null);
          setAssignedDriver(null);
          setIsConfirmingComplete(false);
          const reason = data.ride.cancelledReason || "Your ride has been cancelled.";
          Alert.alert("❌ Ride Cancelled", reason, [{ text: "OK" }]);
        }
      } catch (e) {
        console.error("Error checking ride status:", e);
      }
    };

    const interval = setInterval(checkRideStatus, 3000);
    checkRideStatus();
    return () => clearInterval(interval);
  }, [currentRide, isWaitingForDriver]); // eslint-disable-line react-hooks/exhaustive-deps

  const getCurrentLocation = async () => {
    if (currentLocation) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission is required to use this app");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = loc.coords;
      const address = await Location.reverseGeocodeAsync({ latitude, longitude });
      const text = address[0]
        ? `${address[0].street || ""}, ${address[0].city || ""}, ${address[0].region || ""}`.trim()
        : `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

      if (!isInBaliuag(text)) {
        Alert.alert(
          "⚠️ Outside Coverage Area",
          `Your current location (${text}) is outside Baliuag/Baliwag. This service only operates within Baliuag/Baliwag, Bulacan.`,
          [{ text: "OK", style: "cancel" }]
        );
      }

      const loc2: LocationData = { name: text, latitude, longitude };
      setCurrentLocation(loc2);
      setPickupLocation(text);
      setMapRegion({ latitude, longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });

      const recs = getRecommendedTodas(latitude, longitude);
      setRecommendedTodas(recs);
      if (!selectedTodaName && recs.length > 0) setSelectedTodaName(recs[0].toda);
    } catch (e) {
      console.error("Error getting location:", e);
      Alert.alert("Error", "Unable to get current location");
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R    = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 100) / 100;
  };

  const fitMapToMarkers = (pickup: LocationData, dropoff: LocationData) => {
    const minLat = Math.min(pickup.latitude, dropoff.latitude);
    const maxLat = Math.max(pickup.latitude, dropoff.latitude);
    const minLng = Math.min(pickup.longitude, dropoff.longitude);
    const maxLng = Math.max(pickup.longitude, dropoff.longitude);
    setMapRegion({
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.02),
      longitudeDelta: Math.max((maxLng - minLng) * 1.5, 0.02),
    });
  };

  const getDirections = async (origin: LocationData, dest: LocationData) => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${dest.longitude},${dest.latitude}?overview=full&geometries=geojson`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.code === "Ok" && data.routes?.length > 0) {
        const route = data.routes[0];
        setRouteCoordinates(
          route.geometry.coordinates.map((c: number[]) => ({ latitude: c[1], longitude: c[0] }))
        );
        setDistance(Math.round(route.distance / 10) / 100);
      } else {
        const d = calculateDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude);
        setDistance(d);
        setRouteCoordinates([
          { latitude: origin.latitude,  longitude: origin.longitude },
          { latitude: dest.latitude,    longitude: dest.longitude },
        ]);
      }
    } catch {
      const d = calculateDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude);
      setDistance(d);
      setRouteCoordinates([
        { latitude: origin.latitude, longitude: origin.longitude },
        { latitude: dest.latitude,   longitude: dest.longitude },
      ]);
    }
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout", style: "destructive",
        onPress: async () => {
          try {
            await Promise.all([
              AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_RIDE),
              AsyncStorage.removeItem(STORAGE_KEYS.IS_WAITING),
              AsyncStorage.removeItem(STORAGE_KEYS.BOOKING_DATA),
            ]);
            await fetch(`${base_url}/api/auth/logout`, {
              method: "POST", credentials: "include",
              headers: { "Content-Type": "application/json" },
            });
            router.replace("/");
          } catch {
            Alert.alert("Error", "Failed to logout. Please try again.");
          }
        },
      },
    ]);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    const filtered = FARE_MATRIX.filter((e) =>
      e.destination.toLowerCase().includes(query.toLowerCase())
    );
    setSearchResults(filtered);
    setShowSearchResults(filtered.length > 0);
  };

  const handleSelectSearchResult = (location: FareMatrixEntry) => {
    if (isWaitingForDriver || currentRide) {
      Alert.alert("Ongoing Ride", "Please complete or cancel your current ride first.");
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
      if (selectedTodaName) {
        const { fare: baseFare } = calculateFareFromMatrix(
          pickupLocation, location.destination,
          currentLocation, dropoffLoc,
          selectedTodaName, passengerType
        );
        if (baseFare > 0) setFare(applyCompanionSurcharge(baseFare, companionCount));
      }
      getDirections(currentLocation, dropoffLoc);
      fitMapToMarkers(currentLocation, dropoffLoc);
    }
    if (!showBookingForm) setShowBookingForm(true);
  };

  const handleMapPress = async (event: any) => {
    if (isWaitingForDriver || currentRide) {
      Alert.alert("Ongoing Ride", "Please complete or cancel your current ride first.");
      return;
    }
    const { latitude, longitude } = event.nativeEvent.coordinate;
    
    try {
      const address = await Location.reverseGeocodeAsync({ latitude, longitude });
      const text = address[0]
        ? [address[0].street, address[0].city, address[0].region].filter(Boolean).join(", ")
        : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      
      if (!isInBaliuag(text)) {
        Alert.alert(
          "⚠️ Outside Coverage Area",
          `The selected location (${text}) may be outside Baliuag/Baliwag coverage.`,
          [{ text: "OK" }]
        );
      }
      
      const dropoffLoc: LocationData = { name: text, latitude, longitude };
      setDropoffMarker(dropoffLoc);
      setDropoffLocation(text);
      setSearchQuery("");
      setShowSearchResults(false);
      
      if (!showBookingForm) setShowBookingForm(true);
      
      if (currentLocation) {
        fitMapToMarkers(currentLocation, dropoffLoc);
        getDirections(currentLocation, dropoffLoc);
        
        if (selectedTodaName) {
          const { fare: baseFare } = calculateFareFromMatrix(
            pickupLocation, text, currentLocation, dropoffLoc, selectedTodaName, passengerType
          );
          if (baseFare > 0) setFare(applyCompanionSurcharge(baseFare, companionCount));
        }
      }
    } catch (e) {
      console.error("Error reverse geocoding:", e);
      Alert.alert("Error", "Unable to get location name. Please try again.");
    }
  };

  const handleMarkerDragEnd = async (event: MarkerDragEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    
    try {
      const address = await Location.reverseGeocodeAsync({ latitude, longitude });
      const text = address[0]
        ? [address[0].street, address[0].city, address[0].region].filter(Boolean).join(", ")
        : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      
      if (!isInBaliuag(text)) {
        Alert.alert(
          "⚠️ Outside Coverage Area",
          `The selected location (${text}) may be outside Baliuag/Baliwag coverage.`,
          [{ text: "OK" }]
        );
      }
      
      const dropoffLoc: LocationData = { name: text, latitude, longitude };
      setDropoffMarker(dropoffLoc);
      setDropoffLocation(text);
      
      if (currentLocation) {
        getDirections(currentLocation, dropoffLoc);
        
        if (selectedTodaName) {
          const { fare: baseFare } = calculateFareFromMatrix(
            pickupLocation, text, currentLocation, dropoffLoc, selectedTodaName, passengerType
          );
          if (baseFare > 0) setFare(applyCompanionSurcharge(baseFare, companionCount));
        }
      }
    } catch (e) {
      console.error("Error during marker drag:", e);
      Alert.alert("Error", "Unable to update location. Please try again.");
    }
  };

  useEffect(() => {
    if (dropoffLocation && selectedTodaName && currentLocation && dropoffMarker) {
      const { fare: baseFare } = calculateFareFromMatrix(
        pickupLocation, dropoffLocation, currentLocation, dropoffMarker, selectedTodaName, passengerType
      );
      if (baseFare > 0) setFare(applyCompanionSurcharge(baseFare, companionCount));
    }
  }, [selectedTodaName, passengerType, dropoffLocation, companionCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const showModal = (type: "success" | "error", message: string) => {
    setModalType(type); setModalMessage(message); setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    if (modalType === "success" && !isWaitingForDriver) {
      setDropoffLocation(""); setDropoffMarker(null);
      setDistance(0); setFare(0);
      setSearchQuery(""); setShowSearchResults(false);
      setRouteCoordinates([]); setShowBookingForm(false);
      setSelectedTodaName(""); setPassengerType("regular");
      setCompanionCount(0);
    }
  };

  const handleBookRide = async () => {
    if (!pickupLocation || !dropoffLocation)  { showModal("error", "Please select a dropoff location"); return; }
    if (!isInBaliuag(pickupLocation))          { showModal("error", "⚠️ Your pickup location is outside Baliuag/Baliwag coverage area."); return; }
    if (!isInBaliuag(dropoffLocation))         { showModal("error", "⚠️ Your dropoff location is outside Baliuag/Baliwag coverage area."); return; }
    if (!selectedTodaName)                     { showModal("error", "Please select a TODA"); return; }
    if (!currentLocation || !dropoffMarker)    { showModal("error", "Location data is missing. Please try again."); return; }
    if (fare === 0)                            { showModal("error", "Unable to calculate fare. Please try again."); return; }
    if (!user)                                 { showModal("error", "User data not loaded. Please try again."); return; }

    const totalPassengers = 1 + companionCount;

    try {
      const res  = await fetch(`${base_url}/api/rides/book`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id, firstname: user.firstname, lastname: user.lastname,
          pickupLocation:  { name: pickupLocation,  latitude: currentLocation.latitude,  longitude: currentLocation.longitude },
          dropoffLocation: { name: dropoffLocation, latitude: dropoffMarker.latitude,    longitude: dropoffMarker.longitude },
          distance, fare,
          todaName: selectedTodaName,
          passengerType,
          companionCount,
          totalPassengers,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await saveToHistory(currentLocation, dropoffMarker, distance, fare, passengerType, companionCount);
        setCurrentRide(data.ride);
        setIsWaitingForDriver(true);
        showModal("success", "Ride booked successfully! Waiting for driver acceptance...");
      } else {
        showModal("error", data.message || "Booking failed. Please try again.");
      }
    } catch {
      showModal("error", "Network error. Please check your connection.");
    }
  };

  const handleCancelRide = async () => {
    if (currentRide?.status === "accepted" || currentRide?.status === "in-progress" || assignedDriver) {
      Alert.alert(
        "Cannot Cancel",
        "A driver has already been assigned to your ride. You can no longer cancel at this point.",
        [{ text: "OK" }]
      );
      return;
    }
    Alert.alert(
      "Cancel Ride",
      "Are you sure you want to cancel your ride request?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel", style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(`${base_url}/api/rides/${currentRide._id}/cancel`, {
                method: "PUT", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cancelledBy: "user", cancelledReason: "Cancelled by user" }),
              });
              if (res.ok) {
                setIsWaitingForDriver(false); setCurrentRide(null); setAssignedDriver(null);
                setIsConfirmingComplete(false);
                setDropoffLocation(""); setDropoffMarker(null);
                setDistance(0); setFare(0);
                setSearchQuery(""); setShowSearchResults(false);
                setRouteCoordinates([]); setSelectedTodaName(""); setPassengerType("regular");
                setCompanionCount(0);
                Alert.alert("Ride Cancelled", "Your ride has been cancelled successfully.");
              }
            } catch (e) {
              console.error("Error cancelling ride:", e);
            }
          },
        },
      ]
    );
  };

  const handleConfirmComplete = async () => {
    if (!currentRide) return;
    Alert.alert(
      "✅ Confirm Arrival",
      "Have you reached your destination? This will complete the trip.",
      [
        { text: "Not Yet", style: "cancel" },
        {
          text: "Yes, I've Arrived",
          onPress: async () => {
            try {
              const res = await fetch(`${base_url}/api/rides/${currentRide._id}/status`, {
                method: "PUT", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "completed" }),
              });
              if (res.ok) {
                setIsWaitingForDriver(false);
                setCurrentRide(null);
                setAssignedDriver(null);
                setIsConfirmingComplete(false);
                setDropoffLocation(""); setDropoffMarker(null);
                setDistance(0); setFare(0);
                setSearchQuery(""); setShowSearchResults(false);
                setRouteCoordinates([]); setSelectedTodaName(""); setPassengerType("regular");
                setCompanionCount(0);
                Alert.alert("✅ Trip Completed", "Thank you for riding with us!");
              } else {
                Alert.alert("Error", "Failed to confirm trip. Please try again.");
              }
            } catch (e) {
              console.error("Error confirming complete:", e);
              Alert.alert("Error", "Network error. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleCallDriver = () => {
    if (assignedDriver?.phoneNumber)
      Linking.openURL(`tel:${assignedDriver.phoneNumber.replace(/[^0-9+]/g, "")}`);
  };

  const handleMessageDriver = async () => {
    if (!assignedDriver || !user) {
      Alert.alert("Error", "Unable to start chat. Driver or user information missing.");
      return;
    }
    try {
      const res  = await fetch(`${base_url}/api/chat/create-new-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members: [user.id, assignedDriver._id] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        router.push({
          pathname: "/chat",
          params: {
            chatId: data.data._id,
            driverName: `${assignedDriver.firstName} ${assignedDriver.lastName}`,
            otherUserId: assignedDriver._id,
          },
        });
      } else {
        Alert.alert("Error", data.message || "Failed to start chat.");
      }
    } catch {
      Alert.alert("Error", "Unable to start chat. Please check your connection.");
    }
  };

  const handleOpenReportModal  = () => { setShowReportModal(true);  setSelectedReportReason(""); setReportComment(""); };
  const handleCloseReportModal = () => { setShowReportModal(false); setSelectedReportReason(""); setReportComment(""); };

  const handleSubmitReport = async () => {
    if (!selectedReportReason)           { Alert.alert("Missing Information", "Please select a reason."); return; }
    if (!assignedDriver || !currentRide) { Alert.alert("Error", "Driver information not available."); return; }
    setIsSubmittingReport(true);
    try {
      const res  = await fetch(`${base_url}/api/reports/driver`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rideId: currentRide._id, driverId: assignedDriver._id,
          reason: selectedReportReason, comment: reportComment, reportedBy: user?.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert("Report Submitted", "Thank you. We will review this report.", [{ text: "OK" }]);
        handleCloseReportModal();
      } else {
        Alert.alert("Error", data.message || "Failed to submit report.");
      }
    } catch {
      Alert.alert("Network Error", "Unable to submit report.");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const canCancelRide = !assignedDriver && currentRide?.status === "pending";

  const { fare: baseFareForDisplay } = (dropoffLocation && selectedTodaName && currentLocation && dropoffMarker)
    ? calculateFareFromMatrix(pickupLocation, dropoffLocation, currentLocation, dropoffMarker, selectedTodaName, passengerType)
    : { fare: 0 };
  const surchargeAmount = baseFareForDisplay > 0 ? baseFareForDisplay * 0.20 * companionCount : 0;

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>

        <MapView
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          region={mapRegion}
          onPress={handleMapPress}
          showsUserLocation
          showsMyLocationButton
        >
          {currentLocation && (
            <Marker
              coordinate={{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }}
              title="Your Location" description="Pickup Point" pinColor="green"
            />
          )}
          {dropoffMarker && (
            <Marker
              coordinate={{ latitude: dropoffMarker.latitude, longitude: dropoffMarker.longitude }}
              title="Dropoff Location" 
              description={dropoffMarker.name} 
              pinColor="red"
              draggable={!isWaitingForDriver && !currentRide}
              onDragEnd={handleMarkerDragEnd}
            />
          )}
          {routeCoordinates.length > 0 && (
            <>
              <Polyline coordinates={routeCoordinates} strokeColor="rgba(0,0,0,0.3)" strokeWidth={8} lineCap="round" lineJoin="round" />
              <Polyline coordinates={routeCoordinates} strokeColor="#007AFF"          strokeWidth={6} lineCap="round" lineJoin="round" />
            </>
          )}
        </MapView>

        {/* Top bar */}
        <View style={styles.userCardContainer}>
          <View style={styles.userCard}>
            <Text style={styles.emoji}>👋</Text>
            <Text style={styles.userName}>{user ? `${user.firstname} ${user.lastname}` : "Loading..."}</Text>
          </View>
          <TouchableOpacity style={styles.profileButton} onPress={() => router.push("/profile")} activeOpacity={0.8}>
            <Text style={styles.profileIcon}>👤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutIcon}>🚪</Text>
          </TouchableOpacity>
        </View>

        {/* Distance Card */}
        {distance > 0 && !isWaitingForDriver && (
          <View style={styles.distanceCard}>
            <Text style={styles.distanceLabel}>Distance to Destination</Text>
            <Text style={styles.distanceValue}>{distance} km</Text>
          </View>
        )}

        {/* Bottom action area */}
        {!isWaitingForDriver ? (
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.historyButton} onPress={() => setShowHistoryModal(true)}>
              <Text style={styles.historyButtonText}>📜</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bookRideButton} onPress={() => setShowBookingForm(true)}>
              <Text style={styles.bookRideButtonText}>📍 Book a Ride</Text>
            </TouchableOpacity>
          </View>

        ) : isConfirmingComplete ? (
          <View style={styles.confirmCompleteCard}>
            <View style={styles.confirmCompleteHeader}>
              <Text style={styles.confirmCompleteIcon}>🏁</Text>
              <Text style={styles.confirmCompleteTitle}>You've Arrived!</Text>
            </View>
            <Text style={styles.confirmCompleteSubtext}>
              Your driver has indicated you've reached your destination. Please confirm to complete the trip.
            </Text>
            <View style={styles.confirmFareRow}>
              <Text style={styles.confirmFareLabel}>Trip Fare</Text>
              <Text style={styles.confirmFareValue}>₱{currentRide?.fare ?? fare}</Text>
            </View>
            <TouchableOpacity style={styles.confirmCompleteButton} onPress={handleConfirmComplete} activeOpacity={0.85}>
              <Text style={styles.confirmCompleteButtonText}>✅ Confirm Arrival & Complete Trip</Text>
            </TouchableOpacity>
            <Text style={styles.confirmCompleteNote}>⚠️ Only confirm if you have actually reached your destination.</Text>
          </View>

        ) : currentRide?.status === "accepted" && assignedDriver ? (
          <View style={styles.driverCard}>
            <View style={styles.driverCardHeader}>
              <Text style={styles.driverCardIcon}>🚗</Text>
              <Text style={styles.driverCardTitle}>Driver Assigned!</Text>
            </View>
            <View style={styles.driverInfoContainer}>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{assignedDriver.firstName} {assignedDriver.lastName}</Text>
                <Text style={styles.driverDetails}>🚕 {assignedDriver.todaName}</Text>
                <Text style={styles.driverDetails}>🚙 {assignedDriver.licensePlate}</Text>
              </View>
              <View style={styles.driverActionButtons}>
                <TouchableOpacity style={styles.messageButton} onPress={handleMessageDriver}>
                  <Text style={styles.actionIcon}>💬</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.callButton} onPress={handleCallDriver}>
                  <Text style={styles.actionIcon}>📞</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.driverSubtext}>Your driver is on the way!</Text>
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity style={styles.reportButton} onPress={handleOpenReportModal}>
                <Text style={styles.reportButtonText}>⚠️ Report Driver</Text>
              </TouchableOpacity>
              <View style={styles.cancelButtonDisabled}>
                <Text style={styles.cancelButtonDisabledText}>🔒 Cannot Cancel</Text>
              </View>
            </View>
            <Text style={styles.cancelLockedNote}>Cancellation is no longer available once a driver is assigned.</Text>
          </View>

        ) : (
          <View style={styles.waitingCard}>
            <View style={styles.waitingHeader}>
              <Text style={styles.waitingIcon}>⏳</Text>
              <Text style={styles.waitingTitle}>Waiting for Driver</Text>
            </View>
            <Text style={styles.waitingSubtext}>Looking for available drivers nearby...</Text>
            {canCancelRide ? (
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancelRide}>
                <Text style={styles.cancelButtonText}>Cancel Ride</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.cancelButtonDisabled}>
                <Text style={styles.cancelButtonDisabledText}>🔒 Cannot Cancel</Text>
              </View>
            )}
          </View>
        )}

        {/* Booking Form Overlay */}
        {showBookingForm && !isWaitingForDriver && (
          <View style={styles.overlay}>
            <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => { setShowBookingForm(false); Keyboard.dismiss(); }} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoid} keyboardVerticalOffset={0}>
              <View style={styles.formContainer}>
                <View style={styles.handleBar} />
                <ScrollView style={styles.bookaride} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
                  <Text style={styles.title}>Book a Ride</Text>
                  <Text style={styles.instructionText}>📍 Search for a location, tap map, or hold & drag the red pin</Text>

                  {/* Recommended TODA */}
                  {recommendedTodas.length > 0 && (
                    <View style={styles.recommendedSection}>
                      <View style={styles.recommendedHeaderRow}>
                        <Text style={styles.recommendedTitle}>📡 Nearest TODAs to You</Text>
                        <View style={styles.liveBadge}>
                          <View style={styles.liveDot} />
                          <Text style={styles.liveBadgeText}>LIVE</Text>
                        </View>
                      </View>
                      <Text style={styles.recommendedSubtitle}>Based on your current location — tap to select</Text>
                      <View style={styles.recommendedChipRow}>
                        {recommendedTodas.map((rec, i) => {
                          const isSelected  = selectedTodaName === rec.toda;
                          const rankColors  = ["#007AFF", "#34C759", "#FF9500"];
                          const rankEmojis  = ["🥇", "🥈", "🥉"];
                          const rankColor   = rankColors[i] ?? "#007AFF";
                          return (
                            <TouchableOpacity
                              key={rec.toda}
                              style={[styles.recommendedChip, isSelected ? { borderColor: rankColor, backgroundColor: rankColor + "15" } : { borderColor: "#E0E0E0" }]}
                              onPress={() => setSelectedTodaName(rec.toda)}
                              activeOpacity={0.75}
                            >
                              <View style={[styles.rankBadge, { backgroundColor: rankColor }]}>
                                <Text style={styles.rankEmoji}>{rankEmojis[i]}</Text>
                              </View>
                              <View style={styles.recommendedChipBody}>
                                <Text style={[styles.recommendedChipToda, isSelected && { color: rankColor }]} numberOfLines={1}>{rec.toda}</Text>
                                <Text style={styles.recommendedChipDesc} numberOfLines={1}>{rec.description}</Text>
                                <View style={styles.distancePill}>
                                  <Text style={[styles.distancePillText, { color: rankColor }]}>📍 {formatDistanceLabel(rec.distanceKm)}</Text>
                                </View>
                              </View>
                              {isSelected && (
                                <View style={[styles.selectedCheck, { backgroundColor: rankColor }]}>
                                  <Text style={styles.selectedCheckText}>✓</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Passenger Type */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>👤</Text>
                      <Text style={styles.label}>Passenger Type</Text>
                    </View>
                    <View style={styles.passengerTypeContainer}>
                      <TouchableOpacity style={[styles.passengerTypeButton, passengerType === "regular" && styles.passengerTypeButtonActive]} onPress={() => setPassengerType("regular")}>
                        <Text style={[styles.passengerTypeText, passengerType === "regular" && styles.passengerTypeTextActive]}>Regular</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.passengerTypeButton, passengerType === "senior_pwd" && styles.passengerTypeButtonActive]} onPress={() => setPassengerType("senior_pwd")}>
                        <Text style={[styles.passengerTypeText, passengerType === "senior_pwd" && styles.passengerTypeTextActive]}>Senior Citizen / PWD</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Companion Counter */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>👥</Text>
                      <Text style={styles.label}>Number of Kasama (Companions)</Text>
                    </View>
                    <View style={styles.companionRow}>
                      <TouchableOpacity style={[styles.companionBtn, companionCount === 0 && styles.companionBtnDisabled]} onPress={() => setCompanionCount((c) => Math.max(0, c - 1))} disabled={companionCount === 0}>
                        <Text style={styles.companionBtnText}>−</Text>
                      </TouchableOpacity>
                      <View style={styles.companionCountBox}>
                        <Text style={styles.companionCountNum}>{companionCount}</Text>
                        <Text style={styles.companionCountLabel}>{companionCount === 0 ? "Solo" : `${1 + companionCount} pax total`}</Text>
                      </View>
                      <TouchableOpacity style={[styles.companionBtn, companionCount >= MAX_TOTAL_PASSENGERS - 1 && styles.companionBtnDisabled]} onPress={() => setCompanionCount((c) => Math.min(MAX_TOTAL_PASSENGERS - 1, c + 1))} disabled={companionCount >= MAX_TOTAL_PASSENGERS - 1}>
                        <Text style={styles.companionBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    {companionCount > 0 && (
                      <View style={styles.companionNote}>
                        <Text style={styles.companionNoteText}>+{companionCount} kasama × 20% surcharge per companion</Text>
                      </View>
                    )}
                    <View style={styles.seatRow}>
                      {Array.from({ length: MAX_TOTAL_PASSENGERS }).map((_, i) => (
                        <View key={i} style={[styles.seatDot, i < 1 + companionCount ? styles.seatDotFilled : styles.seatDotEmpty]} />
                      ))}
                      <Text style={styles.seatLabel}>{1 + companionCount}/{MAX_TOTAL_PASSENGERS} seats</Text>
                    </View>
                  </View>

                  {/* TODA Picker */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>🚕</Text>
                      <Text style={styles.label}>Select TODA</Text>
                      {selectedTodaName && (
                        <View style={styles.selectedTodaBadge}>
                          <Text style={styles.selectedTodaBadgeText}>✓ Selected</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.pickerContainer}>
                      <Picker selectedValue={selectedTodaName} onValueChange={(v) => setSelectedTodaName(v)} style={styles.picker}>
                        <Picker.Item label="Choose a TODA..." value="" />
                        {todaNames.map((t, i) => <Picker.Item key={i} label={t} value={t} />)}
                      </Picker>
                    </View>
                  </View>

                  {/* Pickup */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>🟢</Text>
                      <Text style={styles.label}>Pickup Location (Current)</Text>
                    </View>
                    <View style={styles.readOnlyInput}>
                      <Text style={styles.readOnlyText}>{pickupLocation || "Getting current location..."}</Text>
                    </View>
                  </View>

                  {/* Dropoff */}
                  <View style={styles.inputContainer}>
                    <View style={styles.iconRow}>
                      <Text style={styles.icon}>🔴</Text>
                      <Text style={styles.label}>Dropoff Location</Text>
                      {dropoffLocation && !searchQuery && (
                        <TouchableOpacity
                          style={styles.clearLocationButton}
                          onPress={() => {
                            setDropoffLocation("");
                            setDropoffMarker(null);
                            setDistance(0);
                            setFare(0);
                            setRouteCoordinates([]);
                          }}
                        >
                          <Text style={styles.clearLocationText}>✕ Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    
                    {/* Show selected location or search input */}
                    {dropoffLocation && !searchQuery ? (
                      <View style={styles.selectedLocationBox}>
                        <Text style={styles.selectedLocationText}>{dropoffLocation}</Text>
                        <TouchableOpacity
                          style={styles.changeLocationButton}
                          onPress={() => {
                            setSearchQuery("");
                            setDropoffLocation("");
                            setDropoffMarker(null);
                          }}
                        >
                          <Text style={styles.changeLocationButtonText}>Change</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TextInput
                        style={styles.input}
                        placeholder="Search destination or tap map..."
                        value={searchQuery}
                        onChangeText={handleSearch}
                        onFocus={() => {
                          if (searchQuery.length > 0) setShowSearchResults(true);
                        }}
                      />
                    )}
                    
                    {showSearchResults && searchResults.length > 0 && (
                      <View style={styles.searchResults}>
                        <ScrollView 
                          nestedScrollEnabled 
                          style={styles.searchScroll} 
                          keyboardShouldPersistTaps="handled"
                        >
                          {searchResults.map((loc, i) => (
                            <TouchableOpacity 
                              key={i} 
                              style={styles.searchItem} 
                              onPress={() => handleSelectSearchResult(loc)}
                            >
                              <Text style={styles.searchIcon}>📍</Text>
                              <View style={styles.searchItemContent}>
                                <Text style={styles.searchItemText}>{loc.destination}</Text>
                                <Text style={styles.searchItemSubtext}>{loc.toda}</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {/* Only show Popular Destinations when there's no search query AND no location selected */}
                  {!dropoffLocation && !searchQuery && (
                    <View style={styles.popularContainer}>
                      <Text style={styles.popularTitle}>Popular Destinations:</Text>
                      <View style={styles.chipContainer}>
                        {FARE_MATRIX.slice(0, 12).map((loc, i) => (
                          <TouchableOpacity 
                            key={i} 
                            style={styles.chip} 
                            onPress={() => handleSelectSearchResult(loc)}
                          >
                            <Text style={styles.chipText}>{loc.destination}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Fare Summary */}
                  {distance > 0 && fare > 0 && (
                    <View style={styles.fareContainer}>
                      <View style={styles.fareRow}>
                        <Text style={styles.fareLabel}>Distance</Text>
                        <Text style={styles.fareValue}>{distance} km</Text>
                      </View>
                      <View style={styles.fareRow}>
                        <Text style={styles.fareLabel}>Passenger Type</Text>
                        <Text style={styles.fareValue}>{passengerType === "senior_pwd" ? "Senior/PWD" : "Regular"}</Text>
                      </View>
                      <View style={styles.fareRow}>
                        <Text style={styles.fareLabel}>Passengers</Text>
                        <Text style={styles.fareValue}>{1 + companionCount} pax {companionCount > 0 ? `(you + ${companionCount} kasama)` : "(solo)"}</Text>
                      </View>
                      {companionCount > 0 && (
                        <>
                          <View style={styles.fareRow}>
                            <Text style={styles.fareLabel}>Base Fare</Text>
                            <Text style={styles.fareValue}>₱{baseFareForDisplay.toFixed(2)}</Text>
                          </View>
                          <View style={styles.fareRow}>
                            <Text style={[styles.fareLabel, { color: "#FF9500" }]}>Companion Surcharge ({companionCount} × 20%)</Text>
                            <Text style={[styles.fareValue, { color: "#FF9500" }]}>+₱{surchargeAmount.toFixed(2)}</Text>
                          </View>
                        </>
                      )}
                      <View style={styles.divider} />
                      <View style={styles.fareRow}>
                        <Text style={styles.totalLabel}>Total Fare</Text>
                        <Text style={styles.totalValue}>₱{fare.toFixed(2)}</Text>
                      </View>
                      {passengerType === "senior_pwd" && (
                        <Text style={styles.discountNotice}>✨ Discounted fare applied for Senior Citizen/PWD</Text>
                      )}
                      {companionCount > 0 && (
                        <Text style={styles.companionFareNote}>👥 +20% per kasama applied ({companionCount} companion{companionCount > 1 ? "s" : ""})</Text>
                      )}
                    </View>
                  )}

                  <TouchableOpacity style={styles.bookButton} onPress={handleBookRide}>
                    <Text style={styles.bookButtonText}>Book Now</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        )}

        {/* Report Modal */}
        <Modal animationType="slide" transparent visible={showReportModal} onRequestClose={handleCloseReportModal}>
          <View style={styles.modalOverlay}>
            <View style={styles.reportModalContent}>
              <View style={styles.reportModalHeader}>
                <Text style={styles.reportModalTitle}>Report Driver</Text>
                <TouchableOpacity onPress={handleCloseReportModal}><Text style={styles.closeButton}>✕</Text></TouchableOpacity>
              </View>
              <ScrollView style={styles.reportModalBody}>
                {assignedDriver && (
                  <View style={styles.reportDriverInfo}>
                    <Text style={styles.reportDriverName}>{assignedDriver.firstName} {assignedDriver.lastName}</Text>
                    <Text style={styles.reportDriverDetails}>{assignedDriver.todaName} • {assignedDriver.licensePlate}</Text>
                  </View>
                )}
                <Text style={styles.reportSectionLabel}>Reason for Report *</Text>
                <View style={styles.reportReasonsContainer}>
                  {REPORT_REASONS.map((reason, i) => (
                    <TouchableOpacity key={i} style={[styles.reportReasonChip, selectedReportReason === reason && styles.reportReasonChipSelected]} onPress={() => setSelectedReportReason(reason)}>
                      <Text style={[styles.reportReasonText, selectedReportReason === reason && styles.reportReasonTextSelected]}>{reason}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.reportSectionLabel}>Additional Comments (Optional)</Text>
                <TextInput style={styles.reportCommentInput} placeholder="Please provide more details..." value={reportComment} onChangeText={setReportComment} multiline numberOfLines={4} textAlignVertical="top" />
                <Text style={styles.reportDisclaimer}>ℹ️ Your report will be reviewed by our team. All reports are kept confidential.</Text>
              </ScrollView>
              <View style={styles.reportModalFooter}>
                <TouchableOpacity style={styles.reportCancelButton} onPress={handleCloseReportModal}>
                  <Text style={styles.reportCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.reportSubmitButton, (!selectedReportReason || isSubmittingReport) && styles.reportSubmitButtonDisabled]} onPress={handleSubmitReport} disabled={!selectedReportReason || isSubmittingReport}>
                  <Text style={styles.reportSubmitButtonText}>{isSubmittingReport ? "Submitting..." : "Submit Report"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* History Modal */}
        <Modal animationType="slide" transparent visible={showHistoryModal} onRequestClose={() => setShowHistoryModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.historyModalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Ride History</Text>
                <TouchableOpacity onPress={() => setShowHistoryModal(false)}><Text style={styles.closeButton}>✕</Text></TouchableOpacity>
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
                        <TouchableOpacity key={ride.id} style={styles.historyItem} onPress={() => selectFromHistory(ride)}>
                          <View style={styles.historyItemHeader}>
                            <Text style={styles.historyTime}>{new Date(ride.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</Text>
                            <View style={styles.historyFareContainer}>
                              <Text style={styles.historyFare}>₱{ride.fare.toFixed(2)}</Text>
                              {ride.passengerType === "senior_pwd" && (
                                <Text style={styles.historyPassengerBadge}>PWD/Senior</Text>
                              )}
                              {(ride.companionCount ?? 0) > 0 && (
                                <Text style={styles.historyCompanionBadge}>👥 {1 + (ride.companionCount ?? 0)} pax</Text>
                              )}
                            </View>
                          </View>
                          <View style={styles.historyLocations}>
                            <View style={styles.historyLocationRow}>
                              <Text style={styles.historyLocationIcon}>🟢</Text>
                              <Text style={styles.historyLocationText} numberOfLines={1}>{ride.pickupLocation.name}</Text>
                            </View>
                            <View style={styles.historyLocationRow}>
                              <Text style={styles.historyLocationIcon}>🔴</Text>
                              <Text style={styles.historyLocationText} numberOfLines={1}>{ride.dropoffLocation.name}</Text>
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

        {/* Success / Error Modal */}
        <Modal animationType="fade" transparent visible={modalVisible} onRequestClose={handleModalClose}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={[styles.modalIconContainer, modalType === "success" ? styles.successIcon : styles.errorIcon]}>
                <Text style={styles.modalIcon}>{modalType === "success" ? "✓" : "✕"}</Text>
              </View>
              <Text style={styles.modalTitle}>{modalType === "success" ? "Success!" : "Error"}</Text>
              <Text style={styles.modalMessage}>{modalMessage}</Text>
              <TouchableOpacity style={[styles.modalButton, modalType === "success" ? styles.successButton : styles.errorButton]} onPress={handleModalClose}>
                <Text style={styles.modalButtonText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </View>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  userCardContainer: { position: "absolute", top: 60, left: 20, right: 20, flexDirection: "row", alignItems: "center", gap: 10, zIndex: 100 },
  userCard: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 25, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  emoji: { fontSize: 24, marginRight: 8 },
  userName: { fontSize: 18, fontWeight: "600", color: "#333" },
  profileButton: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 25, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5, borderWidth: 2, borderColor: "#007AFF" },
  profileIcon: { fontSize: 20 },
  logoutButton: { backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 25, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5, borderWidth: 2, borderColor: "#F44336" },
  logoutIcon: { fontSize: 20 },
  distanceCard: { position: "absolute", top: 140, left: 20, right: 20, backgroundColor: "#fff", padding: 20, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  distanceLabel: { fontSize: 14, color: "#666", marginBottom: 4 },
  distanceValue: { fontSize: 32, fontWeight: "bold", color: "#007AFF" },
  buttonContainer: { position: "absolute", bottom: 40, left: 20, right: 20, flexDirection: "row", gap: 12 },
  historyButton: { width: 60, backgroundColor: "#fff", paddingVertical: 18, borderRadius: 16, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8, borderWidth: 2, borderColor: "#007AFF" },
  historyButtonText: { fontSize: 24 },
  bookRideButton: { flex: 1, backgroundColor: "#007AFF", paddingVertical: 18, borderRadius: 16, alignItems: "center", shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  bookRideButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  confirmCompleteCard: { position: "absolute", bottom: 30, left: 20, right: 20, backgroundColor: "#fff", padding: 20, borderRadius: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 12, borderWidth: 2.5, borderColor: "#28a745" },
  confirmCompleteHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  confirmCompleteIcon: { fontSize: 32, marginRight: 10 },
  confirmCompleteTitle: { fontSize: 22, fontWeight: "bold", color: "#28a745" },
  confirmCompleteSubtext: { fontSize: 14, color: "#555", textAlign: "center", marginBottom: 16, lineHeight: 20 },
  confirmFareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f0fdf4", padding: 14, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: "#d1fae5" },
  confirmFareLabel: { fontSize: 15, color: "#555", fontWeight: "600" },
  confirmFareValue: { fontSize: 24, fontWeight: "bold", color: "#28a745" },
  confirmCompleteButton: { backgroundColor: "#28a745", paddingVertical: 16, borderRadius: 14, alignItems: "center", shadowColor: "#28a745", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 8, marginBottom: 10 },
  confirmCompleteButtonText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  confirmCompleteNote: { fontSize: 12, color: "#999", textAlign: "center", fontStyle: "italic" },
  driverCard: { position: "absolute", bottom: 40, left: 20, right: 20, backgroundColor: "#fff", padding: 20, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8, borderWidth: 2, borderColor: "#28a745" },
  driverCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  driverCardIcon: { fontSize: 24, marginRight: 8 },
  driverCardTitle: { fontSize: 18, fontWeight: "bold", color: "#28a745" },
  waitingCard: { position: "absolute", bottom: 40, left: 20, right: 20, backgroundColor: "#fff", padding: 20, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8, borderWidth: 2, borderColor: "#FFA500" },
  waitingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  waitingIcon: { fontSize: 24, marginRight: 8 },
  waitingTitle: { fontSize: 18, fontWeight: "bold", color: "#333" },
  driverInfoContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f8f9fa", padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: "#e0e0e0" },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 4 },
  driverDetails: { fontSize: 14, color: "#666", marginTop: 2 },
driverActionButtons: { flexDirection: "row", gap: 10, marginLeft: 12 },
messageButton: { backgroundColor: "#007AFF", width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", shadowColor: "#007AFF", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
callButton: { backgroundColor: "#28a745", width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", shadowColor: "#28a745", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
actionIcon: { fontSize: 28 },
driverSubtext: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 16 },
waitingSubtext: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 16 },
actionButtonsRow: { flexDirection: "row", gap: 10 },
reportButton: { flex: 1, backgroundColor: "#FFA500", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
reportButtonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
cancelButton: { flex: 1, backgroundColor: "#F44336", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
cancelButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
cancelButtonDisabled: { flex: 1, backgroundColor: "#e0e0e0", paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "#ccc" },
cancelButtonDisabledText: { color: "#999", fontSize: 14, fontWeight: "600" },
cancelLockedNote: { fontSize: 11, color: "#999", textAlign: "center", marginTop: 8, fontStyle: "italic" },
recommendedSection: { marginBottom: 20, backgroundColor: "#F0F7FF", borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: "#B3D4FF" },
recommendedHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
recommendedTitle: { fontSize: 15, fontWeight: "700", color: "#1A1A2E" },
liveBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#E8FFF0", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: "#34C759", gap: 4 },
liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#34C759" },
liveBadgeText: { fontSize: 10, fontWeight: "700", color: "#34C759", letterSpacing: 0.5 },
recommendedSubtitle: { fontSize: 12, color: "#666", marginBottom: 14 },
recommendedChipRow: { gap: 10 },
recommendedChip: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, borderWidth: 2, paddingVertical: 12, paddingHorizontal: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, gap: 10 },
rankBadge: { width: 34, height: 34, borderRadius: 17, justifyContent: "center", alignItems: "center" },
rankEmoji: { fontSize: 16 },
recommendedChipBody: { flex: 1 },
recommendedChipToda: { fontSize: 14, fontWeight: "700", color: "#1A1A2E", marginBottom: 1 },
recommendedChipDesc: { fontSize: 12, color: "#888", marginBottom: 4 },
distancePill: { alignSelf: "flex-start", backgroundColor: "#F5F5F5", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
distancePillText: { fontSize: 11, fontWeight: "600" },
selectedCheck: { width: 24, height: 24, borderRadius: 12, justifyContent: "center", alignItems: "center" },
selectedCheckText: { color: "#fff", fontSize: 13, fontWeight: "700" },
selectedTodaBadge: { marginLeft: 8, backgroundColor: "#E8FFF0", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: "#34C759" },
selectedTodaBadgeText: { fontSize: 11, color: "#34C759", fontWeight: "600" },
companionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#f8f9fa", borderRadius: 16, borderWidth: 1, borderColor: "#e0e0e0", padding: 8, marginBottom: 8 },
companionBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#007AFF", justifyContent: "center", alignItems: "center", shadowColor: "#007AFF", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 },
companionBtnDisabled: { backgroundColor: "#c8c8c8", shadowOpacity: 0 },
companionBtnText: { fontSize: 26, color: "#fff", fontWeight: "700", lineHeight: 30 },
companionCountBox: { alignItems: "center", flex: 1 },
companionCountNum: { fontSize: 36, fontWeight: "800", color: "#007AFF", lineHeight: 42 },
companionCountLabel: { fontSize: 13, color: "#666", fontWeight: "500" },
companionNote: { backgroundColor: "#FFF8EC", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#FFD580", marginBottom: 10 },
companionNoteText: { fontSize: 13, color: "#B8720A", fontWeight: "600", textAlign: "center" },
seatRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
seatDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
seatDotFilled: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
seatDotEmpty: { backgroundColor: "#fff", borderColor: "#c0c0c0" },
seatLabel: { fontSize: 12, color: "#888", marginLeft: 4 },
reportModalContent: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", width: "100%" },
reportModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
reportModalTitle: { fontSize: 24, fontWeight: "bold", color: "#333" },
reportModalBody: { padding: 20, maxHeight: "70%" },
reportDriverInfo: { backgroundColor: "#f8f9fa", padding: 16, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: "#e0e0e0" },
reportDriverName: { fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 4 },
reportDriverDetails: { fontSize: 14, color: "#666" },
reportSectionLabel: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 12, marginTop: 8 },
reportReasonsContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
reportReasonChip: { backgroundColor: "#f0f0f0", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 2, borderColor: "#e0e0e0" },
reportReasonChipSelected: { backgroundColor: "#FFA500", borderColor: "#FFA500" },
reportReasonText: { fontSize: 14, color: "#666", fontWeight: "500" },
reportReasonTextSelected: { color: "#fff", fontWeight: "600" },
reportCommentInput: { borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 12, padding: 16, fontSize: 16, minHeight: 100, backgroundColor: "#fff", marginBottom: 16 },
reportDisclaimer: { fontSize: 13, color: "#999", fontStyle: "italic", textAlign: "center", paddingHorizontal: 10 },
reportModalFooter: { flexDirection: "row", gap: 10, padding: 20, borderTopWidth: 1, borderTopColor: "#e0e0e0" },
reportCancelButton: { flex: 1, backgroundColor: "#f0f0f0", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
reportCancelButtonText: { fontSize: 16, fontWeight: "600", color: "#666" },
reportSubmitButton: { flex: 1, backgroundColor: "#FFA500", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
reportSubmitButtonDisabled: { backgroundColor: "#ccc" },
reportSubmitButtonText: { fontSize: 16, fontWeight: "600", color: "#fff" },
overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "flex-end", zIndex: 1000 },
backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)" },
keyboardAvoid: { width: "100%" },
formContainer: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 30, paddingTop: 10, maxHeight: "90%", shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 20 },
scrollContent: { flexGrow: 1 },
handleBar: { width: 40, height: 5, backgroundColor: "#ddd", borderRadius: 3, alignSelf: "center", marginTop: 12, marginBottom: 20 },
title: { fontSize: 24, fontWeight: "bold", color: "#333", marginBottom: 12 },
instructionText: { fontSize: 14, color: "#007AFF", backgroundColor: "#e7f3ff", padding: 12, borderRadius: 8, marginBottom: 20, textAlign: "center" },
inputContainer: { marginBottom: 20 },
iconRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
icon: { fontSize: 16, marginRight: 8 },
label: { fontSize: 14, fontWeight: "600", color: "#666" },
passengerTypeContainer: { flexDirection: "row", gap: 10 },
passengerTypeButton: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, borderColor: "#e0e0e0", backgroundColor: "#fff", alignItems: "center" },
passengerTypeButtonActive: { borderColor: "#007AFF", backgroundColor: "#e7f3ff" },
passengerTypeText: { fontSize: 14, fontWeight: "600", color: "#666", textAlign: "center" },
passengerTypeTextActive: { color: "#007AFF" },
pickerContainer: { borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 12, backgroundColor: "#fff", overflow: "hidden" },
picker: { height: 50 },
input: { height: 50, borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 12, paddingHorizontal: 16, fontSize: 16, backgroundColor: "#fff" },
readOnlyInput: { minHeight: 50, borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#f9f9f9", justifyContent: "center" },
readOnlyText: { fontSize: 16, color: "#333" },
selectedLocationBox: {
backgroundColor: '#f0f8ff',
borderWidth: 2,
borderColor: '#007AFF',
borderRadius: 12,
padding: 16,
flexDirection: 'row',
justifyContent: 'space-between',
alignItems: 'center',
},
selectedLocationText: {
flex: 1,
fontSize: 16,
color: '#333',
fontWeight: '500',
marginRight: 12,
},
changeLocationButton: {
backgroundColor: '#007AFF',
paddingHorizontal: 16,
paddingVertical: 8,
borderRadius: 8,
},
changeLocationButtonText: {
color: '#fff',
fontSize: 14,
fontWeight: '600',
},
clearLocationButton: {
marginLeft: 'auto',
backgroundColor: '#f44336',
paddingHorizontal: 10,
paddingVertical: 4,
borderRadius: 12,
},
clearLocationText: {
color: '#fff',
fontSize: 12,
fontWeight: '600',
},
searchResults: { marginTop: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e0e0e0", borderRadius: 12, maxHeight: 200, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
searchScroll: { maxHeight: 200 },
searchItem: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
searchIcon: { fontSize: 18, marginRight: 12 },
searchItemContent: { flex: 1 },
searchItemText: { fontSize: 16, color: "#333", fontWeight: "600" },
searchItemSubtext: { fontSize: 12, color: "#999", marginTop: 2 },
popularContainer: { marginBottom: 20 },
popularTitle: { fontSize: 14, fontWeight: "600", color: "#666", marginBottom: 12 },
chipContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
chip: { backgroundColor: "#e7f3ff", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#007AFF" },
chipText: { color: "#007AFF", fontSize: 13, fontWeight: "500" },
fareContainer: { backgroundColor: "#f0f8ff", borderRadius: 12, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#007AFF" },
fareRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
fareLabel: { fontSize: 14, color: "#666" },
fareValue: { fontSize: 14, fontWeight: "600", color: "#333" },
divider: { height: 1, backgroundColor: "#007AFF", marginVertical: 8, opacity: 0.3 },
totalLabel: { fontSize: 16, fontWeight: "bold", color: "#333" },
totalValue: { fontSize: 20, fontWeight: "bold", color: "#007AFF" },
discountNotice: { fontSize: 12, color: "#28a745", textAlign: "center", marginTop: 8, fontWeight: "600" },
companionFareNote: { fontSize: 12, color: "#FF9500", textAlign: "center", marginTop: 4, fontWeight: "600" },
historyModalContent: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", paddingBottom: 20 },
modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
modalTitle: { fontSize: 24, fontWeight: "bold", color: "#333" },
closeButton: { fontSize: 28, color: "#999" },
historyList: { padding: 20 },
emptyHistoryState: { alignItems: "center", paddingVertical: 60 },
emptyHistoryEmoji: { fontSize: 64, marginBottom: 16 },
emptyHistoryText: { fontSize: 18, fontWeight: "600", color: "#666", marginBottom: 8 },
emptyHistorySubtext: { fontSize: 14, color: "#999" },
historyDateGroup: { marginBottom: 24 },
historyDateHeader: { fontSize: 16, fontWeight: "bold", color: "#333", marginBottom: 12, paddingLeft: 4 },
historyItem: { backgroundColor: "#f8f9fa", borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: "#e0e0e0" },
historyItemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
historyTime: { fontSize: 14, color: "#666", fontWeight: "500" },
historyFareContainer: { alignItems: "flex-end" },
historyFare: { fontSize: 18, fontWeight: "bold", color: "#28a745" },
historyPassengerBadge: { fontSize: 10, color: "#007AFF", backgroundColor: "#e7f3ff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 2, fontWeight: "600" },
historyCompanionBadge: { fontSize: 10, color: "#FF9500", backgroundColor: "#FFF3E0", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginTop: 2, fontWeight: "600" },
historyLocations: { marginBottom: 8 },
historyLocationRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
historyLocationIcon: { fontSize: 14, marginRight: 8 },
historyLocationText: { flex: 1, fontSize: 14, color: "#333" },
historyDistance: { fontSize: 12, color: "#999", marginTop: 4 },
modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end", alignItems: "center" },
modalContent: { backgroundColor: "#fff", borderRadius: 16, padding: 24, width: "80%", alignItems: "center", marginBottom: "50%" },
modalIconContainer: { width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center", marginBottom: 16 },
successIcon: { backgroundColor: "#4CAF50" },
errorIcon: { backgroundColor: "#F44336" },
modalIcon: { fontSize: 32, color: "#fff", fontWeight: "bold" },
modalMessage: { fontSize: 16, textAlign: "center", color: "#666", marginBottom: 24 },
modalButton: { width: "100%", height: 50, borderRadius: 8, justifyContent: "center", alignItems: "center" },
successButton: { backgroundColor: "#4CAF50" },
errorButton: { backgroundColor: "#F44336" },
modalButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
bookaride: { width: "100%", height: "100%" },
bookButton: { height: 56, backgroundColor: "#007AFF", borderRadius: 12, justifyContent: "center", alignItems: "center", shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8, marginTop: 10 },
bookButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
