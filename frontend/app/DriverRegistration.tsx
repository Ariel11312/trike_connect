import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';

// ==================== API CONFIGURATION ====================
// IMPORTANT: Update these URLs based on your environment:
// For Physical Device on same network: Use your computer's local IP
const API_BASE_URL = 'http://192.168.100.37:5000/api';
const UPLOADS_BASE_URL = 'http://192.168.100.37:5000/uploads';

// For Android Emulator, use:
// const API_BASE_URL = 'http://10.0.2.2:5000/api';
// const UPLOADS_BASE_URL = 'http://10.0.2.2:5000/uploads';

// For iOS Simulator, use:
// const API_BASE_URL = 'http://localhost:5000/api';
// const UPLOADS_BASE_URL = 'http://localhost:5000/uploads';

// For Production, use:
// const API_BASE_URL = 'https://your-api-domain.com/api';
// const UPLOADS_BASE_URL = 'https://your-api-domain.com/uploads';
// ===========================================================

// Type definitions matching backend User model
type RegistrationStatus = 'pending' | 'approved' | 'rejected';

interface DriverUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: 'driver';
  RegistrationStatus: RegistrationStatus;
  profilePicture?: string;
  sapiId?: string;
  
  // Vehicle information
  vehicleType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  licensePlate?: string;
  
  // Documents and verification
  idFront?: string;
  idBack?: string;
  idCardImage?: string; // Changed from driversLicense to idCardImage
  vehicleRegistration?: string;
  insurance?: string;
  
  documentsVerified?: boolean;
  backgroundCheckStatus?: 'pending' | 'approved' | 'failed';
  rejectionReason?: string;
  
  createdAt: string;
  updatedAt: string;
}

/**
 * Helper function to construct full image URLs from file paths
 * Handles both relative paths and full URLs
 */
const getImageUrl = (imagePath?: string): string | undefined => {
  if (!imagePath) {
    console.log('No image path provided');
    return undefined;
  }
  
  // If the path is already a full URL, return it as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    console.log('Full URL detected:', imagePath);
    return imagePath;
  }
  
  // Remove any leading slashes, backslashes, or "uploads/" prefix
  let cleanPath = imagePath
    .replace(/^[\/\\]+/, '')           // Remove leading slashes
    .replace(/^uploads[\/\\]/, '');    // Remove "uploads/" prefix if exists
  
  // Construct full URL
  const fullUrl = `${UPLOADS_BASE_URL}/${cleanPath}`;
  console.log('Constructed image URL:', fullUrl);
  
  return fullUrl;
};

const DriverRegistrationReportsScreen: React.FC = () => {
  const router = useRouter();
  const [registrations, setRegistrations] = useState<DriverUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedRegistration, setSelectedRegistration] = useState<DriverUser | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedDocument, setSelectedDocument] = useState<{ type: string; url: string } | null>(null);

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const fetchRegistrations = async (): Promise<void> => {
    try {
      setLoading(true);
      console.log('Fetching registrations from:', `${API_BASE_URL}/driver-registrations/`);
      
      const response = await fetch(`${API_BASE_URL}/driver-registrations/?page=1&limit=100`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      console.log('Fetch response:', { success: data.success, count: data.data?.length });

      if (response.ok && data.success) {
        setRegistrations(data.data);
        
        // Log image paths for debugging
        data.data.forEach((reg: DriverUser) => {
          if (reg.profilePicture) {
            console.log(`Profile picture for ${reg.firstName}:`, reg.profilePicture);
          }
        });
      } else {
        throw new Error(data.message || 'Failed to fetch registrations');
      }
    } catch (error: any) {
      console.error('Error fetching registrations:', error);
      Alert.alert(
        'Error',
        error.message || 'Failed to fetch driver registrations'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = (): void => {
    setRefreshing(true);
    fetchRegistrations();
  };

  const getStatusColor = (status: RegistrationStatus): string => {
    switch (status) {
      case 'approved':
        return '#10b981';
      case 'pending':
        return '#f59e0b';
      case 'rejected':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getBackgroundCheckColor = (status?: 'pending' | 'approved' | 'failed'): string => {
    switch (status) {
      case 'approved':
        return '#10b981';
      case 'pending':
        return '#f59e0b';
      case 'failed':
        return '#ef4444';
      default:
        return '#6b7280';
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

  const getFullName = (user: DriverUser): string => {
    return `${user.firstName} ${user.lastName}`;
  };

  const getDocuments = (user: DriverUser) => {
    const docs = [];
    
    if (user.idFront) {
      const url = getImageUrl(user.idFront);
      if (url) docs.push({ type: 'ID Front', url });
    }
    if (user.idBack) {
      const url = getImageUrl(user.idBack);
      if (url) docs.push({ type: 'ID Back', url });
    }
    if (user.idCardImage) {
      const url = getImageUrl(user.idCardImage);
      if (url) docs.push({ type: "ID Card Image", url });
    }
    if (user.vehicleRegistration) {
      const url = getImageUrl(user.vehicleRegistration);
      if (url) docs.push({ type: 'Vehicle Registration', url });
    }
    if (user.insurance) {
      const url = getImageUrl(user.insurance);
      if (url) docs.push({ type: 'Insurance', url });
    }
    
    console.log(`Documents for ${user.firstName}:`, docs.length);
    return docs;
  };

  const handleViewDocuments = (registration: DriverUser): void => {
    console.log('Viewing documents for:', registration.firstName);
    setSelectedRegistration(registration);
    setModalVisible(true);
    const docs = getDocuments(registration);
    if (docs.length > 0) {
      setSelectedDocument(docs[0]);
      console.log('Selected first document:', docs[0]);
    }
  };

  const handleApprove = async (userId: string): Promise<void> => {
    Alert.alert(
      'Approve Registration',
      'Are you sure you want to approve this driver registration?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            try {
              const response = await fetch(`${API_BASE_URL}/driver-registrations/${userId}/approve`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
              });

              const data = await response.json();

              if (response.ok && data.success) {
                Alert.alert('Success', 'Driver registration approved successfully!');
                fetchRegistrations(); // Refresh the list
              } else {
                throw new Error(data.message || 'Failed to approve registration');
              }
            } catch (error: any) {
              console.error('Error approving registration:', error);
              Alert.alert(
                'Error',
                error.message || 'Failed to approve registration'
              );
            }
          },
        },
      ]
    );
  };

  const handleReject = async (userId: string): Promise<void> => {
    Alert.prompt(
      'Reject Registration',
      'Please provide a reason for rejection:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async (reason) => {
            try {
              const response = await fetch(`${API_BASE_URL}/driver-registrations/${userId}/reject`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  reason: reason || 'Registration did not meet requirements'
                }),
              });

              const data = await response.json();

              if (response.ok && data.success) {
                Alert.alert('Success', 'Driver registration rejected.');
                fetchRegistrations(); // Refresh the list
              } else {
                throw new Error(data.message || 'Failed to reject registration');
              }
            } catch (error: any) {
              console.error('Error rejecting registration:', error);
              Alert.alert(
                'Error',
                error.message || 'Failed to reject registration'
              );
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const renderRegistrationItem = ({ item }: { item: DriverUser }) => {
    const documents = getDocuments(item);
    const fullName = getFullName(item);
    const profileImageUrl = getImageUrl(item.profilePicture);
    
    return (
      <TouchableOpacity
        style={styles.registrationCard}
        onPress={() => handleViewDocuments(item)}
      >
        <View style={styles.cardHeader}>
          <Stack.Screen options={{ headerShown: false }} />
          <View style={styles.avatarContainer}>
            {profileImageUrl ? (
              <Image
                source={{ uri: profileImageUrl }}
                style={styles.profileImage}
                resizeMode="cover"
                onError={(error) => {
                  console.error('Failed to load profile image:', profileImageUrl);
                  console.error('Error details:', error.nativeEvent.error);
                }}
                onLoad={() => {
                  console.log('Profile image loaded successfully:', profileImageUrl);
                }}
              />
            ) : (
              <Icon name="person" size={32} color="#2563eb" />
            )}
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.driverName}>{fullName}</Text>
            <Text style={styles.email}>{item.email}</Text>
            <Text style={styles.phone}>{item.phoneNumber}</Text>
            {item.sapiId && (
              <Text style={styles.sapiId}>ID: {item.sapiId}</Text>
            )}
            <TouchableOpacity
              style={styles.viewDocsButton}
              onPress={(e) => {
                e.stopPropagation();
                handleViewDocuments(item);
              }}
            >
              <Icon name="photo-library" size={16} color="#2563eb" />
              <Text style={styles.viewDocsText}>
                {documents.length} documents
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.RegistrationStatus) }]}>
            <Text style={styles.statusText}>{item.RegistrationStatus.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardBody}>
          {item.vehicleMake && item.vehicleModel && (
            <>
              <View style={styles.infoRow}>
                <Icon name="directions-car" size={20} color="#6b7280" />
                <Text style={styles.infoText}>
                  {item.vehicleYear ? `${item.vehicleYear} ` : ''}
                  {item.vehicleMake} {item.vehicleModel}
                  {item.vehicleType ? ` (${item.vehicleType})` : ''}
                </Text>
              </View>

              {item.licensePlate && (
                <View style={styles.infoRow}>
                  <Icon name="confirmation-number" size={20} color="#6b7280" />
                  <Text style={styles.infoText}>License Plate: {item.licensePlate}</Text>
                </View>
              )}
            </>
          )}

          <View style={styles.verificationRow}>
            <View style={styles.verificationItem}>
              <Icon
                name={item.documentsVerified ? 'check-circle' : 'cancel'}
                size={20}
                color={item.documentsVerified ? '#10b981' : '#ef4444'}
              />
              <Text style={styles.verificationText}>
                Documents ({documents.length})
              </Text>
            </View>

            <View style={styles.verificationItem}>
              <Icon
                name={
                  item.backgroundCheckStatus === 'approved'
                    ? 'check-circle'
                    : item.backgroundCheckStatus === 'failed'
                    ? 'cancel'
                    : 'hourglass-empty'
                }
                size={20}
                color={getBackgroundCheckColor(item.backgroundCheckStatus)}
              />
              <Text style={styles.verificationText}>Background Check</Text>
            </View>
          </View>

          {item.rejectionReason && (
            <View style={styles.rejectionReasonContainer}>
              <Icon name="info" size={16} color="#ef4444" />
              <Text style={styles.rejectionReasonText}>{item.rejectionReason}</Text>
            </View>
          )}
        </View>

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

  const renderDocumentModal = () => {
    if (!selectedRegistration) return null;
    
    const documents = getDocuments(selectedRegistration);
    
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Documents - {getFullName(selectedRegistration)}
              </Text>
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
              {/* Current Document Image */}
              <View style={styles.documentPreviewContainer}>
                {selectedDocument ? (
                  <>
                    <Image
                      source={{ uri: selectedDocument.url }}
                      style={styles.documentImage}
                      resizeMode="contain"
                      onError={(error) => {
                        console.error('Failed to load document:', selectedDocument.url);
                        console.error('Error details:', error.nativeEvent.error);
                        Alert.alert(
                          'Image Load Error',
                          `Failed to load ${selectedDocument.type}. Please check if the file exists on the server.\n\nURL: ${selectedDocument.url}`
                        );
                      }}
                      onLoad={() => {
                        console.log('Document loaded successfully:', selectedDocument.url);
                      }}
                    />
                    <Text style={styles.currentDocumentLabel}>{selectedDocument.type}</Text>
                  </>
                ) : (
                  <View style={styles.noDocumentContainer}>
                    <Icon name="image-not-supported" size={64} color="#d1d5db" />
                    <Text style={styles.noDocumentText}>No document selected</Text>
                  </View>
                )}
              </View>

              {/* Document List */}
              <Text style={styles.documentsSectionTitle}>Available Documents ({documents.length}):</Text>
              <View style={styles.documentsList}>
                {documents.length > 0 ? (
                  documents.map((doc, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.documentItem,
                        selectedDocument?.url === doc.url && styles.selectedDocumentItem,
                      ]}
                      onPress={() => {
                        console.log('Selecting document:', doc.type, doc.url);
                        setSelectedDocument(doc);
                      }}
                    >
                      <View style={styles.documentItemHeader}>
                        <Icon
                          name="description"
                          size={20}
                          color={selectedDocument?.url === doc.url ? "#2563eb" : "#6b7280"}
                        />
                        <Text style={styles.documentType}>
                          {doc.type}
                        </Text>
                        {selectedDocument?.url === doc.url && (
                          <Icon name="check-circle" size={20} color="#2563eb" />
                        )}
                      </View>
                      <Text style={styles.documentHint}>
                        Tap to view
                      </Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.noDocumentsContainer}>
                    <Icon name="folder-open" size={48} color="#d1d5db" />
                    <Text style={styles.noDocumentsText}>No documents uploaded</Text>
                  </View>
                )}
              </View>

              {/* Driver Info Summary */}
              <View style={styles.driverInfoSummary}>
                <Text style={styles.summaryTitle}>Driver Information</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Name:</Text>
                  <Text style={styles.summaryValue}>{getFullName(selectedRegistration)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Email:</Text>
                  <Text style={styles.summaryValue}>{selectedRegistration.email}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Phone:</Text>
                  <Text style={styles.summaryValue}>{selectedRegistration.phoneNumber}</Text>
                </View>
                {selectedRegistration.sapiId && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>SAPI ID:</Text>
                    <Text style={styles.summaryValue}>{selectedRegistration.sapiId}</Text>
                  </View>
                )}
                {selectedRegistration.vehicleMake && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Vehicle:</Text>
                    <Text style={styles.summaryValue}>
                      {selectedRegistration.vehicleYear && `${selectedRegistration.vehicleYear} `}
                      {selectedRegistration.vehicleMake} {selectedRegistration.vehicleModel}
                    </Text>
                  </View>
                )}
                {selectedRegistration.licensePlate && (
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Plate:</Text>
                    <Text style={styles.summaryValue}>{selectedRegistration.licensePlate}</Text>
                  </View>
                )}
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Status:</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedRegistration.RegistrationStatus) }]}>
                    <Text style={styles.statusText}>{selectedRegistration.RegistrationStatus.toUpperCase()}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading driver registrations...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Icon name="arrow-back" size={24} color="#2563eb" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Registrations</Text>
        <View style={styles.headerRight}>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{registrations.length}</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {registrations.filter((r) => r.RegistrationStatus === 'pending').length}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#10b981' }]}>
            {registrations.filter((r) => r.RegistrationStatus === 'approved').length}
          </Text>
          <Text style={styles.statLabel}>Approved</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#ef4444' }]}>
            {registrations.filter((r) => r.RegistrationStatus === 'rejected').length}
          </Text>
          <Text style={styles.statLabel}>Rejected</Text>
        </View>
      </View>

      <FlatList
        data={registrations}
        renderItem={renderRegistrationItem}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563eb']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="person-add" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No driver registrations found</Text>
            <Text style={styles.emptySubText}>Pull down to refresh</Text>
          </View>
        }
      />

      {renderDocumentModal()}
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
    backgroundColor: '#f3f4f6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    flex: 1,
    marginLeft: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  countBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  countText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f59e0b',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  listContainer: {
    padding: 16,
  },
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  driverName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  email: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  phone: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  sapiId: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  viewDocsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  viewDocsText: {
    fontSize: 12,
    color: '#2563eb',
    marginLeft: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#fff',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 12,
  },
  cardBody: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  },
  verificationRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 16,
  },
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationText: {
    fontSize: 13,
    color: '#6b7280',
    marginLeft: 6,
  },
  rejectionReasonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
  },
  rejectionReasonText: {
    fontSize: 12,
    color: '#ef4444',
    marginLeft: 6,
    flex: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  dateText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 12,
    fontWeight: '500',
  },
  emptySubText: {
    fontSize: 14,
    color: '#d1d5db',
    marginTop: 4,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  documentPreviewContainer: {
    height: 300,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  documentImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  currentDocumentLabel: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  noDocumentContainer: {
    alignItems: 'center',
  },
  noDocumentText: {
    marginTop: 8,
    color: '#9ca3af',
    fontSize: 14,
  },
  documentsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  documentsList: {
    marginBottom: 20,
  },
  documentItem: {
    backgroundColor: '#f9fafb',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  selectedDocumentItem: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
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
  noDocumentsContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noDocumentsText: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 8,
  },
  driverInfoSummary: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
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
  summaryValue: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
});

export default DriverRegistrationReportsScreen;