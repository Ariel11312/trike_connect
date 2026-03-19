import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';

// ==================== API CONFIGURATION ====================
const API_BASE_URL = `${process.env.EXPO_PUBLIC_API_URL}/api/auth`;
const UPLOADS_BASE_URL = `${process.env.EXPO_PUBLIC_API_URL}/uploads`;

// ==================== TYPE DEFINITIONS ====================
type RegistrationStatus = 'pending' | 'approved' | 'rejected';

interface DispatcherUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: 'dispatcher';
  RegistrationStatus: RegistrationStatus;
  profilePicture?: string;
  todaName?: string;
  idCardImage?: string;
  address?: string;
  isEmailVerified: boolean;
  isBanned: boolean;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== HELPERS ====================
const getImageUrl = (imagePath?: string): string | undefined => {
  if (!imagePath) return undefined;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
  const cleanPath = imagePath.replace(/^[\/\\]+/, '').replace(/^uploads[\/\\]/, '');
  return `${UPLOADS_BASE_URL}/${cleanPath}`;
};

const getFullName = (user: DispatcherUser): string =>
  `${user.firstName} ${user.lastName}`;

const getInitials = (user: DispatcherUser): string =>
  `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

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

const getDocuments = (user: DispatcherUser) => {
  const docs: { type: string; url: string }[] = [];
  if (user.idCardImage) {
    const url = getImageUrl(user.idCardImage);
    if (url) docs.push({ type: 'ID Card', url });
  }
  return docs;
};

// ==================== MAIN COMPONENT ====================
const DispatcherManagementScreen: React.FC = () => {
  const router = useRouter();

  const [dispatchers, setDispatchers] = useState<DispatcherUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Document modal
  const [selectedDispatcher, setSelectedDispatcher] = useState<DispatcherUser | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedDocument, setSelectedDocument] = useState<{ type: string; url: string } | null>(null);

  // Rejection modal
  const [rejectModalVisible, setRejectModalVisible] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [userIdToReject, setUserIdToReject] = useState<string>('');

  useEffect(() => {
    fetchDispatchers();
  }, []);

  // ==================== API CALLS ====================
  const fetchDispatchers = async (): Promise<void> => {
    try {
      setLoading(true);

      const url = `${API_BASE_URL}/users?role=dispatcher`;
      console.log('[Dispatchers] Fetching from:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      console.log('[Dispatchers] Status:', response.status);

      // Read raw text first so we can safely inspect it on error
      const rawText = await response.text();
      console.log('[Dispatchers] Raw response (first 300 chars):', rawText.slice(0, 300));

      // If the server returned HTML, the endpoint is wrong
      if (rawText.trimStart().startsWith('<')) {
        throw new Error(
          `Server returned HTML instead of JSON (HTTP ${response.status}).\n\nCheck that the endpoint is correct:\n${url}`
        );
      }

      const data = JSON.parse(rawText);

      if (response.ok && data.success) {
        setDispatchers(data.data);
      } else {
        throw new Error(data.message || `Request failed with status ${response.status}`);
      }
    } catch (error: any) {
      console.error('[Dispatchers] Error:', error);
      Alert.alert('Error', error.message || 'Failed to fetch dispatchers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    setRefreshing(true);
    fetchDispatchers();
  };

  const handleApprove = async (userId: string): Promise<void> => {
    Alert.alert(
      'Approve Dispatcher',
      'Are you sure you want to approve this dispatcher registration?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              const response = await fetch(
                `${API_BASE_URL}/users/${userId}/registration-status`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ RegistrationStatus: 'approved' }),
                }
              );

              const data = await response.json();

              if (response.ok && data.success) {
                Alert.alert('Success', 'Dispatcher registration approved successfully!');
                setModalVisible(false);
                fetchDispatchers();
              } else {
                throw new Error(data.message || 'Failed to approve');
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to approve registration');
            }
          },
        },
      ]
    );
  };

  const handleReject = (userId: string): void => {
    setUserIdToReject(userId);
    setRejectionReason('');
    setRejectModalVisible(true);
  };

  const submitRejection = async (): Promise<void> => {
    if (!rejectionReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for rejection');
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/users/${userIdToReject}/registration-status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            RegistrationStatus: 'rejected',
            rejectionReason: rejectionReason.trim(),
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert('Success', 'Dispatcher registration rejected.');
        setRejectModalVisible(false);
        setRejectionReason('');
        setUserIdToReject('');
        setModalVisible(false);
        fetchDispatchers();
      } else {
        throw new Error(data.message || 'Failed to reject');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to reject registration');
    }
  };

  // ==================== STATUS HELPERS ====================
  const getStatusColor = (status: RegistrationStatus): string => {
    switch (status) {
      case 'approved': return '#10b981';
      case 'pending':  return '#f59e0b';
      case 'rejected': return '#ef4444';
      default:         return '#6b7280';
    }
  };

  // ==================== HANDLERS ====================
  const handleViewDetails = (dispatcher: DispatcherUser): void => {
    setSelectedDispatcher(dispatcher);
    setModalVisible(true);
    const docs = getDocuments(dispatcher);
    setSelectedDocument(docs.length > 0 ? docs[0] : null);
  };

  // ==================== REJECTION MODAL ====================
  const renderRejectionModal = () => (
    <Modal
      animationType="fade"
      transparent
      visible={rejectModalVisible}
      onRequestClose={() => setRejectModalVisible(false)}
    >
      <View style={styles.rejectionModalOverlay}>
        <View style={styles.rejectionModalContent}>
          <View style={styles.rejectionModalHeader}>
            <Text style={styles.rejectionModalTitle}>Reject Registration</Text>
            <TouchableOpacity
              onPress={() => {
                setRejectModalVisible(false);
                setRejectionReason('');
              }}
            >
              <Icon name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <Text style={styles.rejectionModalLabel}>
            Please provide a reason for rejecting this dispatcher registration:
          </Text>

          <TextInput
            style={styles.rejectionInput}
            placeholder="e.g., Invalid ID, Incomplete information..."
            value={rejectionReason}
            onChangeText={setRejectionReason}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <View style={styles.rejectionModalButtons}>
            <TouchableOpacity
              style={styles.rejectionCancelButton}
              onPress={() => {
                setRejectModalVisible(false);
                setRejectionReason('');
              }}
            >
              <Text style={styles.rejectionCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectionSubmitButton}
              onPress={submitRejection}
            >
              <Text style={styles.rejectionSubmitButtonText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // ==================== DOCUMENT MODAL ====================
  const renderDocumentModal = () => {
    if (!selectedDispatcher) return null;
    const documents = getDocuments(selectedDispatcher);

    return (
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{getFullName(selectedDispatcher)}</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setSelectedDocument(null);
                }}
                style={styles.closeButton}
              >
                <Icon name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              {/* Document Preview */}
              <View style={styles.documentPreviewContainer}>
                {selectedDocument ? (
                  <>
                    <Image
                      source={{ uri: selectedDocument.url }}
                      style={styles.documentImage}
                      resizeMode="contain"
                      onError={() =>
                        Alert.alert(
                          'Image Load Error',
                          `Failed to load ${selectedDocument.type}.\n\nURL: ${selectedDocument.url}`
                        )
                      }
                    />
                    <Text style={styles.currentDocumentLabel}>
                      {selectedDocument.type}
                    </Text>
                  </>
                ) : (
                  <View style={styles.noDocumentContainer}>
                    <Icon name="image-not-supported" size={64} color="#d1d5db" />
                    <Text style={styles.noDocumentText}>No document uploaded</Text>
                  </View>
                )}
              </View>

              {/* Document List */}
              <Text style={styles.documentsSectionTitle}>
                Available Documents ({documents.length}):
              </Text>
              <View style={styles.documentsList}>
                {documents.length > 0 ? (
                  documents.map((doc, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.documentItem,
                        selectedDocument?.url === doc.url && styles.selectedDocumentItem,
                      ]}
                      onPress={() => setSelectedDocument(doc)}
                    >
                      <View style={styles.documentItemHeader}>
                        <Icon
                          name="description"
                          size={20}
                          color={selectedDocument?.url === doc.url ? '#2563eb' : '#6b7280'}
                        />
                        <Text style={styles.documentType}>{doc.type}</Text>
                        {selectedDocument?.url === doc.url && (
                          <Icon name="check-circle" size={20} color="#2563eb" />
                        )}
                      </View>
                      <Text style={styles.documentHint}>Tap to view</Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.noDocumentsContainer}>
                    <Icon name="folder-open" size={48} color="#d1d5db" />
                    <Text style={styles.noDocumentsText}>No documents uploaded</Text>
                  </View>
                )}
              </View>

              {/* Dispatcher Info Summary */}
              <View style={styles.driverInfoSummary}>
                <Text style={styles.summaryTitle}>Dispatcher Information</Text>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Name:</Text>
                  <Text style={styles.summaryValue}>{getFullName(selectedDispatcher)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Email:</Text>
                  <Text style={styles.summaryValue}>{selectedDispatcher.email}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Phone:</Text>
                  <Text style={styles.summaryValue}>
                    {selectedDispatcher.phoneNumber.startsWith('63')
                      ? `+${selectedDispatcher.phoneNumber}`
                      : selectedDispatcher.phoneNumber}
                  </Text>
                </View>
                {selectedDispatcher.todaName ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>TODA:</Text>
                    <Text style={styles.summaryValue}>{selectedDispatcher.todaName}</Text>
                  </View>
                ) : null}
                {selectedDispatcher.address ? (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Address:</Text>
                    <Text style={styles.summaryValue}>{selectedDispatcher.address}</Text>
                  </View>
                ) : null}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Registered:</Text>
                  <Text style={styles.summaryValue}>{formatDate(selectedDispatcher.createdAt)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Email:</Text>
                  <Text
                    style={[
                      styles.summaryValue,
                      { color: selectedDispatcher.isEmailVerified ? '#10b981' : '#ef4444' },
                    ]}
                  >
                    {selectedDispatcher.isEmailVerified ? 'Verified ✓' : 'Not Verified ✗'}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Status:</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(selectedDispatcher.RegistrationStatus) },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {selectedDispatcher.RegistrationStatus.toUpperCase()}
                    </Text>
                  </View>
                </View>

                {selectedDispatcher.rejectionReason ? (
                  <View style={styles.rejectionReasonContainer}>
                    <Icon name="info" size={16} color="#ef4444" />
                    <Text style={styles.rejectionReasonText}>
                      {selectedDispatcher.rejectionReason}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Action Buttons */}
              {selectedDispatcher.RegistrationStatus === 'pending' && (
                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={styles.modalRejectButton}
                    onPress={() => handleReject(selectedDispatcher._id)}
                  >
                    <Icon name="close" size={20} color="#fff" />
                    <Text style={styles.modalActionButtonText}>Decline</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalApproveButton}
                    onPress={() => handleApprove(selectedDispatcher._id)}
                  >
                    <Icon name="check" size={20} color="#fff" />
                    <Text style={styles.modalActionButtonText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              )}

              {selectedDispatcher.RegistrationStatus === 'approved' && (
                <TouchableOpacity
                  style={[styles.modalRejectButton, styles.fullWidthButton]}
                  onPress={() => handleReject(selectedDispatcher._id)}
                >
                  <Icon name="close" size={20} color="#fff" />
                  <Text style={styles.modalActionButtonText}>Revoke Approval</Text>
                </TouchableOpacity>
              )}

              {selectedDispatcher.RegistrationStatus === 'rejected' && (
                <TouchableOpacity
                  style={[styles.modalApproveButton, styles.fullWidthButton]}
                  onPress={() => handleApprove(selectedDispatcher._id)}
                >
                  <Icon name="check" size={20} color="#fff" />
                  <Text style={styles.modalActionButtonText}>Approve Instead</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ==================== LIST ITEM ====================
  const renderDispatcherItem = ({ item }: { item: DispatcherUser }) => {
    const documents = getDocuments(item);
    const profileImageUrl = getImageUrl(item.profilePicture);

    return (
      <TouchableOpacity
        style={styles.registrationCard}
        onPress={() => handleViewDetails(item)}
      >
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
            {profileImageUrl ? (
              <Image
                source={{ uri: profileImageUrl }}
                style={styles.profileImage}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.initialsText}>{getInitials(item)}</Text>
            )}
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.driverName}>{getFullName(item)}</Text>
            <Text style={styles.email}>{item.email}</Text>
            <Text style={styles.phone}>
              {item.phoneNumber.startsWith('63')
                ? `+${item.phoneNumber}`
                : item.phoneNumber}
            </Text>
            {item.todaName ? (
              <Text style={styles.todaName}>📍 {item.todaName}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.viewDocsButton}
              onPress={(e) => {
                e.stopPropagation();
                handleViewDetails(item);
              }}
            >
              <Icon name="photo-library" size={16} color="#2563eb" />
              <Text style={styles.viewDocsText}>{documents.length} document(s)</Text>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.RegistrationStatus) },
            ]}
          >
            <Text style={styles.statusText}>
              {item.RegistrationStatus.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Card Body */}
        <View style={styles.cardBody}>
          {item.address ? (
            <View style={styles.infoRow}>
              <Icon name="location-on" size={18} color="#6b7280" />
              <Text style={styles.infoText}>{item.address}</Text>
            </View>
          ) : null}

          <View style={styles.verificationRow}>
            <View style={styles.verificationItem}>
              <Icon
                name={documents.length > 0 ? 'check-circle' : 'cancel'}
                size={18}
                color={documents.length > 0 ? '#10b981' : '#ef4444'}
              />
              <Text style={styles.verificationText}>
                ID Document ({documents.length})
              </Text>
            </View>
            <View style={styles.verificationItem}>
              <Icon
                name={item.isEmailVerified ? 'mark-email-read' : 'mark-email-unread'}
                size={18}
                color={item.isEmailVerified ? '#10b981' : '#f59e0b'}
              />
              <Text style={styles.verificationText}>
                {item.isEmailVerified ? 'Email Verified' : 'Unverified'}
              </Text>
            </View>
          </View>

          {item.rejectionReason ? (
            <View style={styles.rejectionReasonContainer}>
              <Icon name="info" size={16} color="#ef4444" />
              <Text style={styles.rejectionReasonText}>{item.rejectionReason}</Text>
            </View>
          ) : null}
        </View>

        {/* Card Footer */}
        <View style={styles.cardFooter}>
          <Text style={styles.dateText}>Registered: {formatDate(item.createdAt)}</Text>
          {item.RegistrationStatus === 'pending' && (
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.approveButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleApprove(item._id);
                }}
              >
                <Icon name="check" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rejectButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleReject(item._id);
                }}
              >
                <Icon name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ==================== LOADING STATE ====================
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading dispatcher registrations...</Text>
      </View>
    );
  }

  // ==================== MAIN RENDER ====================
  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Icon name="arrow-back" size={24} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispatcher Registrations</Text>
        <View style={styles.headerRight}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{dispatchers.length}</Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {dispatchers.filter((d) => d.RegistrationStatus === 'pending').length}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#10b981' }]}>
            {dispatchers.filter((d) => d.RegistrationStatus === 'approved').length}
          </Text>
          <Text style={styles.statLabel}>Approved</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#ef4444' }]}>
            {dispatchers.filter((d) => d.RegistrationStatus === 'rejected').length}
          </Text>
          <Text style={styles.statLabel}>Rejected</Text>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={dispatchers}
        renderItem={renderDispatcherItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#2563eb']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="person-add" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No dispatcher registrations found</Text>
            <Text style={styles.emptySubText}>Pull down to refresh</Text>
          </View>
        }
      />

      {renderDocumentModal()}
      {renderRejectionModal()}
    </SafeAreaView>
  );
};

// ==================== STYLES ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6b7280' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: { padding: 8 },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    flex: 1,
    marginLeft: 8,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  countBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  countText: { fontSize: 14, fontWeight: 'bold', color: '#2563eb' },

  // Stats
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#f59e0b' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4 },

  // List
  listContainer: { padding: 16 },

  // Card
  registrationCard: {
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
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileImage: { width: '100%', height: '100%' },
  initialsText: { fontSize: 20, fontWeight: 'bold', color: '#2563eb' },
  headerInfo: { flex: 1, marginLeft: 12 },
  driverName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  email: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  phone: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  todaName: { fontSize: 12, color: '#2563eb', marginTop: 3 },
  viewDocsButton: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  viewDocsText: { fontSize: 12, color: '#2563eb', marginLeft: 4 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  statusText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 },
  cardBody: { marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoText: { fontSize: 14, color: '#374151', marginLeft: 8, flex: 1 },
  verificationRow: { flexDirection: 'row', marginTop: 8, gap: 16 },
  verificationItem: { flexDirection: 'row', alignItems: 'center' },
  verificationText: { fontSize: 13, color: '#6b7280', marginLeft: 6 },
  rejectionReasonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
  },
  rejectionReasonText: { fontSize: 12, color: '#ef4444', marginLeft: 6, flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  dateText: { fontSize: 12, color: '#9ca3af' },
  actionButtons: { flexDirection: 'row', gap: 8 },
  approveButton: {
    backgroundColor: '#10b981',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#ef4444',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: { fontSize: 16, color: '#9ca3af', marginTop: 12, fontWeight: '500' },
  emptySubText: { fontSize: 14, color: '#d1d5db', marginTop: 4 },

  // Document Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    flex: 1,
  },
  closeButton: { padding: 4 },
  modalContent: { flex: 1, padding: 16 },
  documentPreviewContainer: {
    height: 280,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  documentImage: { width: '100%', height: '100%', borderRadius: 12 },
  currentDocumentLabel: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  noDocumentContainer: { alignItems: 'center' },
  noDocumentText: { marginTop: 8, color: '#9ca3af', fontSize: 14 },
  documentsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  documentsList: { marginBottom: 20 },
  documentItem: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  selectedDocumentItem: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  documentItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  documentType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  },
  documentHint: {
    fontSize: 11,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 4,
    marginLeft: 28,
  },
  noDocumentsContainer: { alignItems: 'center', paddingVertical: 32 },
  noDocumentsText: { fontSize: 14, color: '#9ca3af', marginTop: 8 },

  // Info Summary
  driverInfoSummary: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
    width: 80,
    fontWeight: '500',
  },
  summaryValue: { fontSize: 14, color: '#374151', flex: 1 },

  // Modal Action Buttons
  modalActionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  modalApproveButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 0,
  },
  modalRejectButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 0,
  },
  fullWidthButton: {
    flex: 0,
    marginBottom: 24,
  },
  modalActionButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Rejection Modal
  rejectionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  rejectionModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  rejectionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  rejectionModalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  rejectionModalLabel: { fontSize: 14, color: '#6b7280', marginBottom: 12 },
  rejectionInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    marginBottom: 20,
  },
  rejectionModalButtons: { flexDirection: 'row', gap: 12 },
  rejectionCancelButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectionCancelButtonText: { fontSize: 16, fontWeight: '600', color: '#6b7280' },
  rejectionSubmitButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectionSubmitButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});

export default DispatcherManagementScreen;