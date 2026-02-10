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
import { useRouter } from 'expo-router';

// Type definitions
type RegistrationStatus = 'pending' | 'approved' | 'rejected';
type BackgroundCheckStatus = 'pending' | 'approved' | 'failed';
type VehicleType = 'Sedan' | 'SUV' | 'Hatchback' | 'Van' | 'Truck';
type DocumentType = 'id_front' | 'id_back' | 'driver_license' | 'vehicle_registration' | 'insurance';

interface Document {
  type: DocumentType;
  url: string;
  verified: boolean;
  uploadedAt: string;
}

interface DriverRegistration {
  _id: string;
  driverName: string;
  email: string;
  phone: string;
  vehicleType: VehicleType;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  licensePlate: string;
  status: RegistrationStatus;
  documentsVerified: boolean;
  backgroundCheckStatus: BackgroundCheckStatus;
  documents: Document[];
  profileImage?: string;
  createdAt: string;
  updatedAt: string;
}

const DriverRegistrationReportsScreen: React.FC = () => {
  const router = useRouter();
  const [registrations, setRegistrations] = useState<DriverRegistration[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedRegistration, setSelectedRegistration] = useState<DriverRegistration | null>(null);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [selectedDocument, setSelectedDocument] = useState<string>('');

  // Sample data with documents
  const sampleRegistrations: DriverRegistration[] = [
    {
      _id: '698a6915681642cc0dff51f3',
      driverName: 'Alex Martinez',
      email: 'alex.martinez@example.com',
      phone: '+1234567890',
      vehicleType: 'Sedan',
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      vehicleYear: 2022,
      licensePlate: 'ABC123',
      status: 'pending',
      documentsVerified: false,
      backgroundCheckStatus: 'pending',
      profileImage: 'https://randomuser.me/api/portraits/men/32.jpg',
      documents: [
        {
          type: 'id_front',
          url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&h=300&fit=crop',
          verified: true,
          uploadedAt: '2026-02-10T10:30:00.000+00:00',
        },
        {
          type: 'id_back',
          url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&h=300&fit=crop',
          verified: true,
          uploadedAt: '2026-02-10T10:30:00.000+00:00',
        },
        {
          type: 'driver_license',
          url: 'https://images.unsplash.com/photo-1585771724684-382b4b8ef97f?w=400&h-300&fit=crop',
          verified: false,
          uploadedAt: '2026-02-10T10:30:00.000+00:00',
        },
        {
          type: 'vehicle_registration',
          url: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=400&h=300&fit=crop',
          verified: false,
          uploadedAt: '2026-02-10T10:30:00.000+00:00',
        },
      ],
      createdAt: '2026-02-10T10:30:00.000+00:00',
      updatedAt: '2026-02-10T10:30:00.000+00:00',
    },
    {
      _id: '698a6915681642cc0dff51f4',
      driverName: 'Maria Garcia',
      email: 'maria.garcia@example.com',
      phone: '+1234567891',
      vehicleType: 'SUV',
      vehicleMake: 'Honda',
      vehicleModel: 'CR-V',
      vehicleYear: 2023,
      licensePlate: 'XYZ789',
      status: 'approved',
      documentsVerified: true,
      backgroundCheckStatus: 'approved',
      profileImage: 'https://randomuser.me/api/portraits/women/44.jpg',
      documents: [
        {
          type: 'id_front',
          url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&h=300&fit=crop',
          verified: true,
          uploadedAt: '2026-02-09T14:20:00.000+00:00',
        },
        {
          type: 'id_back',
          url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&h=300&fit=crop',
          verified: true,
          uploadedAt: '2026-02-09T14:20:00.000+00:00',
        },
        {
          type: 'driver_license',
          url: 'https://images.unsplash.com/photo-1585771724684-382b4b8ef97f?w=400&h=300&fit=crop',
          verified: true,
          uploadedAt: '2026-02-09T14:20:00.000+00:00',
        },
        {
          type: 'vehicle_registration',
          url: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?w=400&h=300&fit=crop',
          verified: true,
          uploadedAt: '2026-02-09T14:20:00.000+00:00',
        },
        {
          type: 'insurance',
          url: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=400&h=300&fit=crop',
          verified: true,
          uploadedAt: '2026-02-09T14:20:00.000+00:00',
        },
      ],
      createdAt: '2026-02-09T14:20:00.000+00:00',
      updatedAt: '2026-02-09T16:45:00.000+00:00',
    },
    {
      _id: '698a6915681642cc0dff51f5',
      driverName: 'James Wilson',
      email: 'james.wilson@example.com',
      phone: '+1234567892',
      vehicleType: 'Sedan',
      vehicleMake: 'Ford',
      vehicleModel: 'Fusion',
      vehicleYear: 2021,
      licensePlate: 'LMN456',
      status: 'rejected',
      documentsVerified: false,
      backgroundCheckStatus: 'failed',
      profileImage: 'https://randomuser.me/api/portraits/men/67.jpg',
      documents: [
        {
          type: 'id_front',
          url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=400&h=300&fit=crop',
          verified: false,
          uploadedAt: '2026-02-08T09:15:00.000+00:00',
        },
        {
          type: 'driver_license',
          url: 'https://images.unsplash.com/photo-1585771724684-382b4b8ef97f?w=400&h=300&fit=crop',
          verified: false,
          uploadedAt: '2026-02-08T09:15:00.000+00:00',
        },
      ],
      createdAt: '2026-02-08T09:15:00.000+00:00',
      updatedAt: '2026-02-08T18:30:00.000+00:00',
    },
  ];

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const fetchRegistrations = async (): Promise<void> => {
    try {
      // Replace with actual API call
      setTimeout(() => {
        setRegistrations(sampleRegistrations);
        setLoading(false);
        setRefreshing(false);
      }, 1000);
    } catch (error) {
      console.error('Error fetching registrations:', error);
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

  const getBackgroundCheckColor = (status: BackgroundCheckStatus): string => {
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

  const getDocumentTypeLabel = (type: DocumentType): string => {
    switch (type) {
      case 'id_front':
        return 'ID Front';
      case 'id_back':
        return 'ID Back';
      case 'driver_license':
        return 'Driver License';
      case 'vehicle_registration':
        return 'Vehicle Registration';
      case 'insurance':
        return 'Insurance';
      default:
        return type;
    }
  };

  const handleViewDocuments = (registration: DriverRegistration): void => {
    setSelectedRegistration(registration);
    setModalVisible(true);
    if (registration.documents.length > 0) {
      setSelectedDocument(registration.documents[0].url);
    }
  };

  const handleApprove = (registrationId: string): void => {
    Alert.alert(
      'Approve Registration',
      'Are you sure you want to approve this driver registration?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'destructive',
          onPress: () => {
            // Update registration status
            setRegistrations(prev =>
              prev.map(reg =>
                reg._id === registrationId
                  ? { ...reg, status: 'approved', documentsVerified: true, backgroundCheckStatus: 'approved' }
                  : reg
              )
            );
            Alert.alert('Success', 'Driver registration approved successfully!');
          },
        },
      ]
    );
  };

  const handleReject = (registrationId: string): void => {
    Alert.alert(
      'Reject Registration',
      'Are you sure you want to reject this driver registration?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => {
            // Update registration status
            setRegistrations(prev =>
              prev.map(reg =>
                reg._id === registrationId
                  ? { ...reg, status: 'rejected', backgroundCheckStatus: 'failed' }
                  : reg
              )
            );
            Alert.alert('Success', 'Driver registration rejected.');
          },
        },
      ]
    );
  };

  const renderRegistrationItem = ({ item }: { item: DriverRegistration }) => (
    <TouchableOpacity
      style={styles.registrationCard}
      onPress={() => handleViewDocuments(item)}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatarContainer}>
          {item.profileImage ? (
            <Image
              source={{ uri: item.profileImage }}
              style={styles.profileImage}
              resizeMode="cover"
            />
          ) : (
            <Icon name="person" size={32} color="#2563eb" />
          )}
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.driverName}>{item.driverName}</Text>
          <Text style={styles.email}>{item.email}</Text>
          <Text style={styles.phone}>{item.phone}</Text>
          <TouchableOpacity
            style={styles.viewDocsButton}
            onPress={(e) => {
              e.stopPropagation();
              handleViewDocuments(item);
            }}
          >
            <Icon name="photo-library" size={16} color="#2563eb" />
            <Text style={styles.viewDocsText}>
              {item.documents.length} documents
            </Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Icon name="directions-car" size={20} color="#6b7280" />
          <Text style={styles.infoText}>
            {item.vehicleYear} {item.vehicleMake} {item.vehicleModel} ({item.vehicleType})
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Icon name="confirmation-number" size={20} color="#6b7280" />
          <Text style={styles.infoText}>License Plate: {item.licensePlate}</Text>
        </View>

        <View style={styles.verificationRow}>
          <View style={styles.verificationItem}>
            <Icon
              name={item.documentsVerified ? 'check-circle' : 'cancel'}
              size={20}
              color={item.documentsVerified ? '#10b981' : '#ef4444'}
            />
            <Text style={styles.verificationText}>Documents</Text>
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
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.dateText}>Registered: {formatDate(item.createdAt)}</Text>
        {item.status === 'pending' && (
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

  const renderDocumentModal = () => (
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
              Documents - {selectedRegistration?.driverName}
            </Text>
            <TouchableOpacity
              onPress={() => setModalVisible(false)}
              style={styles.closeButton}
            >
              <Icon name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {selectedRegistration && (
            <ScrollView style={styles.modalContent}>
              {/* Current Document Image */}
              <View style={styles.documentPreviewContainer}>
                {selectedDocument ? (
                  <Image
                    source={{ uri: selectedDocument }}
                    style={styles.documentImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.noDocumentContainer}>
                    <Icon name="image-not-supported" size={64} color="#d1d5db" />
                    <Text style={styles.noDocumentText}>No document selected</Text>
                  </View>
                )}
              </View>

              {/* Document List */}
              <Text style={styles.documentsSectionTitle}>Available Documents:</Text>
              <View style={styles.documentsList}>
                {selectedRegistration.documents.map((doc, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.documentItem,
                      selectedDocument === doc.url && styles.selectedDocumentItem,
                    ]}
                    onPress={() => setSelectedDocument(doc.url)}
                  >
                    <View style={styles.documentItemHeader}>
                      <Icon
                        name="description"
                        size={20}
                        color={doc.verified ? '#10b981' : '#f59e0b'}
                      />
                      <Text style={styles.documentType}>
                        {getDocumentTypeLabel(doc.type)}
                      </Text>
                      {doc.verified && (
                        <Icon name="verified" size={16} color="#10b981" />
                      )}
                    </View>
                    <Text style={styles.documentStatus}>
                      Status: {doc.verified ? 'Verified' : 'Pending'}
                    </Text>
                    <Text style={styles.documentDate}>
                      Uploaded: {formatDate(doc.uploadedAt)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Driver Info Summary */}
              <View style={styles.driverInfoSummary}>
                <Text style={styles.summaryTitle}>Driver Information</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Name:</Text>
                  <Text style={styles.summaryValue}>{selectedRegistration.driverName}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Email:</Text>
                  <Text style={styles.summaryValue}>{selectedRegistration.email}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Vehicle:</Text>
                  <Text style={styles.summaryValue}>
                    {selectedRegistration.vehicleMake} {selectedRegistration.vehicleModel}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Status:</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedRegistration.status) }]}>
                    <Text style={styles.statusText}>{selectedRegistration.status.toUpperCase()}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
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
            {registrations.filter((r) => r.status === 'pending').length}
          </Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#10b981' }]}>
            {registrations.filter((r) => r.status === 'approved').length}
          </Text>
          <Text style={styles.statLabel}>Approved</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: '#ef4444' }]}>
            {registrations.filter((r) => r.status === 'rejected').length}
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
    borderRadius: 28,
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
    height: '80%',
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
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  documentPreviewContainer: {
    height: 200,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginBottom: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  noDocumentContainer: {
    alignItems: 'center',
  },
  noDocumentText: {
    marginTop: 8,
    color: '#9ca3af',
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
    borderWidth: 1,
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
  documentStatus: {
    fontSize: 12,
    color: '#6b7280',
  },
  documentDate: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  driverInfoSummary: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
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
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
    width: 80,
  },
  summaryValue: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
});

export default DriverRegistrationReportsScreen;