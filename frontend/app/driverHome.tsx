import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps"; // ✅ PROVIDER_GOOGLE restored

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationData {
  name: string;
  latitude: number;
  longitude: number;
}

interface Ride {
  _id: string;
  userId:
    | string
    | {
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
  driver?: any;
  assignmentType?: "self" | "auto" | "manual";
  createdAt: string;
  completedAt?: string;
}

interface Driver {
  id: string;
  firstname: string;
  lastname: string;
  todaName: string;
  plateNumber?: string;
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

interface QueueEntry {
  _id: string;
  queuePosition: number;
  status: "available" | "assigned" | "on-trip" | "offline";
  joinedAt: string;
  totalTripsToday: number;
  totalEarningsToday: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  ACTIVE_RIDE: "@driver_active_ride",
  RIDE_PHASE: "@driver_ride_phase",
  LAST_READ_MESSAGE: "@driver_last_read_message",
  QUEUE_ENTRY: "@driver_queue_entry",
};

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5000";
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:5000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const matchesDriver = (driver: any, driverId: string): boolean => {
  if (!driver) return false;
  if (typeof driver === "string") return driver === driverId;
  if (typeof driver === "object") {
    return (
      driver._id === driverId ||
      driver._id?.toString() === driverId ||
      driver.toString() === driverId
    );
  }
  return false;
};

const getCodingDigitsForDay = (dayOfWeek: number): number[] => {
  switch (dayOfWeek) {
    case 1: return [1, 2];
    case 2: return [3, 4];
    case 3: return [5, 6];
    case 4: return [7, 8];
    case 5: return [9, 0];
    default: return [];
  }
};

const getDayName = (d: number) =>
  ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d];

const isTricycleCoded = (plate?: string): boolean => {
  if (!plate) return false;
  const day = new Date().getDay();
  if (day === 0 || day === 6) return false;
  const last = parseInt(plate.trim().slice(-1), 10);
  return !isNaN(last) && getCodingDigitsForDay(day).includes(last);
};

const getCodingInfo = () => {
  const day = new Date().getDay();
  return {
    dayName: getDayName(day),
    codingDigits: getCodingDigitsForDay(day),
    isWeekend: day === 0 || day === 6,
  };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DriverHome() {
  const router = useRouter();

  // Dynamically import socket.io-client to avoid issues during SSR/init
  const { io, Socket } = require("socket.io-client");

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
  const [isCoded, setIsCoded] = useState(false);
  const [isRideCardMinimized, setIsRideCardMinimized] = useState(false);
  const [isAwaitingPassengerConfirmation, setIsAwaitingPassengerConfirmation] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [passengerInfo, setPassengerInfo] = useState<User | null>(null);
  const [isLoadingPassengerInfo, setIsLoadingPassengerInfo] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationWithHeading | null>(null);
  const [mapRegion, setMapRegion] = useState({
    latitude: 14.8847,
    longitude: 120.8572,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });
  const [routeCoordinates, setRouteCoordinates] = useState<
    { latitude: number; longitude: number }[]
  >([]);

  // Queue state
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [isQueueLoading, setIsQueueLoading] = useState(false);
  const isInQueue = queueEntry !== null && queueEntry.status !== "offline";

  const mapRef = useRef<MapView>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const headingSubscription = useRef<Location.LocationSubscription | null>(null);
  const lastHeading = useRef<number>(0);
  const isNavigating = useRef<boolean>(false);
  const socketRef = useRef<any>(null);
  const activeRideRef = useRef<Ride | null>(null);
  const driverRef = useRef<Driver | null>(null);
  const currentLocationRef = useRef<LocationWithHeading | null>(null);
  const handleAcceptRideRef = useRef<((ride: Ride) => Promise<void>) | null>(null);

  useEffect(() => { activeRideRef.current = activeRide; }, [activeRide]);
  useEffect(() => { driverRef.current = driver; }, [driver]);
  useEffect(() => { currentLocationRef.current = currentLocation; }, [currentLocation]);

  // ─── Map helpers ──────────────────────────────────────────────────────────

  const updateMapCamera = useCallback((loc: LocationWithHeading) => {
    mapRef.current?.animateCamera(
      {
        center: { latitude: loc.latitude, longitude: loc.longitude },
        zoom: 17,
        heading: loc.heading || lastHeading.current || 0,
        pitch: 45,
      },
      { duration: 500 }
    );
  }, []);

  const fitMapToRoute = useCallback(
    (coords: { latitude: number; longitude: number }[]) => {
      if (!mapRef.current || coords.length < 2) return;
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 50, bottom: 280, left: 50 },
        animated: true,
      });
    },
    []
  );

  const fitMapToMarkers = useCallback((start: LocationData, end: LocationData) => {
    setMapRegion({
      latitude: (start.latitude + end.latitude) / 2,
      longitude: (start.longitude + end.longitude) / 2,
      latitudeDelta: Math.max(Math.abs(start.latitude - end.latitude) * 2, 0.02),
      longitudeDelta: Math.max(Math.abs(start.longitude - end.longitude) * 2, 0.02),
    });
  }, []);

  const getDirections = useCallback(
    async (
      origin: LocationData,
      destination: LocationData,
      fitAfter = false
    ): Promise<{ latitude: number; longitude: number }[]> => {
      try {
        const url =
          `https://router.project-osrm.org/route/v1/driving/` +
          `${origin.longitude},${origin.latitude};` +
          `${destination.longitude},${destination.latitude}` +
          `?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();

        let coords: { latitude: number; longitude: number }[];
        if (data.code === "Ok" && data.routes?.length > 0) {
          coords = data.routes[0].geometry.coordinates.map((c: number[]) => ({
            latitude: c[1],
            longitude: c[0],
          }));
        } else {
          coords = [
            { latitude: origin.latitude, longitude: origin.longitude },
            { latitude: destination.latitude, longitude: destination.longitude },
          ];
        }

        setRouteCoordinates(coords);
        if (fitAfter) {
          setTimeout(() => fitMapToRoute(coords), 300);
        }
        return coords;
      } catch {
        const fallback = [
          { latitude: origin.latitude, longitude: origin.longitude },
          { latitude: destination.latitude, longitude: destination.longitude },
        ];
        setRouteCoordinates(fallback);
        if (fitAfter) setTimeout(() => fitMapToRoute(fallback), 300);
        return fallback;
      }
    },
    [fitMapToRoute]
  );

  const navigateTo = useCallback(
    async (destination: LocationData) => {
      const loc = currentLocationRef.current;
      if (!loc) return;
      await getDirections(
        { name: "Current", latitude: loc.latitude, longitude: loc.longitude },
        destination,
        true
      );
    },
    [getDirections]
  );

  // ─── handleAcceptRide ─────────────────────────────────────────────────────

  const handleAcceptRide = useCallback(
    async (ride: Ride) => {
      const d = driverRef.current;
      if (!d) { Alert.alert("Error", "Driver information not loaded"); return; }
      if (isCoded) {
        const ci = getCodingInfo();
        Alert.alert(
          "⚠️ Cannot Accept Ride",
          `Your tricycle is coded today (${ci.dayName}).\n\nCoded digits: ${ci.codingDigits.join(", ")}`
        );
        return;
      }
      try {
        const [statusRes, driverRes] = await Promise.all([
          fetch(`${API_URL}/api/rides/${ride._id}/status`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "accepted" }),
          }),
          fetch(`${API_URL}/api/rides/${ride._id}/driver`, {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ driver: d.id }),
          }),
        ]);

        if (statusRes.ok && driverRes.ok) {
          setActiveRide(ride);
          setRidePhase("to-pickup");
          setShowRidesList(false);
          setIsRideCardMinimized(false);
          await navigateTo(ride.pickupLocation);
          Alert.alert("Ride Accepted", "Navigate to pickup location");
        } else {
          Alert.alert("Error", "Failed to accept ride");
        }
      } catch {
        Alert.alert("Error", "Failed to accept ride");
      }
    },
    [isCoded, navigateTo]
  );

  useEffect(() => {
    handleAcceptRideRef.current = handleAcceptRide;
  }, [handleAcceptRide]);

  // ─── activateDispatcherRide ───────────────────────────────────────────────

  const activateDispatcherRide = useCallback(
    async (ride: Ride) => {
      if (activeRideRef.current) return;
      setActiveRide(ride);
      setRidePhase("to-pickup");
      setShowRidesList(false);
      setIsRideCardMinimized(false);
      await navigateTo(ride.pickupLocation);
    },
    [navigateTo]
  );

  // ─── Dispatcher-assignment poller ────────────────────────────────────────

  useEffect(() => {
    if (activeRide || !driver?.id) return;
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/api/rides`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!data.success) return;
        const rides: Ride[] = data.rides ?? [];
        const acceptedRide = rides.find(
          (r) => r.status === "accepted" && matchesDriver(r.driver, driver.id)
        );
        const pendingAssigned = rides.find(
          (r) => r.status === "pending" && r.driver && matchesDriver(r.driver, driver.id)
        );
        const target = acceptedRide ?? pendingAssigned;
        if (target && !activeRideRef.current) {
          if (target.status === "pending") {
            await handleAcceptRideRef.current?.(target);
          } else {
            await activateDispatcherRide(target);
          }
        }
      } catch {}
    };
    const interval = setInterval(poll, 4000);
    poll();
    return () => clearInterval(interval);
  }, [driver?.id, activeRide, activateDispatcherRide]);

  // ─── Queue helpers ────────────────────────────────────────────────────────

  const fetchQueueStatus = useCallback(async () => {
    const d = driverRef.current;
    if (!d?.id) return;
    try {
      const res = await fetch(`${API_URL}/api/dispatcher/queue/driver/${d.id}`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success && data.entry) {
        setQueueEntry(data.entry);
        await AsyncStorage.setItem(STORAGE_KEYS.QUEUE_ENTRY, JSON.stringify(data.entry));
      } else {
        setQueueEntry(null);
        await AsyncStorage.removeItem(STORAGE_KEYS.QUEUE_ENTRY);
      }
    } catch (error) {
      console.error("Error fetching queue status:", error);
    }
  }, []);

  const handleJoinQueue = async () => {
    if (!driver) return;
    if (isCoded) {
      const ci = getCodingInfo();
      Alert.alert("⚠️ Coded Today", `Your tricycle is coded today (${ci.dayName}). You cannot join the queue.`);
      return;
    }
    Alert.alert(
      "🚦 Join Dispatcher Queue?",
      `You will be added to the ${driver.todaName} queue.\n\nThe dispatcher will assign rides to you based on your queue position.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Join Queue",
          onPress: async () => {
            setIsQueueLoading(true);
            try {
              const res = await fetch(`${API_URL}/api/dispatcher/queue/join`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  driverId: driver.id,
                  firstname: driver.firstname,
                  lastname: driver.lastname,
                  plateNumber: driver.plateNumber || "",
                  todaName: driver.todaName,
                }),
              });
              const data = await res.json();
              if (data.success && data.entry) {
                setQueueEntry(data.entry);
                await AsyncStorage.setItem(STORAGE_KEYS.QUEUE_ENTRY, JSON.stringify(data.entry));
                Alert.alert(
                  "✅ Joined Queue",
                  `You are now #${data.entry.queuePosition} in the ${driver.todaName} queue.\n\nWait for the dispatcher to assign you a ride.`
                );
              } else {
                Alert.alert("Error", data.message || "Failed to join queue.");
              }
            } catch {
              Alert.alert("Error", "Network error. Please try again.");
            } finally {
              setIsQueueLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleLeaveQueue = async () => {
    if (!queueEntry) return;
    Alert.alert(
      "🚪 Leave Queue?",
      "You will be removed from the dispatcher queue. You can rejoin anytime.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave Queue",
          style: "destructive",
          onPress: async () => {
            setIsQueueLoading(true);
            try {
              const res = await fetch(`${API_URL}/api/dispatcher/queue/${queueEntry._id}`, {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
              });
              if (res.ok) {
                setQueueEntry(null);
                await AsyncStorage.removeItem(STORAGE_KEYS.QUEUE_ENTRY);
                Alert.alert("Left Queue", "You have been removed from the dispatcher queue.");
              } else {
                Alert.alert("Error", "Failed to leave queue.");
              }
            } catch {
              Alert.alert("Error", "Network error. Please try again.");
            } finally {
              setIsQueueLoading(false);
            }
          },
        },
      ]
    );
  };

  const getQueueStatusColor = () => {
    if (!isInQueue) return "#999";
    switch (queueEntry?.status) {
      case "available": return "#28a745";
      case "assigned":  return "#fd7e14";
      case "on-trip":   return "#007AFF";
      default:          return "#999";
    }
  };

  const getQueueStatusLabel = () => {
    if (!isInQueue) return "Not in Queue";
    switch (queueEntry?.status) {
      case "available": return `In Queue  •  #${queueEntry.queuePosition}`;
      case "assigned":  return `Assigned  •  #${queueEntry.queuePosition}`;
      case "on-trip":   return `On Trip  •  #${queueEntry.queuePosition}`;
      default:          return "Offline";
    }
  };

  // ─── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (driver?.plateNumber) {
      const coded = isTricycleCoded(driver.plateNumber);
      setIsCoded(coded);
      if (coded) {
        const ci = getCodingInfo();
        Alert.alert(
          "⚠️ Coding Day",
          `Your tricycle (ending in ${driver.plateNumber.slice(-1)}) is coded today (${ci.dayName}).\n\nCoded digits: ${ci.codingDigits.join(", ")}\n\nYou cannot accept rides today.`
        );
      }
    }
  }, [driver?.plateNumber]);

  // Socket init
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_URL, {
        autoConnect: false,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ["websocket", "polling"],
      });
    }
    return () => {
      if (socketRef.current?.connected) socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => { loadLastReadMessage(); }, []);

  const loadLastReadMessage = async () => {
    try {
      const id = await AsyncStorage.getItem(STORAGE_KEYS.LAST_READ_MESSAGE);
      if (id) setLastReadMessageId(id);
    } catch {}
  };

  // Socket listeners
  useEffect(() => {
    if (!socketRef.current || !driver?.id) return;
    const socket = socketRef.current;
    socket.removeAllListeners();

    socket.on("connect", () => {
      setSocketConnected(true);
      socket.emit("user-online", driver.id);
      console.log("✅ Socket connected:", driver.id);
    });
    socket.on("disconnect", () => setSocketConnected(false));
    socket.on("connect_error", (err: any) => {
      setSocketConnected(false);
      console.log("❌ Socket error:", err.message);
    });
    socket.on("reconnect", () => {
      socket.emit("user-online", driver.id);
    });

    socket.on("ride-assigned-by-dispatcher", (data: { rideId: string; ride: Ride }) => {
      const ride = data.ride;
      Alert.alert(
        "🚦 Ride Assigned by Dispatcher",
        `You have been assigned a new ride!\n\nPassenger: ${ride.firstname} ${ride.lastname}\nPickup: ${ride.pickupLocation.name}\nFare: ₱${ride.fare}`,
        [{ text: "Accept & Navigate", onPress: () => handleAcceptRideRef.current?.(ride) }]
      );
    });

    socket.on("queue-position-updated", (data: { entry: QueueEntry | null }) => {
      setQueueEntry(data.entry);
    });

    socket.on("receive-message", (messageData: any) => {
      const { message } = messageData;
      if (driver?.id && message.sender !== driver.id) {
        const isNew = !lastReadMessageId || message._id !== lastReadMessageId;
        if (isNew) {
          setHasUnreadMessages(true);
          setUnreadCount((prev) => prev + 1);
          Alert.alert(
            "💬 New Message",
            message.text || "You have a new message from a commuter",
            [
              { text: "View", onPress: () => handleMessagePassenger() },
              { text: "Later", style: "cancel" },
            ]
          );
        }
      }
    });

    if (!socket.connected) {
      socket.connect();
    } else {
      socket.emit("user-online", driver.id);
    }

    return () => { socket.removeAllListeners(); };
  }, [driver?.id, lastReadMessageId]);

  useEffect(() => {
    if (driver?.id) {
      fetchUnreadMessageCount();
      fetchQueueStatus();
    }
  }, [driver?.id, fetchQueueStatus]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.QUEUE_ENTRY)
      .then((saved) => { if (saved) setQueueEntry(JSON.parse(saved)); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isInQueue || !driver?.id) return;
    const interval = setInterval(fetchQueueStatus, 10000);
    return () => clearInterval(interval);
  }, [isInQueue, driver?.id, fetchQueueStatus]);

  const fetchUnreadMessageCount = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chat/unread-count`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const count = data.count || 0;
        setUnreadCount(count);
        setHasUnreadMessages(count > 0);
      }
    } catch {}
  };

  useEffect(() => {
    if (activeRide?.userId) {
      if (typeof activeRide.userId === "object" && "_id" in activeRide.userId) {
        setPassengerInfo({
          _id: activeRide.userId._id,
          firstName: activeRide.userId.firstName || activeRide.firstname,
          lastName: activeRide.userId.lastName || activeRide.lastname,
          phoneNumber: activeRide.userId.phoneNumber || "",
        });
        setIsLoadingPassengerInfo(false);
      } else if (typeof activeRide.userId === "string") {
        fetchPassengerInfo(activeRide.userId);
      }
    } else {
      setPassengerInfo(null);
    }
  }, [activeRide?.userId]);

  const fetchPassengerInfo = async (userId: string) => {
    setIsLoadingPassengerInfo(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/user/${userId}`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success && data.user) {
        setPassengerInfo({
          _id: data.user._id || data.user.id,
          firstName: data.user.firstName,
          lastName: data.user.lastName,
          phoneNumber: data.user.phoneNumber || "",
        });
      } else {
        setPassengerInfo(null);
      }
    } catch {
      setPassengerInfo(null);
    } finally {
      setIsLoadingPassengerInfo(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            if (socketRef.current?.connected) socketRef.current.disconnect();
            if (queueEntry) {
              await fetch(`${API_URL}/api/dispatcher/queue/${queueEntry._id}`, {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
              }).catch(() => {});
            }
            await Promise.all([
              AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_RIDE),
              AsyncStorage.removeItem(STORAGE_KEYS.RIDE_PHASE),
              AsyncStorage.removeItem(STORAGE_KEYS.LAST_READ_MESSAGE),
              AsyncStorage.removeItem(STORAGE_KEYS.QUEUE_ENTRY),
            ]);
            await fetch(`${API_URL}/api/auth/logout`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            });
            stopLocationTracking();
            router.replace("/");
          } catch {
            Alert.alert("Error", "Failed to logout. Please try again.");
          }
        },
      },
    ]);
  };

  const handleReset = async () => {
    try {
      console.log("reset");
      const res = await fetch(`${API_URL}/api/dispatcher/queue/driver/${driver?.id}/available`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
    } catch (error) {
      console.error("handleReset error:", error);
    }
  };

  // ─── Ride status poller ───────────────────────────────────────────────────

  useEffect(() => {
    if (!activeRide) return;
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/api/rides/${activeRide._id}`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!data.success || !data.ride) return;
        const status = data.ride.status;

        if (["accepted", "in-progress", "pending_confirmation"].includes(status)) {
          setActiveRide(data.ride);
        }

        if (status === "cancelled") {
          setActiveRide(null); setRidePhase(null); setPassengerInfo(null);
          setRouteCoordinates([]); setShowRidesList(true); setIsRideCardMinimized(false);
          setIsAwaitingPassengerConfirmation(false);
          const loc = currentLocationRef.current;
          if (loc && mapRef.current) {
            mapRef.current.animateCamera(
              { center: { latitude: loc.latitude, longitude: loc.longitude }, zoom: 15, heading: 0, pitch: 0 },
              { duration: 1000 }
            );
          }
          Alert.alert(
            "❌ Ride Cancelled",
            data.ride.cancelledReason || "The ride has been cancelled.",
            [{ text: "OK", onPress: () => fetchPendingRides() }]
          );
        }

        if (status === "completed" && isAwaitingPassengerConfirmation) {
          setActiveRide(null); setRidePhase(null); setPassengerInfo(null);
          setRouteCoordinates([]); setShowRidesList(true); setIsRideCardMinimized(false);
          setIsAwaitingPassengerConfirmation(false);
          const loc = currentLocationRef.current;
          if (loc && mapRef.current) {
            mapRef.current.animateCamera(
              { center: { latitude: loc.latitude, longitude: loc.longitude }, zoom: 15, heading: 0, pitch: 0 },
              { duration: 1000 }
            );
          }
          Alert.alert(
            "✅ Trip Completed!",
            `Passenger confirmed arrival.\nYou earned ₱${data.ride.fare}!`,
            [{ text: "OK", onPress: () => { fetchPendingRides(); fetchQueueStatus(); handleReset(); } }]
          );
        }
      } catch {}
    };
    const interval = setInterval(check, 3000);
    check();
    return () => clearInterval(interval);
  }, [activeRide, isAwaitingPassengerConfirmation]);

  // ─── Location ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isRestoringState && activeRide && ridePhase) {
      const dest =
        ridePhase === "to-pickup"
          ? activeRide.pickupLocation
          : activeRide.dropoffLocation;
      navigateTo(dest);
    }
  }, [isRestoringState]);

  useEffect(() => { startLocationTracking(); return () => stopLocationTracking(); }, []);
  useEffect(() => { isNavigating.current = !!(activeRide && ridePhase); }, [activeRide, ridePhase]);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.user) {
          const d: Driver = {
            id: data.user.id,
            firstname: data.user.firstName,
            lastname: data.user.lastName,
            todaName: data.user.todaName,
            plateNumber: data.user.plateNumber,
          };
          driverRef.current = d;
          setDriver(d);
          console.log("✅ Driver loaded:", d.firstname, d.lastname);
        } else {
          console.warn("⚠️ /api/auth/me returned no user:", data);
        }
      })
      .catch((e) => console.error("❌ Failed to load driver:", e));
  }, []);

  useEffect(() => { restorePersistedState(); }, []);

  const restorePersistedState = async () => {
    try {
      const [savedRide, savedPhase] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_RIDE),
        AsyncStorage.getItem(STORAGE_KEYS.RIDE_PHASE),
      ]);
      if (savedRide && savedPhase) {
        const ride: Ride = JSON.parse(savedRide);
        setActiveRide(ride);
        activeRideRef.current = ride;
        setRidePhase(savedPhase as "to-pickup" | "to-dropoff");
        setShowRidesList(false);
        if (ride.status === "pending_confirmation") setIsAwaitingPassengerConfirmation(true);
      }
    } catch {}
    finally { setIsRestoringState(false); }
  };

  useEffect(() => {
    if (isRestoringState) return;
    const persist = async () => {
      try {
        if (activeRide && ridePhase) {
          await Promise.all([
            AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_RIDE, JSON.stringify(activeRide)),
            AsyncStorage.setItem(STORAGE_KEYS.RIDE_PHASE, ridePhase),
          ]);
        } else {
          await Promise.all([
            AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_RIDE),
            AsyncStorage.removeItem(STORAGE_KEYS.RIDE_PHASE),
          ]);
        }
      } catch {}
    };
    persist();
  }, [activeRide, ridePhase, isRestoringState]);

  useEffect(() => {
    fetchPendingRides();
    const interval = setInterval(fetchPendingRides, 5000);
    return () => clearInterval(interval);
  }, [driver?.todaName]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  const fetchPendingRides = async () => {
    const d = driverRef.current;
    if (!d?.todaName) return;
    try {
      const res = await fetch(
        `${API_URL}/api/rides?status=pending&todaName=${encodeURIComponent(d.todaName)}`,
        { method: "GET", credentials: "include", headers: { "Content-Type": "application/json" } }
      );
      const data = await res.json();
      if (data.success) setPendingRides(data.rides);
    } catch {}
  };

  const fetchCompletedRides = async () => {
    try {
      const res = await fetch(`${API_URL}/api/rides?status=completed`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) setCompletedRides(data.rides);
    } catch {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPendingRides(), fetchQueueStatus()]);
    if (showHistory) await fetchCompletedRides();
    setRefreshing(false);
  };

  const handleRejectRide = async (rideId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/rides/${rideId}/cancel`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelledBy: "driver", cancelledReason: "Driver declined the ride" }),
      });
      if (res.ok) {
        Alert.alert("Ride Rejected", "Ride has been declined");
        fetchPendingRides();
      }
    } catch {}
  };

  const handlePickupComplete = () => {
    Alert.alert("Passenger Picked Up?", "Have you picked up the passenger?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes, Start Trip",
        onPress: async () => {
          setRidePhase("to-dropoff");
          if (driver?.id) {
            fetch(`${API_URL}/api/dispatcher/queue/driver/${driver.id}/on-trip`, {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            }).catch(() => {});
          }
          if (activeRide) await navigateTo(activeRide.dropoffLocation);
          Alert.alert("Trip Started", "Navigate to dropoff location");
        },
      },
    ]);
  };

  const handleDropoffComplete = async () => {
    if (!activeRide) return;
    Alert.alert(
      "Request Trip Completion?",
      "Has the passenger reached their destination? This will ask the passenger to confirm.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Request Confirmation",
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/api/rides/${activeRide._id}/status`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "pending_confirmation" }),
              });
              if (res.ok) {
                setIsAwaitingPassengerConfirmation(true);
                Alert.alert("⏳ Waiting for Passenger", "A confirmation request has been sent to the passenger.");
              }
            } catch {
              Alert.alert("Error", "Network error. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleCallPassenger = () => {
    if (!passengerInfo?.phoneNumber) {
      Alert.alert("Error", "Passenger phone number not available.");
      return;
    }
    Linking.openURL(`tel:${passengerInfo.phoneNumber.replace(/[^0-9+]/g, "")}`).catch(() => {
      Alert.alert("Error", "Unable to make call.");
    });
  };

  const handleMessagePassenger = async () => {
    if (!driver || !passengerInfo) {
      Alert.alert("Error", "Passenger information not available.");
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/chat/create-new-chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ members: [driver.id, passengerInfo._id] }),
      });
      const data = await res.json();
      if (data.success) {
        router.push({
          pathname: "/chat",
          params: {
            chatId: data.data._id,
            driverName: `${passengerInfo.firstName} ${passengerInfo.lastName}`,
            otherUserId: passengerInfo._id,
          },
        });
      } else {
        Alert.alert("Error", data.message || "Failed to start chat.");
      }
    } catch {
      Alert.alert("Error", "Unable to start chat.");
    }
  };

  const markMessagesAsRead = async (latestMessageId: string) => {
    setLastReadMessageId(latestMessageId);
    setHasUnreadMessages(false);
    setUnreadCount(0);
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_READ_MESSAGE, latestMessageId).catch(() => {});
  };

  // ─── Location tracking ────────────────────────────────────────────────────

  const startLocationTracking = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission is required");
        return;
      }
      try {
        await Location.requestBackgroundPermissionsAsync();
      } catch {
        console.log("Background location not available");
      }
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      const loc: LocationWithHeading = {
        latitude: initial.coords.latitude,
        longitude: initial.coords.longitude,
        heading: initial.coords.heading,
        speed: initial.coords.speed,
      };
      setCurrentLocation(loc);
      currentLocationRef.current = loc;
      lastHeading.current = initial.coords.heading || 0;
      if (!activeRideRef.current) {
        setMapRegion({
          latitude: loc.latitude,
          longitude: loc.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 5 },
        handleLocationUpdate
      );
      headingSubscription.current = await Location.watchHeadingAsync(handleHeadingUpdate);
    } catch (e) {
      console.error("Location tracking error:", e);
      Alert.alert("Error", "Unable to start location tracking");
    }
  };

  const stopLocationTracking = () => {
    locationSubscription.current?.remove(); locationSubscription.current = null;
    headingSubscription.current?.remove(); headingSubscription.current = null;
  };

  const handleLocationUpdate = (location: Location.LocationObject) => {
    const loc: LocationWithHeading = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      heading: location.coords.heading,
      speed: location.coords.speed,
    };
    setCurrentLocation(loc);
    currentLocationRef.current = loc;
    if (location.coords.heading != null) lastHeading.current = location.coords.heading;
    if (isNavigating.current && mapRef.current) updateMapCamera(loc);
  };

  const handleHeadingUpdate = (headingData: Location.LocationHeadingObject) => {
    const heading =
      headingData.trueHeading !== -1 ? headingData.trueHeading : headingData.magHeading;
    lastHeading.current = heading;
    setCurrentLocation((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, heading };
      currentLocationRef.current = updated;
      if (isNavigating.current && mapRef.current) updateMapCamera(updated);
      return updated;
    });
  };

  const centerOnUser = () => {
    const loc = currentLocationRef.current;
    if (!loc || !mapRef.current) return;
    if (isNavigating.current) {
      updateMapCamera(loc);
    } else {
      mapRef.current.animateCamera(
        { center: { latitude: loc.latitude, longitude: loc.longitude }, zoom: 15, heading: 0, pitch: 0 },
        { duration: 500 }
      );
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
    }
    if (ridePhase === "to-dropoff") {
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

  const getCarRotation = () =>
    currentLocation?.heading != null ? currentLocation.heading : lastHeading.current || 0;

  const openHistory = () => { fetchCompletedRides(); setShowHistory(true); };

  const getCodingStatusBanner = () => {
    const ci = getCodingInfo();
    if (ci.isWeekend) return { text: `${ci.dayName} - No Coding`, color: "#28a745", icon: "✅" };
    if (isCoded)
      return { text: `${ci.dayName} - CODED (Digits: ${ci.codingDigits.join(", ")})`, color: "#dc3545", icon: "🚫" };
    return { text: `${ci.dayName} - Not Coded (Digits: ${ci.codingDigits.join(", ")})`, color: "#28a745", icon: "✅" };
  };

  const groupRidesByDate = (rides: Ride[]) => {
    const grouped: GroupedRides = {};
    rides.forEach((ride) => {
      const d = new Date(ride.completedAt || ride.createdAt);
      const key =
        historyGrouping === "day"
          ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
          : historyGrouping === "month"
          ? d.toLocaleDateString("en-US", { year: "numeric", month: "long" })
          : d.getFullYear().toString();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(ride);
    });
    return grouped;
  };

  const calculateTotalEarnings = (rides: Ride[]) => rides.reduce((t, r) => t + r.fare, 0);

  const groupedRides = groupRidesByDate(completedRides);
  const sortedDates = Object.keys(groupedRides).sort((a, b) => {
    const da = new Date(groupedRides[a][0].completedAt || groupedRides[a][0].createdAt);
    const db = new Date(groupedRides[b][0].completedAt || groupedRides[b][0].createdAt);
    return db.getTime() - da.getTime();
  });

  const codingStatus = getCodingStatusBanner();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.container}>
        {/* ✅ Google Maps via PROVIDER_GOOGLE */}
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          region={mapRegion}
          showsUserLocation={false}
          showsMyLocationButton={false}
          rotateEnabled
          pitchEnabled
          zoomEnabled
          scrollEnabled
          mapType="standard"
        >
          {currentLocation && (
            <Marker
              coordinate={{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
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
                strokeColor="#000"
                strokeWidth={10}
                lineCap="round"
                lineJoin="round"
                geodesic
              />
              <Polyline
                coordinates={routeCoordinates}
                strokeColor="#4285F4"
                strokeWidth={6}
                lineCap="round"
                lineJoin="round"
                geodesic
              />
            </>
          )}
        </MapView>

        {/* Coding Banner */}
        <View style={[styles.codingBanner, { backgroundColor: codingStatus.color }]}>
          <Text style={styles.codingBannerText}>
            {codingStatus.icon} {codingStatus.text}
          </Text>
          {driver?.plateNumber && (
            <Text style={styles.codingBannerPlate}>Plate: {driver.plateNumber}</Text>
          )}
        </View>

        {/* Recenter */}
        <TouchableOpacity style={styles.recenterButton} onPress={centerOnUser}>
          <Text style={styles.recenterIcon}>🎯</Text>
        </TouchableOpacity>

        {/* Speed */}
        {isNavigating.current &&
          currentLocation?.speed != null &&
          currentLocation.speed >= 0 && (
            <View style={styles.speedIndicator}>
              <Text style={styles.speedText}>
                {Math.round(currentLocation.speed * 3.6)} km/h
              </Text>
            </View>
          )}

        {/* Driver info bar */}
        <View style={styles.driverCard}>
          <Text style={styles.emoji}>🚗</Text>
          <Text style={styles.driverName}>
            {driver ? `${driver.firstname} ${driver.lastname}` : "Loading..."}
          </Text>
          <TouchableOpacity style={styles.historyButton} onPress={openHistory}>
            <Text style={styles.historyButtonText}>📋</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.profileButton}
            onPress={() => router.push("/profile")}
            activeOpacity={0.8}
          >
            <Text style={styles.profileIcon}>👤</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutIcon}>🚪</Text>
          </TouchableOpacity>
        </View>

        {/* Queue Card */}
        {!activeRide && (
          <View style={styles.queueCard}>
            <View style={styles.queueCardLeft}>
              <Text style={styles.queueTodaLabel}>🏠 {driver?.todaName || "TODA"}</Text>
              <View style={[styles.queueStatusPill, { backgroundColor: getQueueStatusColor() }]}>
                {isQueueLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.queueStatusPillText}>{getQueueStatusLabel()}</Text>
                )}
              </View>
              {isInQueue && queueEntry && (
                <Text style={styles.queueStats}>
                  Trips today: {queueEntry.totalTripsToday}  ·  ₱{queueEntry.totalEarningsToday}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.queueToggleBtn,
                isInQueue ? styles.queueToggleBtnLeave : styles.queueToggleBtnJoin,
                (isQueueLoading || isCoded) && styles.queueToggleBtnDisabled,
              ]}
              onPress={isInQueue ? handleLeaveQueue : handleJoinQueue}
              disabled={isQueueLoading || isCoded}
              activeOpacity={0.8}
            >
              {isQueueLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.queueToggleBtnIcon}>{isInQueue ? "🔴" : "🟢"}</Text>
                  <Text style={styles.queueToggleBtnText}>{isInQueue ? "Leave" : "Join"}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Active Ride Card */}
        {activeRide && (
          <View style={[styles.activeRideCard, isRideCardMinimized && styles.activeRideCardMinimized]}>
            <View style={styles.activeRideCardHeader}>
              <Text style={styles.activeRideTitle}>
                {isAwaitingPassengerConfirmation
                  ? "⏳ Awaiting Passenger Confirmation"
                  : ridePhase === "to-pickup"
                  ? "📍 Going to Pickup"
                  : "🎯 Going to Dropoff"}
              </Text>
              <TouchableOpacity
                style={styles.minimizeButton}
                onPress={() => setIsRideCardMinimized((p) => !p)}
                activeOpacity={0.7}
              >
                <Text style={styles.minimizeButtonText}>
                  {isRideCardMinimized ? "▲" : "▼"}
                </Text>
              </TouchableOpacity>
            </View>

            {!isRideCardMinimized && (
              <>
                <Text style={styles.passengerName}>
                  Passenger: {activeRide.firstname} {activeRide.lastname}
                </Text>
                {isAwaitingPassengerConfirmation ? (
                  <View style={styles.awaitingConfirmationBox}>
                    <Text style={styles.awaitingConfirmationIcon}>📲</Text>
                    <Text style={styles.awaitingConfirmationText}>
                      Waiting for the passenger to confirm arrival.
                    </Text>
                    <Text style={styles.awaitingConfirmationSubtext}>
                      The trip will complete once they confirm.
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.destination}>
                    {ridePhase === "to-pickup"
                      ? activeRide.pickupLocation.name
                      : activeRide.dropoffLocation.name}
                  </Text>
                )}
                <Text style={styles.fareInfo}>Fare: ₱{activeRide.fare}</Text>

                <View style={styles.passengerInfoContainer}>
                  <View style={styles.passengerInfo}>
                    <Text style={styles.passengerInfoName}>
                      👤{" "}
                      {passengerInfo
                        ? `${passengerInfo.firstName} ${passengerInfo.lastName}`
                        : `${activeRide.firstname} ${activeRide.lastname}`}
                    </Text>
                    {passengerInfo?.phoneNumber ? (
                      <Text style={styles.passengerInfoPhone}>📞 {passengerInfo.phoneNumber}</Text>
                    ) : isLoadingPassengerInfo ? (
                      <Text style={styles.passengerInfoPhone}>Loading contact info...</Text>
                    ) : (
                      <Text style={styles.passengerInfoPhone}>Contact info not available</Text>
                    )}
                  </View>
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
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.callButton,
                        (!passengerInfo || !passengerInfo.phoneNumber) && styles.disabledButton,
                      ]}
                      onPress={handleCallPassenger}
                      disabled={!passengerInfo || !passengerInfo.phoneNumber}
                    >
                      <Text style={styles.actionIcon}>📞</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {!isAwaitingPassengerConfirmation && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={ridePhase === "to-pickup" ? handlePickupComplete : handleDropoffComplete}
                  >
                    <Text style={styles.actionButtonText}>
                      {ridePhase === "to-pickup"
                        ? "✓ Picked Up Passenger"
                        : "✓ Request Trip Completion"}
                    </Text>
                  </TouchableOpacity>
                )}
                {isAwaitingPassengerConfirmation && (
                  <View style={styles.waitingConfirmationButton}>
                    <Text style={styles.waitingConfirmationButtonText}>
                      ⏳ Waiting for passenger to confirm...
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Show Rides button */}
        {!activeRide && (
          <TouchableOpacity
            style={[styles.showRidesButton, isCoded && styles.showRidesButtonDisabled]}
            onPress={() => setShowRidesList(true)}
            disabled={isCoded}
          >
            <Text style={styles.showRidesButtonText}>
              {isCoded
                ? "🚫 Coded - Cannot Accept Rides"
                : `📋 Available Rides (${pendingRides.length})`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Pending Rides Modal */}
        <Modal
          animationType="slide"
          transparent
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
              {isCoded && (
                <View style={styles.codedWarning}>
                  <Text style={styles.codedWarningText}>
                    🚫 Your tricycle is coded today. You cannot accept rides.
                  </Text>
                </View>
              )}
              <ScrollView
                style={styles.ridesList}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              >
                {pendingRides.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateEmoji}>😴</Text>
                    <Text style={styles.emptyStateText}>No rides available</Text>
                    <Text style={styles.emptyStateSubtext}>Pull down to refresh</Text>
                  </View>
                ) : (
                  pendingRides.map((ride) => (
                    <View key={ride._id} style={[styles.rideCard, isCoded && styles.rideCardDisabled]}>
                      <View style={styles.rideHeader}>
                        <Text style={styles.passengerNameCard}>👤 {ride.firstname} {ride.lastname}</Text>
                        <Text style={styles.fareCard}>₱{ride.fare}</Text>
                      </View>
                      <View style={styles.locationInfo}>
                        <View style={styles.locationRow}>
                          <Text style={styles.locationIcon}>🟢</Text>
                          <Text style={styles.locationText} numberOfLines={2}>{ride.pickupLocation.name}</Text>
                        </View>
                        <View style={styles.locationRow}>
                          <Text style={styles.locationIcon}>🔴</Text>
                          <Text style={styles.locationText} numberOfLines={2}>{ride.dropoffLocation.name}</Text>
                        </View>
                      </View>
                      <View style={styles.rideDetails}>
                        <Text style={styles.detailText}>📏 {ride.distance} km</Text>
                        <Text style={styles.detailText}>🕐 {new Date(ride.createdAt).toLocaleTimeString()}</Text>
                      </View>
                      <View style={styles.rideActions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.acceptBtn, isCoded && styles.actionBtnDisabled]}
                          onPress={() => handleAcceptRide(ride)}
                          disabled={isCoded}
                        >
                          <Text style={styles.actionBtnText}>{isCoded ? "🚫 Coded" : "✓ Accept"}</Text>
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
          transparent
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
              <View style={styles.groupingControls}>
                {(["day", "month", "year"] as const).map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.groupingBtn, historyGrouping === g && styles.groupingBtnActive]}
                    onPress={() => setHistoryGrouping(g)}
                  >
                    <Text style={[styles.groupingBtnText, historyGrouping === g && styles.groupingBtnTextActive]}>
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <ScrollView
                style={styles.ridesList}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
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
                    return (
                      <View key={date} style={styles.historySection}>
                        <View style={styles.historySectionHeader}>
                          <Text style={styles.historySectionDate}>{date}</Text>
                          <View style={styles.historySectionStats}>
                            <Text style={styles.historySectionCount}>{ridesForDate.length} rides</Text>
                            <Text style={styles.historySectionEarnings}>₱{calculateTotalEarnings(ridesForDate).toFixed(2)}</Text>
                          </View>
                        </View>
                        {ridesForDate.map((ride) => (
                          <View key={ride._id} style={styles.historyRideCard}>
                            <View style={styles.historyRideHeader}>
                              <Text style={styles.historyPassengerName}>👤 {ride.firstname} {ride.lastname}</Text>
                              <Text style={styles.historyFare}>₱{ride.fare}</Text>
                            </View>
                            <View style={styles.historyLocationInfo}>
                              <View style={styles.locationRow}>
                                <Text style={styles.locationIcon}>🟢</Text>
                                <Text style={styles.historyLocationText} numberOfLines={1}>{ride.pickupLocation.name}</Text>
                              </View>
                              <View style={styles.locationRow}>
                                <Text style={styles.locationIcon}>🔴</Text>
                                <Text style={styles.historyLocationText} numberOfLines={1}>{ride.dropoffLocation.name}</Text>
                              </View>
                            </View>
                            <View style={styles.historyRideFooter}>
                              <Text style={styles.historyDetailText}>📏 {ride.distance} km</Text>
                              <Text style={styles.historyDetailText}>🕐 {new Date(ride.completedAt || ride.createdAt).toLocaleTimeString()}</Text>
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  driverMarker: { alignItems: "center", justifyContent: "center" },
  carIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: "white", borderRadius: 20, borderWidth: 3, borderColor: "#4285F4", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },
  carEmoji: { fontSize: 20 },
  accuracyCircle: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(66,133,244,0.1)", borderWidth: 1, borderColor: "rgba(66,133,244,0.3)" },
  codingBanner: { position: "absolute", top: 0, left: 0, right: 0, paddingVertical: 12, paddingHorizontal: 20, paddingTop: 50, alignItems: "center", zIndex: 1000 },
  codingBannerText: { color: "white", fontSize: 16, fontWeight: "bold", textAlign: "center" },
  codingBannerPlate: { color: "white", fontSize: 14, marginTop: 4, textAlign: "center" },
  recenterButton: { position: "absolute", bottom: 140, right: 20, width: 50, height: 50, backgroundColor: "white", borderRadius: 25, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 },
  recenterIcon: { fontSize: 24 },
  speedIndicator: { position: "absolute", top: 140, right: 20, backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  speedText: { color: "white", fontSize: 16, fontWeight: "bold" },
  driverCard: { position: "absolute", top: 110, left: 20, right: 20, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 25, flexDirection: "row", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5 },
  emoji: { fontSize: 24, marginRight: 8 },
  driverName: { fontSize: 16, fontWeight: "600", color: "#333", flex: 1 },
  historyButton: { paddingHorizontal: 8, paddingVertical: 4 },
  historyButtonText: { fontSize: 20 },
  profileButton: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", borderWidth: 2, borderColor: "#007AFF", alignItems: "center", justifyContent: "center" },
  profileIcon: { fontSize: 18 },
  logoutButton: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", borderWidth: 2, borderColor: "#F44336", alignItems: "center", justifyContent: "center" },
  logoutIcon: { fontSize: 18 },
  queueCard: { position: "absolute", top: 175, left: 20, right: 20, backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5, borderWidth: 1, borderColor: "#e8e8e8" },
  queueCardLeft: { flex: 1, marginRight: 12 },
  queueTodaLabel: { fontSize: 13, fontWeight: "700", color: "#333", marginBottom: 5 },
  queueStatusPill: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 4, minWidth: 100, alignItems: "center", justifyContent: "center" },
  queueStatusPillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  queueStats: { fontSize: 11, color: "#999", marginTop: 2 },
  queueToggleBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 20, minWidth: 90, justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3 },
  queueToggleBtnJoin: { backgroundColor: "#28a745" },
  queueToggleBtnLeave: { backgroundColor: "#dc3545" },
  queueToggleBtnDisabled: { backgroundColor: "#bbb", elevation: 0 },
  queueToggleBtnIcon: { fontSize: 14 },
  queueToggleBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  activeRideCard: { position: "absolute", bottom: 140, left: 20, right: 20, backgroundColor: "#fff", padding: 20, borderRadius: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 5, borderWidth: 2, borderColor: "#28a745" },
  activeRideCardMinimized: { bottom: 100, paddingVertical: 14 },
  activeRideCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  activeRideTitle: { fontSize: 16, fontWeight: "bold", color: "#28a745", flex: 1 },
  minimizeButton: { backgroundColor: "#f0f0f0", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 5, marginLeft: 8, borderWidth: 1, borderColor: "#ddd" },
  minimizeButtonText: { fontSize: 13, fontWeight: "700", color: "#555" },
  passengerName: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 4 },
  destination: { fontSize: 14, color: "#666", marginBottom: 8 },
  fareInfo: { fontSize: 16, fontWeight: "bold", color: "#007AFF", marginBottom: 12 },
  awaitingConfirmationBox: { backgroundColor: "#fff8e1", borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "#ffe082", alignItems: "center" },
  awaitingConfirmationIcon: { fontSize: 32, marginBottom: 6 },
  awaitingConfirmationText: { fontSize: 14, color: "#5d4037", fontWeight: "600", textAlign: "center", marginBottom: 4 },
  awaitingConfirmationSubtext: { fontSize: 12, color: "#8d6e63", textAlign: "center" },
  waitingConfirmationButton: { backgroundColor: "#f5f5f5", paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "#e0e0e0" },
  waitingConfirmationButtonText: { color: "#999", fontSize: 15, fontWeight: "600" },
  passengerInfoContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f8f9fa", padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: "#e0e0e0" },
  passengerInfo: { flex: 1 },
  passengerInfoName: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 4 },
  passengerInfoPhone: { fontSize: 14, color: "#666", marginTop: 2 },
  passengerActionButtons: { flexDirection: "row", gap: 10, marginLeft: 12 },
  messageButton: { backgroundColor: "#007AFF", width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  callButton: { backgroundColor: "#28a745", width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center" },
  disabledButton: { backgroundColor: "#ccc", opacity: 0.5 },
  actionIcon: { fontSize: 28 },
  notificationBadge: { position: "absolute", top: -4, right: -4, backgroundColor: "#FF3B30", borderRadius: 12, minWidth: 24, height: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, borderWidth: 2, borderColor: "white" },
  notificationText: { color: "white", fontSize: 12, fontWeight: "bold" },
  actionButton: { backgroundColor: "#28a745", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  actionButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  showRidesButton: { position: "absolute", bottom: 40, left: 20, right: 20, backgroundColor: "#007AFF", paddingVertical: 18, borderRadius: 16, alignItems: "center", shadowColor: "#007AFF", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  showRidesButtonDisabled: { backgroundColor: "#dc3545" },
  showRidesButtonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", paddingBottom: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  modalTitle: { fontSize: 24, fontWeight: "bold", color: "#333" },
  closeButton: { fontSize: 28, color: "#999" },
  codedWarning: { backgroundColor: "#fff3cd", padding: 16, marginHorizontal: 20, marginVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: "#ffc107" },
  codedWarningText: { color: "#856404", fontSize: 14, fontWeight: "600", textAlign: "center" },
  groupingControls: { flexDirection: "row", padding: 20, paddingBottom: 10, gap: 10 },
  groupingBtn: { flex: 1, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, backgroundColor: "#f0f0f0", alignItems: "center" },
  groupingBtnActive: { backgroundColor: "#007AFF" },
  groupingBtnText: { fontSize: 14, fontWeight: "600", color: "#666" },
  groupingBtnTextActive: { color: "#fff" },
  ridesList: { padding: 20 },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyStateEmoji: { fontSize: 64, marginBottom: 16 },
  emptyStateText: { fontSize: 18, fontWeight: "600", color: "#666", marginBottom: 8 },
  emptyStateSubtext: { fontSize: 14, color: "#999" },
  rideCard: { backgroundColor: "#f8f9fa", borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#e0e0e0" },
  rideCardDisabled: { opacity: 0.6, backgroundColor: "#f0f0f0" },
  rideHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  passengerNameCard: { fontSize: 18, fontWeight: "700", color: "#333" },
  fareCard: { fontSize: 20, fontWeight: "bold", color: "#28a745" },
  locationInfo: { marginBottom: 12 },
  locationRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  locationIcon: { fontSize: 16, marginRight: 8, marginTop: 2 },
  locationText: { flex: 1, fontSize: 14, color: "#666" },
  rideDetails: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#e0e0e0" },
  detailText: { fontSize: 14, color: "#666" },
  rideActions: { flexDirection: "row", justifyContent: "space-between" },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", marginHorizontal: 5 },
  acceptBtn: { backgroundColor: "#28a745" },
  actionBtnDisabled: { backgroundColor: "#999" },
  rejectBtn: { backgroundColor: "#dc3545" },
  actionBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  historySection: { marginBottom: 24 },
  historySectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: "#007AFF" },
  historySectionDate: { fontSize: 18, fontWeight: "bold", color: "#333" },
  historySectionStats: { alignItems: "flex-end" },
  historySectionCount: { fontSize: 14, color: "#666", marginBottom: 2 },
  historySectionEarnings: { fontSize: 18, fontWeight: "bold", color: "#28a745" },
  historyRideCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#e0e0e0" },
  historyRideHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  historyPassengerName: { fontSize: 16, fontWeight: "600", color: "#333" },
  historyFare: { fontSize: 16, fontWeight: "bold", color: "#28a745" },
  historyLocationInfo: { marginBottom: 10 },
  historyLocationText: { flex: 1, fontSize: 13, color: "#666" },
  historyRideFooter: { flexDirection: "row", justifyContent: "space-between", paddingTop: 10, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  historyDetailText: { fontSize: 12, color: "#999" },
});