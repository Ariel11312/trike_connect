import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';

// Type definitions
export type SeverityLevel = 'high' | 'medium' | 'low';
export type ReportStatus = 'pending' | 'resolved' | 'rejected';
export type ReportType = 'driver' | 'rider' | 'vehicle';

export interface Report {
  _id: string;
  rideId: string;
  driverId: string;
  reportedBy: string;
  reason: string;
  comment: string;
  status: ReportStatus;
  reportType: ReportType;
  severity: SeverityLevel;
  createdAt: string;
  updatedAt: string;
  driverName: string;
  reporterName: string;
  driverInitials: string;
  reporterInitials: string;
  driverProfilePic?: string | null;
  reporterProfilePic?: string | null;
}

const ReportListScreen: React.FC = () => {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // API Base URL - Update with your actual backend URL
const API_BASE_URL = 'http://192.168.100.37:5000/api/reports';

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // Add authorization header if needed
          // 'Authorization': `Bearer ${yourAuthToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch reports');
      }

      const result = await response.json();
      
      if (result.success) {
        setReports(result.data);
      } else {
        throw new Error(result.message || 'Failed to fetch reports');
      }

      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error('Error fetching reports:', error);
      Alert.alert('Error', 'Failed to fetch reports. Please try again.');
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    setRefreshing(true);
    fetchReports();
  };

  const getSeverityColor = (severity: SeverityLevel): string => {
    switch (severity) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#10b981';
      default:
        return '#6b7280';
    }
  };

  const getStatusColor = (status: ReportStatus): string => {
    switch (status) {
      case 'pending':
        return '#f59e0b';
      case 'resolved':
        return '#10b981';
      case 'rejected':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getSeverityIcon = (severity: SeverityLevel): string => {
    switch (severity) {
      case 'high':
        return '❗';
      case 'medium':
        return '⚠️';
      case 'low':
        return 'ℹ️';
      default:
        return '📄';
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleReportPress = (item: Report): void => {
    router.push({
      pathname: '/reportDetails',
      params: { report: JSON.stringify(item) },
    });
  };

  const handleDriverRegistration = (): void => {
    router.push('/DriverRegistration');
  };

  // Avatar component to show profile pic or initials
  const Avatar: React.FC<{
    profilePic?: string | null;
    initials: string;
    size?: number;
  }> = ({ profilePic, initials, size = 40 }) => {
    if (profilePic) {
      return (
        <Image
          source={{ uri: profilePic }}
          style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        />
      );
    }

    return (
      <View style={[styles.initialsContainer, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={[styles.initialsText, { fontSize: size * 0.4 }]}>{initials}</Text>
      </View>
    );
  };

  const renderReportItem = ({ item }: { item: Report }) => (
    <TouchableOpacity style={styles.reportCard} onPress={() => handleReportPress(item)}>
      <View style={styles.reportHeader}>
        <View style={styles.headerLeft}>
          <Avatar
            profilePic={item.driverProfilePic}
            initials={item.driverInitials}
            size={40}
          />
          <View style={styles.headerText}>
            <Text style={styles.driverName}>{item.driverName}</Text>
            <View style={styles.reporterRow}>   
              <Text style={styles.reportedBy}>Reported by {item.reporterName}</Text>
            </View>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.reportBody}>
        <Text style={styles.reason}>{item.reason}</Text>
        {item.comment ? (
          <Text style={styles.comment} numberOfLines={2}>
            {item.comment}
          </Text>
        ) : null}
      </View>

      <View style={styles.reportFooter}>
        <View style={styles.severityContainer}>
          <View style={[styles.severityDot, { backgroundColor: getSeverityColor(item.severity) }]} />
          <Text style={styles.severityText}>{item.severity.toUpperCase()}</Text>
        </View>
        <Text style={styles.dateText}>{formatDate(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
                <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports Dashboard</Text>
        <TouchableOpacity style={styles.navButton} onPress={handleDriverRegistration}>
          <Text style={styles.navButtonIcon}>👤</Text>
          <Text style={styles.navButtonText}>Driver Registration</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={reports}
        renderItem={renderReportItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>No reports found</Text>
            <TouchableOpacity onPress={fetchReports} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
  },
  navButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  navButtonText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  reportCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  avatar: {
    backgroundColor: '#e5e7eb',
  },
  initialsContainer: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  headerText: {
    marginLeft: 12,
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  reporterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  reportedBy: {
    fontSize: 12,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  reportBody: {
    marginBottom: 12,
  },
  reason: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  comment: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  severityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  severityText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  dateText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default ReportListScreen;