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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router'; // Import useRouter from expo-router

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
}

const ReportListScreen: React.FC = () => {
  const router = useRouter(); // Initialize router
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Sample data - Replace with actual API call
  const sampleReports: Report[] = [
    {
      _id: '698a6915681642cc0dff51f0',
      rideId: '698a646275b5cf0a9217f225',
      driverId: '698103d39a117950f4f909c3',
      reportedBy: '697fea4dc0d0f308fc7bd7aa',
      reason: 'Rude or unprofessional behavior',
      comment: '',
      status: 'pending',
      reportType: 'driver',
      severity: 'medium',
      createdAt: '2026-02-09T23:09:09.428+00:00',
      updatedAt: '2026-02-09T23:09:09.428+00:00',
      driverName: 'John Doe',
      reporterName: 'Jane Smith',
    },
    {
      _id: '698a6915681642cc0dff51f1',
      rideId: '698a646275b5cf0a9217f226',
      driverId: '698103d39a117950f4f909c4',
      reportedBy: '697fea4dc0d0f308fc7bd7ab',
      reason: 'Unsafe driving',
      comment: 'Driver was speeding and running red lights',
      status: 'pending',
      reportType: 'driver',
      severity: 'high',
      createdAt: '2026-02-09T22:30:15.428+00:00',
      updatedAt: '2026-02-09T22:30:15.428+00:00',
      driverName: 'Mike Johnson',
      reporterName: 'Tom Wilson',
    },
    {
      _id: '698a6915681642cc0dff51f2',
      rideId: '698a646275b5cf0a9217f227',
      driverId: '698103d39a117950f4f909c5',
      reportedBy: '697fea4dc0d0f308fc7bd7ac',
      reason: 'Vehicle condition issues',
      comment: 'Car was dirty and smelled bad',
      status: 'resolved',
      reportType: 'driver',
      severity: 'low',
      createdAt: '2026-02-09T21:15:30.428+00:00',
      updatedAt: '2026-02-09T21:15:30.428+00:00',
      driverName: 'Sarah Lee',
      reporterName: 'Emma Davis',
    },
  ];

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async (): Promise<void> => {
    try {
      // Replace with actual API call
      // const response = await fetch('YOUR_API_ENDPOINT/reports');
      // const data: Report[] = await response.json();
      // setReports(data);
      
      // Simulating API call
      setTimeout(() => {
        setReports(sampleReports);
        setLoading(false);
        setRefreshing(false);
      }, 1000);
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

  // Change this line in handleReportPress:
const handleReportPress = (item: Report): void => {
  router.push({
    pathname: '/reportDetails', // Changed from '/ReportDetails' to '/reportDetails'
    params: { report: JSON.stringify(item) }
  });
};

  const handleDriverRegistration = (): void => {
    router.push('/DriverRegistration');
  };

  const renderReportItem = ({ item }: { item: Report }) => (
    <TouchableOpacity
      style={styles.reportCard}
      onPress={() => handleReportPress(item)}
    >
      <View style={styles.reportHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>{getSeverityIcon(item.severity)}</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.driverName}>{item.driverName}</Text>
            <Text style={styles.reportedBy}>Reported by {item.reporterName}</Text>
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports Dashboard</Text>
        <TouchableOpacity
          style={styles.navButton}
          onPress={handleDriverRegistration}
        >
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
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 20,
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
  reportedBy: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
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