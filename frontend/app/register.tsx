import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useState } from "react";
import { Stack, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

export default function Register() {
  const [role, setRole] = useState<"commuter" | "driver">("commuter");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);

  // Driver-specific
  const [todaName, setTodaName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
    const [driversLicense,setDriversLicense] = useState("");
    const [sapiId,setSapiId] = useState("");
  const [idCardUri, setIdCardUri] = useState<string | null>(null);
  const [idCardBase64, setIdCardBase64] = useState<string | null>(null);
  const [isValidResident, setIsValidResident] = useState(false);
  const [detectedAddress, setDetectedAddress] = useState("");
  const [isVerifyingID, setIsVerifyingID] = useState(false);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<"success" | "error">("success");
  const [modalMessage, setModalMessage] = useState("");

  const showModal = (type: "success" | "error", message: string) => {
    setModalType(type);
    setModalMessage(message);
    setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    if (modalType === "success" && modalMessage.includes("Account created")) {
      router.push("/");
    }
  };

  // === Email verification functions ===
  const handleSendVerificationCode = async () => {
    if (!email) return showModal("error", "Please enter your email");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return showModal("error", "Invalid email");

    setIsSendingCode(true);
    try {
      const res = await fetch("http://192.168.100.37:5000/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        setCodeSent(true);
        showModal("success", "Verification code sent!");
      } else {
        showModal("error", data.message || "Failed to send code");
      }
    } catch (error) {
      showModal("error", "Network error. Please try again.");
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode) return showModal("error", "Enter code");
    setIsLoading(true);
    try {
      const res = await fetch("http://192.168.100.37:5000/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: verificationCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsVerified(true);
        showModal("success", "Email verified!");
      } else {
        showModal("error", data.message || "Invalid code");
      }
    } catch (error) {
      showModal("error", "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  // === ID upload function ===
  const handlePickImage = async () => {
    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        showModal("error", "Media library permission denied");
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (result.canceled) return;

      setIsVerifyingID(true);

      // Resize and compress
      const resized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      setIdCardUri(resized.uri);
      setIdCardBase64(resized.base64 || null);

      if (resized.base64) {
        await verifyIDCard(resized.base64);
      }
    } catch (error) {
      console.error("Image picker error:", error);
      showModal("error", "Failed to pick image. Try again.");
      setIsVerifyingID(false);
    }
  };

  // Verify ID with backend
  const verifyIDCard = async (base64Image: string) => {
    setIsVerifyingID(true);
    try {
      const res = await fetch("http://192.168.100.37:5000/api/auth/verify-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idImage: `data:image/jpeg;base64,${base64Image}` }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDetectedAddress(data.address);
        setIsValidResident(data.isValidResident);
        if (data.isValidResident) {
          showModal("success", `ID Verified: ${data.address}, It will check by the Admin`);
        } else {
          showModal("error", `Address invalid: ${data.address}`);
          setIdCardUri(null);
          setIdCardBase64(null);
        }
      } else {
        showModal("error", data.message || "Failed to verify ID");
        setIdCardUri(null);
        setIdCardBase64(null);
      }
    } catch (error) {
      console.error("Verify error:", error);
      showModal("error", "Network error verifying ID");
      setIdCardUri(null);
      setIdCardBase64(null);
    } finally {
      setIsVerifyingID(false);
    }
  };

  // === Registration ===
  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !phoneNumber || !password || !confirmPassword) {
      return showModal("error", "Fill all fields");
    }
    if (!isVerified) {
      return showModal("error", "Verify email first");
    }
    if (role === "driver" && (!todaName || !licensePlate || !idCardUri || !isValidResident || !driversLicense || !sapiId)) {
      return showModal("error", "Complete driver info and ID");
    }
    if (password !== confirmPassword) {
      return showModal("error", "Passwords do not match");
    }

    setIsLoading(true);
    try {
      const formattedPhone = "63" + phoneNumber.replace(/[^0-9]/g, "").slice(-10);
      const body: any = {
        firstName,
        lastName,
        email,
        phoneNumber: formattedPhone,
        password,
        role,
      };

      if (role === "driver") {
        body.todaName = todaName;
        body.licensePlate = licensePlate.toUpperCase();
        body.driversLicense = driversLicense.toUpperCase();
        body.sapiId = sapiId.toUpperCase();
        body.idCardImage = idCardBase64;
        body.address = detectedAddress;
      }

      const res = await fetch("http://192.168.100.37:5000/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        showModal("success", "Account created successfully!");
      } else {
        showModal("error", data.message || "Registration failed");
      }
    } catch (error) {
      showModal("error", "Network error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          <Stack.Screen options={{ headerShown: false }} />
          <ScrollView 
            style={styles.container}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Create Account</Text>

            {/* Role selection */}
            <View style={styles.roleContainer}>
              {(["commuter", "driver"] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleButton, role === r && styles.roleActive]}
                  onPress={() => setRole(r)}
                >
                  <Text style={[styles.roleText, role === r && styles.roleTextActive]}>
                    {r === "commuter" ? "🚶 Commuter" : "🏍️ Driver"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Basic info */}
            <TextInput
              style={styles.input}
              placeholder="First Name"
              value={firstName}
              onChangeText={setFirstName}
            />
            <TextInput
              style={styles.input}
              placeholder="Last Name"
              value={lastName}
              onChangeText={setLastName}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />

            {/* Email verification */}
            {!isVerified && (
              <View style={styles.verificationContainer}>
                {!codeSent ? (
                  <TouchableOpacity
                    style={styles.verifyButton}
                    onPress={handleSendVerificationCode}
                    disabled={isSendingCode}
                  >
                    {isSendingCode ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.verifyButtonText}>Send Verification Code</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Verification Code"
                      value={verificationCode}
                      onChangeText={setVerificationCode}
                      keyboardType="number-pad"
                    />
                    <TouchableOpacity
                      style={styles.verifyCodeButton}
                      onPress={handleVerifyCode}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.verifyButtonText}>Verify Code</Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {isVerified && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>✓ Email Verified</Text>
              </View>
            )}

            {/* Driver fields */}
            {role === "driver" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="TODA Name"
                  value={todaName}
                  onChangeText={setTodaName}
                />
                <TextInput
                  style={styles.input}
                  placeholder="License Plate"
                  value={licensePlate}
                  onChangeText={setLicensePlate}
                  autoCapitalize="characters"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Driver's License"
                  value={driversLicense}
                  onChangeText={setDriversLicense}
                  autoCapitalize="characters"
                />
                                <TextInput
                  style={styles.input}
                  placeholder="SAPI ID"
                  value={sapiId}
                  onChangeText={setSapiId}
                  autoCapitalize="characters"
                />
                <Text>Upload Driver's License</Text>
                <TouchableOpacity style={styles.scanIDButton} onPress={handlePickImage}>
                  <Text style={styles.scanIDText}>
                    {idCardUri ? "Change ID" : "Upload ID"}
                  </Text>
                </TouchableOpacity>
                {idCardUri && (
                  <Image
                    source={{ uri: idCardUri }}
                    style={styles.idPreview}
                  />
                )}
                {isVerifyingID && <ActivityIndicator size="large" />}
              </>
            )}

            <TouchableOpacity
              style={styles.button}
              onPress={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Register</Text>
              )}
            </TouchableOpacity>
            
            {/* Extra bottom padding for keyboard and ID preview */}
            <View style={{ height: 200 }} />
          </ScrollView>

          {/* Status Modal */}
          <Modal visible={modalVisible} transparent animationType="fade">
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>
                  {modalType === "success" ? "✓ Success" : "⚠️ Error"}
                </Text>
                <Text style={styles.modalMessage}>{modalMessage}</Text>
                <TouchableOpacity style={styles.modalButton} onPress={handleModalClose}>
                  <Text style={styles.modalButtonText}>OK</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#fff" 
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  title: { 
    fontSize: 28, 
    fontWeight: "bold", 
    marginBottom: 24, 
    textAlign: "center",
    marginTop: 20,
  },
  roleContainer: { 
    flexDirection: "row", 
    marginBottom: 16, 
    gap: 8 
  },
  roleButton: { 
    flex: 1, 
    padding: 12, 
    borderWidth: 1, 
    borderColor: "#ccc", 
    borderRadius: 8, 
    alignItems: "center" 
  },
  roleActive: { 
    backgroundColor: "#007AFF", 
    borderColor: "#007AFF" 
  },
  roleText: { 
    color: "#000", 
    fontWeight: "600" 
  },
  roleTextActive: { 
    color: "#fff" 
  },
  input: { 
    height: 50, 
    borderWidth: 1, 
    borderColor: "#ccc", 
    borderRadius: 8, 
    paddingHorizontal: 16, 
    marginBottom: 16,
    backgroundColor: "#fff",
  },
  verifyButton: { 
    height: 50, 
    backgroundColor: "#FF9500", 
    borderRadius: 8, 
    justifyContent: "center", 
    alignItems: "center", 
    marginBottom: 16 
  },
  verifyButtonText: { 
    color: "#fff", 
    fontSize: 16, 
    fontWeight: "600" 
  },
  verifyCodeButton: { 
    height: 50, 
    backgroundColor: "#4CAF50", 
    borderRadius: 8, 
    justifyContent: "center", 
    alignItems: "center" 
  },
  verifiedBadge: { 
    backgroundColor: "#E8F5E9", 
    padding: 12, 
    borderRadius: 8, 
    marginBottom: 16, 
    alignItems: "center" 
  },
  verifiedText: { 
    color: "#4CAF50", 
    fontSize: 16, 
    fontWeight: "600" 
  },
  scanIDButton: { 
    height: 60, 
    borderRadius: 12, 
    backgroundColor: "#007AFF", 
    justifyContent: "center", 
    alignItems: "center", 
    marginVertical: 8 
  },
  scanIDText: { 
    color: "#fff", 
    fontWeight: "600" 
  },
  idPreview: { 
    width: "100%", 
    height: 200, 
    alignSelf: "center", 
    marginVertical: 8, 
    borderRadius: 8,
    resizeMode: "contain",
  },
  button: { 
    height: 50, 
    backgroundColor: "#007AFF", 
    borderRadius: 8, 
    justifyContent: "center", 
    alignItems: "center", 
    marginTop: 8,
    marginBottom: 20,
  },
  buttonText: { 
    color: "#fff", 
    fontSize: 16, 
    fontWeight: "600" 
  },
  modalOverlay: { 
    flex: 1, 
    backgroundColor: "rgba(0,0,0,0.5)", 
    justifyContent: "center", 
    alignItems: "center" 
  },
  modalContent: { 
    backgroundColor: "#fff", 
    borderRadius: 16, 
    padding: 24, 
    width: "80%", 
    maxWidth: 400,
    alignItems: "center" 
  },
  modalTitle: { 
    fontSize: 24, 
    fontWeight: "bold", 
    marginBottom: 12 
  },
  modalMessage: { 
    fontSize: 16, 
    textAlign: "center", 
    color: "#666", 
    marginBottom: 24 
  },
  modalButton: { 
    width: "100%", 
    height: 50, 
    borderRadius: 8, 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: "#007AFF" 
  },
  modalButtonText: { 
    color: "#fff", 
    fontSize: 16, 
    fontWeight: "600" 
  },
  verificationContainer: { 
    marginBottom: 16 
  },
});