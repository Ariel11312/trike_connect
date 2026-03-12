import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Alert,
  RefreshControl,
  TextInput,
} from "react-native";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, Stack } from "expo-router";
import { io, Socket } from "socket.io-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocationData {
  name: string;
  latitude: number;
  longitude: number;
}

interface PendingRide {
  _id: string;
  userId:
    | string
    | { _id: string; firstName: string; lastName: string; phoneNumber?: string };
  firstname: string;
  lastname: string;
  pickupLocation: LocationData;
  dropoffLocation: LocationData;
  distance: number;
  fare: number;
  status: string;
  createdAt: string;
  todaName: string;
}

interface QueuedDriver {
  _id: string;
  driverId: string;
  firstname: string;
  lastname: string;
  plateNumber: string;
  todaName: string;
  status: "available" | "assigned" | "on-trip" | "offline";
  queuePosition: number;
  joinedAt: string;
  currentRideId?: string;
  totalTripsToday: number;
  totalEarningsToday: number;
}

interface Dispatcher {
  id: string;
  firstName: string;
  lastName: string;
  todaName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL;

// ─── Component ────────────────────────────────────────────────────────────────

export default function DispatcherHome() {
  const router = useRouter();

  const [dispatcher, setDispatcher] = useState<Dispatcher | null>(null);
  const [pendingRides, setPendingRides] = useState<PendingRide[]>([]);
  const [driverQueue, setDriverQueue] = useState<QueuedDriver[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRide, setSelectedRide] = useState<PendingRide | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"rides" | "queue">("rides");
  const [socketConnected, setSocketConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [assigningRideId, setAssigningRideId] = useState<string | null>(null);

  // Ref so socket callbacks always read the latest todaName without stale closure
  const todaNameRef = useRef<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // ─── API helpers ──────────────────────────────────────────────────────────

  const fetchPendingRides = useCallback(async (todaName?: string) => {
    const name = todaName ?? todaNameRef.current;
    if (!name) return;
    try {
      const res = await fetch(
        `${API_URL}/api/rides?status=pending&todaName=${encodeURIComponent(name)}`,
        { method: "GET", credentials: "include", headers: { "Content-Type": "application/json" } }
      );
      const data = await res.json();
      if (data.success) setPendingRides(data.rides ?? []);
    } catch (error) {
      console.error("Error fetching pending rides:", error);
    }
  }, []);

  const fetchDriverQueue = useCallback(async (todaName?: string) => {
    const name = todaName ?? todaNameRef.current;
    if (!name) return;
    try {
      const res = await fetch(
        `${API_URL}/api/dispatcher/queue?todaName=${encodeURIComponent(name)}`,
        { method: "GET", credentials: "include", headers: { "Content-Type": "application/json" } }
      );
      const data = await res.json();
      if (data.success) setDriverQueue(data.queue ?? []);
    } catch (error) {
      console.error("Error fetching driver queue:", error);
    }
  }, []);

  // ─── Auth ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, {
      method: "GET",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.user) {
          const d: Dispatcher = {
            id: data.user.id,
            firstName: data.user.firstName,
            lastName: data.user.lastName,
            todaName: data.user.todaName,
          };
          // Update ref immediately so socket callbacks can use it before state propagates
          todaNameRef.current = d.todaName;
          setDispatcher(d);
          // Fetch immediately with known todaName instead of waiting for state update
          fetchPendingRides(d.todaName);
          fetchDriverQueue(d.todaName);
        }
      })
      .catch(console.error);
  }, [fetchPendingRides, fetchDriverQueue]);

  // Polling — only starts after dispatcher is loaded
  useEffect(() => {
    if (!dispatcher?.todaName) return;
    const interval = setInterval(() => {
      fetchPendingRides(dispatcher.todaName);
      fetchDriverQueue(dispatcher.todaName);
    }, 5000);
    return () => clearInterval(interval);
  }, [dispatcher?.todaName, fetchPendingRides, fetchDriverQueue]);

  // ─── Socket ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = io(SOCKET_URL!, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setSocketConnected(true));
    socket.on("disconnect", () => setSocketConnected(false));

    // Refresh rides list on new booking or cancellation
    socket.on("new-ride-request", () => fetchPendingRides());
    socket.on("ride-cancelled", () => fetchPendingRides());

    // FIX: use ref so this callback always has the current todaName,
    // even though the socket listener is only registered once
    socket.on("driver-queue-update", () => fetchDriverQueue());

    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [fetchPendingRides, fetchDriverQueue]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  /**
   * Manual assign: hits the single /api/dispatcher/queue/:id/assign endpoint
   * which atomically updates ride status, assigns the driver, updates the queue,
   * and emits ride-assigned-by-dispatcher to the driver's socket room.
   */
  const handleAssignDriver = async (driver: QueuedDriver) => {
    if (!selectedRide) return;
    setAssigningRideId(selectedRide._id);
    try {
      const res = await fetch(
        `${API_URL}/api/dispatcher/queue/${driver._id}/assign`,
        {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rideId: selectedRide._id }),
        }
      );
      const data = await res.json();
      if (res.ok && data.success) {
        Alert.alert(
          "✅ Driver Assigned",
          `${driver.firstname} ${driver.lastname} has been assigned.\n\nPassenger: ${selectedRide.firstname} ${selectedRide.lastname}\nRoute: ${selectedRide.pickupLocation.name} → ${selectedRide.dropoffLocation.name}\nFare: ₱${selectedRide.fare}`,
          [{ text: "OK" }]
        );
        setShowAssignModal(false);
        setSelectedRide(null);
        fetchPendingRides();
        fetchDriverQueue();
      } else {
        Alert.alert("Error", data.message || "Failed to assign driver.");
      }
    } catch (error) {
      console.error("Error assigning driver:", error);
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setAssigningRideId(null);
    }
  };

  /**
   * Auto assign: hits the backend auto-assign endpoint which picks the next
   * available driver by queue position and emits ride-assigned-by-dispatcher.
   */
  const handleAutoAssign = async (ride: PendingRide) => {
    if (availableDriversCount === 0) {
      Alert.alert("No Drivers Available", "There are no available drivers in the queue right now.");
      return;
    }
    setAssigningRideId(ride._id);
    try {
      const res = await fetch(`${API_URL}/api/dispatcher/queue/auto-assign`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rideId: ride._id,
          todaName: ride.todaName || dispatcher?.todaName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        Alert.alert(
          "⚡ Auto-Assigned",
          `${data.driver?.name ?? "Driver"} (Queue #${data.driver?.queuePosition}) has been assigned.\n\nPassenger: ${ride.firstname} ${ride.lastname}\nFare: ₱${ride.fare}`,
          [{ text: "OK" }]
        );
        fetchPendingRides();
        fetchDriverQueue();
      } else {
        Alert.alert("Error", data.message || "Auto-assign failed.");
      }
    } catch (error) {
      console.error("Auto-assign error:", error);
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setAssigningRideId(null);
    }
  };

  const handleRejectRide = async (rideId: string) => {
    Alert.alert("Reject Ride", "Are you sure you want to reject this ride?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/rides/${rideId}/cancel`, {
              method: "PUT",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cancelledBy: "dispatcher",
                cancelledReason: "Dispatcher rejected the ride",
              }),
            });
            if (res.ok) {
              Alert.alert("Ride Rejected", "The ride has been cancelled.");
              fetchPendingRides();
            }
          } catch {
            Alert.alert("Error", "Failed to reject ride.");
          }
        },
      },
    ]);
  };

  const handleRemoveFromQueue = async (queueEntry: QueuedDriver) => {
    Alert.alert(
      "Remove Driver",
      `Remove ${queueEntry.firstname} ${queueEntry.lastname} from queue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await fetch(
                `${API_URL}/api/dispatcher/queue/${queueEntry._id}`,
                { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" } }
              );
              if (res.ok) fetchDriverQueue();
              else Alert.alert("Error", "Failed to remove driver.");
            } catch {
              Alert.alert("Error", "Failed to remove driver from queue.");
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          try {
            socketRef.current?.disconnect();
            await fetch(`${API_URL}/api/auth/logout`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            });
            router.replace("/");
          } catch {
            Alert.alert("Error", "Failed to logout.");
          }
        },
      },
    ]);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchPendingRides(), fetchDriverQueue()]);
    setRefreshing(false);
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const availableDriversCount = driverQueue.filter((d) => d.status === "available").length;
  const onTripDriversCount    = driverQueue.filter((d) => d.status === "on-trip").length;

  const filteredQueue = driverQueue
    .filter((d) => {
      const q = searchQuery.toLowerCase();
      return (
        d.firstname.toLowerCase().includes(q) ||
        d.lastname.toLowerCase().includes(q) ||
        d.plateNumber.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.queuePosition - b.queuePosition);

  const getStatusColor = (status: QueuedDriver["status"]) => {
    switch (status) {
      case "available": return "#28a745";
      case "assigned":  return "#fd7e14";
      case "on-trip":   return "#007AFF";
      case "offline":   return "#999";
    }
  };

  const getStatusLabel = (status: QueuedDriver["status"]) => {
    switch (status) {
      case "available": return "🟢 Available";
      case "assigned":  return "🟠 Assigned";
      case "on-trip":   return "🔵 On Trip";
      case "offline":   return "⚫ Offline";
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>🚦 Dispatcher</Text>
            <Text style={styles.headerSubtitle}>
              {dispatcher
                ? `${dispatcher.firstName} ${dispatcher.lastName} · ${dispatcher.todaName}`
                : "Loading..."}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <View style={[styles.socketBadge, { backgroundColor: socketConnected ? "#28a745" : "#dc3545" }]}>
              <Text style={styles.socketBadgeText}>{socketConnected ? "LIVE" : "OFF"}</Text>
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
              <Text style={styles.logoutBtnText}>🚪</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Summary Row ── */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { borderColor: "#ffc107" }]}>
            <Text style={styles.summaryNumber}>{pendingRides.length}</Text>
            <Text style={styles.summaryLabel}>Pending Rides</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: "#28a745" }]}>
            <Text style={styles.summaryNumber}>{availableDriversCount}</Text>
            <Text style={styles.summaryLabel}>Available Drivers</Text>
          </View>
          <View style={[styles.summaryCard, { borderColor: "#007AFF" }]}>
            <Text style={styles.summaryNumber}>{onTripDriversCount}</Text>
            <Text style={styles.summaryLabel}>On Trip</Text>
          </View>
        </View>

        {/* ── Tabs ── */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "rides" && styles.tabActive]}
            onPress={() => setActiveTab("rides")}
          >
            <Text style={[styles.tabText, activeTab === "rides" && styles.tabTextActive]}>
              📋 Ride Requests {pendingRides.length > 0 ? `(${pendingRides.length})` : ""}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "queue" && styles.tabActive]}
            onPress={() => { setActiveTab("queue"); fetchDriverQueue(); }}
          >
            <Text style={[styles.tabText, activeTab === "queue" && styles.tabTextActive]}>
              🚗 Driver Queue ({driverQueue.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Ride Requests Tab ── */}
        {activeTab === "rides" && (
          <ScrollView
            style={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          >
            {pendingRides.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>😴</Text>
                <Text style={styles.emptyText}>No pending rides</Text>
                <Text style={styles.emptySubtext}>Pull down to refresh</Text>
              </View>
            ) : (
              pendingRides.map((ride) => (
                <View key={ride._id} style={styles.rideCard}>
                  <View style={styles.rideCardHeader}>
                    <View>
                      <Text style={styles.ridePassenger}>👤 {ride.firstname} {ride.lastname}</Text>
                      <Text style={styles.rideTime}>
                        🕐 {new Date(ride.createdAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    <Text style={styles.rideFare}>₱{ride.fare}</Text>
                  </View>

                  <View style={styles.routeContainer}>
                    <View style={styles.routeRow}>
                      <Text style={styles.routeIcon}>🟢</Text>
                      <Text style={styles.routeText} numberOfLines={2}>{ride.pickupLocation.name}</Text>
                    </View>
                    <View style={styles.routeDivider} />
                    <View style={styles.routeRow}>
                      <Text style={styles.routeIcon}>🔴</Text>
                      <Text style={styles.routeText} numberOfLines={2}>{ride.dropoffLocation.name}</Text>
                    </View>
                  </View>

                  <View style={styles.rideMetaRow}>
                    <Text style={styles.rideMeta}>📏 {ride.distance} km</Text>
                    <Text style={styles.rideMeta}>🚖 {availableDriversCount} available</Text>
                  </View>

                  <View style={styles.rideActions}>
                  
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.manualAssignBtn]}
                      onPress={() => { setSelectedRide(ride); setShowAssignModal(true); }}
                    >
                      <Text style={styles.actionBtnText}>👆 Assign Driver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.rejectBtn]}
                      onPress={() => handleRejectRide(ride._id)}
                    >
                      <Text style={styles.actionBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* ── Driver Queue Tab ── */}
        {activeTab === "queue" && (
          <View style={styles.queueContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search driver name or plate..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#aaa"
            />
            <ScrollView
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {filteredQueue.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyEmoji}>🚗</Text>
                  <Text style={styles.emptyText}>No drivers in queue</Text>
                  <Text style={styles.emptySubtext}>
                    {dispatcher?.todaName
                      ? `Waiting for drivers to join the ${dispatcher.todaName} queue`
                      : "Drivers will appear here when they join"}
                  </Text>
                </View>
              ) : (
                filteredQueue.map((driver) => (
                  <View key={driver._id} style={styles.driverCard}>
                    <View style={styles.driverCardLeft}>
                      <View style={styles.queuePosition}>
                        <Text style={styles.queuePositionText}>#{driver.queuePosition}</Text>
                      </View>
                      <View style={styles.driverInfo}>
                        <Text style={styles.driverName}>{driver.firstname} {driver.lastname}</Text>
                        <Text style={styles.driverPlate}>🪪 {driver.plateNumber}</Text>
                        <Text style={styles.driverStats}>
                          Trips: {driver.totalTripsToday} · ₱{driver.totalEarningsToday}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.driverCardRight}>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(driver.status) }]}>
                        <Text style={styles.statusBadgeText}>{getStatusLabel(driver.status)}</Text>
                      </View>
                      {driver.status === "available" && (
                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => handleRemoveFromQueue(driver)}
                        >
                          <Text style={styles.removeBtnText}>Remove</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        )}

        {/* ── Manual Assign Modal ── */}
        <Modal
          animationType="slide"
          transparent
          visible={showAssignModal && !!selectedRide}
          onRequestClose={() => { setShowAssignModal(false); setSelectedRide(null); }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Assign Driver</Text>
                <TouchableOpacity onPress={() => { setShowAssignModal(false); setSelectedRide(null); }}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              {selectedRide && (
                <View style={styles.modalRideSummary}>
                  <Text style={styles.modalRideSummaryTitle}>Ride Details</Text>
                  <Text style={styles.modalRidePassenger}>👤 {selectedRide.firstname} {selectedRide.lastname}</Text>
                  <Text style={styles.modalRideRoute}>🟢 {selectedRide.pickupLocation.name}</Text>
                  <Text style={styles.modalRideRoute}>🔴 {selectedRide.dropoffLocation.name}</Text>
                  <Text style={styles.modalRideFare}>Fare: ₱{selectedRide.fare} · {selectedRide.distance} km</Text>
                </View>
              )}

              <Text style={styles.modalSectionTitle}>
                Select a Driver ({availableDriversCount} available)
              </Text>

              <ScrollView style={styles.modalDriverList}>
                {driverQueue
                  .filter((d) => d.status === "available")
                  .sort((a, b) => a.queuePosition - b.queuePosition)
                  .map((driver) => (
                    <TouchableOpacity
                      key={driver._id}
                      style={[
                        styles.modalDriverCard,
                        assigningRideId === selectedRide?._id && styles.modalDriverCardDisabled,
                      ]}
                      onPress={() => handleAssignDriver(driver)}
                      disabled={assigningRideId === selectedRide?._id}
                      activeOpacity={0.7}
                    >
                      <View style={styles.modalDriverCardLeft}>
                        <View style={styles.queuePositionSmall}>
                          <Text style={styles.queuePositionSmallText}>#{driver.queuePosition}</Text>
                        </View>
                        <View>
                          <Text style={styles.modalDriverName}>{driver.firstname} {driver.lastname}</Text>
                          <Text style={styles.modalDriverPlate}>🪪 {driver.plateNumber}</Text>
                          <Text style={styles.modalDriverTrips}>{driver.totalTripsToday} trips today</Text>
                        </View>
                      </View>
                      <Text style={styles.assignArrow}>
                        {assigningRideId === selectedRide?._id ? "..." : "Assign →"}
                      </Text>
                    </TouchableOpacity>
                  ))}

                {driverQueue.filter((d) => d.status === "available").length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyEmoji}>😔</Text>
                    <Text style={styles.emptyText}>No available drivers right now</Text>
                  </View>
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
  container: { flex: 1, backgroundColor: "#f4f6fb" },
  header: {
    backgroundColor: "#1a1a2e", paddingTop: 56, paddingBottom: 18,
    paddingHorizontal: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSubtitle: { fontSize: 13, color: "#aaa", marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  socketBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  socketBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  logoutBtn: { backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  logoutBtnText: { fontSize: 18 },
  summaryRow: { flexDirection: "row", margin: 16, gap: 10 },
  summaryCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 14, paddingVertical: 14,
    paddingHorizontal: 10, alignItems: "center", borderWidth: 2,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  summaryNumber: { fontSize: 28, fontWeight: "800", color: "#1a1a2e" },
  summaryLabel: { fontSize: 11, color: "#888", marginTop: 2, textAlign: "center" },
  tabBar: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 12,
    backgroundColor: "#e8eaf0", borderRadius: 14, padding: 4,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 12 },
  tabActive: {
    backgroundColor: "#fff",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2,
  },
  tabText: { fontSize: 13, color: "#888", fontWeight: "600" },
  tabTextActive: { color: "#1a1a2e", fontWeight: "700" },
  list: { flex: 1, paddingHorizontal: 16 },
  rideCard: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16, marginBottom: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6,
    elevation: 3, borderWidth: 1, borderColor: "#eee",
  },
  rideCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  ridePassenger: { fontSize: 17, fontWeight: "700", color: "#1a1a2e" },
  rideTime: { fontSize: 12, color: "#999", marginTop: 2 },
  rideFare: { fontSize: 22, fontWeight: "800", color: "#28a745" },
  routeContainer: { backgroundColor: "#f8f9fb", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#eee" },
  routeRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  routeIcon: { fontSize: 14, marginTop: 2 },
  routeText: { flex: 1, fontSize: 13, color: "#555" },
  routeDivider: { height: 1, backgroundColor: "#e8e8e8", marginVertical: 6 },
  rideMetaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  rideMeta: { fontSize: 12, color: "#888" },
  rideActions: { flexDirection: "row", gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  actionBtnDisabled: { opacity: 0.5 },
  autoAssignBtn: { backgroundColor: "#1a1a2e", flex: 2 },
  manualAssignBtn: { backgroundColor: "#007AFF", flex: 1.5 },
  rejectBtn: { backgroundColor: "#dc3545", flex: 0.7 },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  queueContainer: { flex: 1, paddingHorizontal: 16 },
  searchInput: {
    backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: "#333", borderWidth: 1, borderColor: "#e0e0e0", marginBottom: 12,
  },
  driverCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 10,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4,
    elevation: 2, borderWidth: 1, borderColor: "#eee",
  },
  driverCardLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  queuePosition: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#1a1a2e",
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  queuePositionText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 15, fontWeight: "700", color: "#1a1a2e" },
  driverPlate: { fontSize: 12, color: "#666", marginTop: 2 },
  driverStats: { fontSize: 11, color: "#aaa", marginTop: 2 },
  driverCardRight: { alignItems: "flex-end", gap: 6 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  removeBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    backgroundColor: "#fff3f3", borderWidth: 1, borderColor: "#dc3545",
  },
  removeBtnText: { color: "#dc3545", fontSize: 11, fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 56, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: "600", color: "#666" },
  emptySubtext: { fontSize: 13, color: "#aaa", marginTop: 4, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: "85%", paddingBottom: 30 },
  modalHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    padding: 20, borderBottomWidth: 1, borderBottomColor: "#eee",
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#1a1a2e" },
  closeBtn: { fontSize: 24, color: "#aaa" },
  modalRideSummary: { backgroundColor: "#f0f7ff", margin: 16, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#c8e0ff" },
  modalRideSummaryTitle: { fontSize: 12, fontWeight: "700", color: "#007AFF", marginBottom: 6, textTransform: "uppercase" },
  modalRidePassenger: { fontSize: 15, fontWeight: "700", color: "#1a1a2e", marginBottom: 4 },
  modalRideRoute: { fontSize: 13, color: "#555", marginBottom: 2 },
  modalRideFare: { fontSize: 13, fontWeight: "700", color: "#28a745", marginTop: 4 },
  modalSectionTitle: { fontSize: 14, fontWeight: "700", color: "#888", marginHorizontal: 16, marginBottom: 8, textTransform: "uppercase" },
  modalDriverList: { paddingHorizontal: 16 },
  modalDriverCard: {
    backgroundColor: "#f8f9fb", borderRadius: 14, padding: 14, marginBottom: 10,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderWidth: 1, borderColor: "#e0e0e0",
  },
  modalDriverCardDisabled: { opacity: 0.5 },
  modalDriverCardLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  queuePositionSmall: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#1a1a2e", alignItems: "center", justifyContent: "center" },
  queuePositionSmallText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  modalDriverName: { fontSize: 15, fontWeight: "700", color: "#1a1a2e" },
  modalDriverPlate: { fontSize: 12, color: "#666", marginTop: 1 },
  modalDriverTrips: { fontSize: 11, color: "#aaa", marginTop: 1 },
  assignArrow: { fontSize: 14, fontWeight: "700", color: "#007AFF" },
});