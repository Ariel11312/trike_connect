import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Report, SeverityLevel, ReportStatus } from './reportList';

const ReportDetails = () => {
  const router = useRouter();
  const params = useLocalSearchParams();

  // Parse the report data
  const report = JSON.parse(params.report as string) as Report;

  // State management
  const [loading, setLoading] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banType, setBanType] = useState<'permanent' | 'temporary'>('permanent');
  const [banDuration, setBanDuration] = useState('24');

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

  const handleBanDriver = () => {
    // Pre-fill ban reason from report
    setBanReason(report.reason || '');
    setShowBanModal(true);
  };

  const executeBan = async () => {
    if (!banReason.trim()) {
      Alert.alert('Error', 'Please provide a ban reason');
      return;
    }

    const isPermanent = banType === 'permanent';
    const durationInHours = banType === 'temporary' ? parseInt(banDuration, 10) : undefined;

    // Validate duration for temporary bans
    if (!isPermanent && (!durationInHours || durationInHours <= 0)) {
      Alert.alert('Error', 'Please provide a valid duration for temporary ban');
      return;
    }

    setLoading(true);
    try {
      const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ;

      console.log('Banning user:', {
        userId: report.driverId,
        reason: banReason.trim(),
        rideId: report.rideId,
        permanent: isPermanent,
        duration: durationInHours
      });

      const response = await fetch(`${API_BASE_URL}/api/reports/${report.driverId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Remove Authorization header if your backend doesn't require it
        },
        body: JSON.stringify({
          reason: banReason.trim(),
          permanent: isPermanent,
          rideId: report.rideId,
          ...(durationInHours && !isPermanent && { duration: durationInHours })
        })
      });

      // Log response status
      console.log('Response status:', response.status);

      // Get response text first to handle non-JSON responses
      const responseText = await response.text();
      console.log('Response text:', responseText);

      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        throw new Error(
          `Server returned invalid response (${response.status}). ` +
          `Expected JSON but got: ${responseText.substring(0, 100)}`
        );
      }

      if (!response.ok) {
        throw new Error(data.message || `Server error: ${response.status}`);
      }

      console.log('Ban successful:', data);

      // Close modal and reset form
      setShowBanModal(false);
      setBanReason('');
      setBanDuration('24');
      setBanType('permanent');

      Alert.alert(
        'Success',
        `${report.driverName} has been ${isPermanent ? 'permanently' : 'temporarily'} banned.`,
        [
          {
            text: 'OK',
            onPress: () => {
              router.back();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Ban error:', error);
      Alert.alert(
        'Error',
        error?.message || 'Failed to ban driver. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCallDriver = () => {
    const phoneNumber = report.driverPhone || '';

    if (!phoneNumber) {
      Alert.alert('Error', 'Driver phone number not available');
      return;
    }

    const phoneUrl = `tel:${phoneNumber}`;

    Linking.canOpenURL(phoneUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(phoneUrl);
        } else {
          Alert.alert('Error', 'Unable to make phone calls on this device');
        }
      })
      .catch((err) => {
        console.error('Error opening phone dialer:', err);
        Alert.alert('Error', 'Failed to open phone dialer');
      });
  };

  return (
    
    <>
          <Stack.Screen options={{ headerShown: false }} />
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

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.callButton}
              onPress={handleCallDriver}
            >
              <Text style={styles.callButtonText}>📞 Call Driver</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.banButton}
              onPress={handleBanDriver}
            >
              <Text style={styles.banButtonText}>🚫 Ban Driver</Text>
            </TouchableOpacity>
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

      {/* Ban Modal */}
      <Modal
        visible={showBanModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBanModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ban Driver</Text>
            <Text style={styles.modalSubtitle}>{report.driverName}</Text>

            {/* Ban Type Selection */}
            <View style={styles.banTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.banTypeButton,
                  banType === 'permanent' && styles.banTypeButtonActive
                ]}
                onPress={() => setBanType('permanent')}
              >
                <Text style={[
                  styles.banTypeText,
                  banType === 'permanent' && styles.banTypeTextActive
                ]}>
                  Permanent Ban
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.banTypeButton,
                  banType === 'temporary' && styles.banTypeButtonActive
                ]}
                onPress={() => setBanType('temporary')}
              >
                <Text style={[
                  styles.banTypeText,
                  banType === 'temporary' && styles.banTypeTextActive
                ]}>
                  Temporary Ban
                </Text>
              </TouchableOpacity>
            </View>

            {/* Duration Input (only for temporary ban) */}
            {banType === 'temporary' && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Duration (hours)</Text>
                <TextInput
                  style={styles.input}
                  value={banDuration}
                  onChangeText={setBanDuration}
                  keyboardType="numeric"
                  placeholder="24"
                />
              </View>
            )}

            {/* Reason Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Ban Reason *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={banReason}
                onChangeText={setBanReason}
                multiline
                numberOfLines={4}
                placeholder="Enter ban reason..."
                textAlignVertical="top"
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowBanModal(false)}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBanButton}
                onPress={executeBan}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmBanButtonText}>Confirm Ban</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </>
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
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  callButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  banButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 20,
  },
  banTypeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  banTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  banTypeButtonActive: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  banTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  banTypeTextActive: {
    color: '#ef4444',
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  confirmBanButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmBanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ReportDetails;