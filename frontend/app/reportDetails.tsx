import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Report, SeverityLevel, ReportStatus } from './reportList'; // Import types from reportList

const ReportDetails = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  
  // Parse the report data
  const report = JSON.parse(params.report as string) as Report;

  const getSeverityColor = (severity: SeverityLevel): string => {
    switch (severity) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusColor = (status: ReportStatus): string => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'resolved': return '#10b981';
      case 'rejected': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Report Details</Text>
        </View>

        <View style={styles.card}>
          {/* Status and Severity */}
          <View style={styles.statusRow}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(report.status) }]}>
              <Text style={styles.statusText}>{report.status.toUpperCase()}</Text>
            </View>
            <View style={[styles.severityBadge, { backgroundColor: getSeverityColor(report.severity) }]}>
              <Text style={styles.severityText}>{report.severity.toUpperCase()} SEVERITY</Text>
            </View>
          </View>

          {/* Driver Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Driver Information</Text>
            <Text style={styles.infoText}>Name: {report.driverName}</Text>
            <Text style={styles.infoText}>Driver ID: {report.driverId}</Text>
          </View>

          {/* Reporter Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reporter Information</Text>
            <Text style={styles.infoText}>Name: {report.reporterName}</Text>
            <Text style={styles.infoText}>Reporter ID: {report.reportedBy}</Text>
          </View>

          {/* Report Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Report Details</Text>
            <Text style={styles.infoText}>Report ID: {report._id}</Text>
            <Text style={styles.infoText}>Ride ID: {report.rideId}</Text>
            <Text style={styles.infoText}>Type: {report.reportType}</Text>
            <Text style={styles.infoText}>Reason: {report.reason}</Text>
          </View>

          {/* Comment */}
          {report.comment && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Comment</Text>
              <View style={styles.commentBox}>
                <Text style={styles.commentText}>{report.comment}</Text>
              </View>
            </View>
          )}

          {/* Dates */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Timestamps</Text>
            <Text style={styles.infoText}>Created: {formatDate(report.createdAt)}</Text>
            <Text style={styles.infoText}>Updated: {formatDate(report.updatedAt)}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  severityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  severityText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  commentBox: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  commentText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
});

export default ReportDetails;