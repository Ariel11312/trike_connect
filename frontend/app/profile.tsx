import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  RefreshControl,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

// ─── Types ────────────────────────────────────────────────────────────────────

type Role               = 'commuter' | 'driver' | 'admin';
type RegistrationStatus = 'pending' | 'approved' | 'rejected';

interface UserProfile {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  role: Role;
  isEmailVerified: boolean;
  todaName?: string;
  licensePlate?: string;
  driversLicense?: string;
  sapiId?: string;
  address?: string;
  RegistrationStatus?: RegistrationStatus;
  isBanned: boolean;
  banReason?: string;
  banUntil?: string;
  createdAt: string;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

const apiFetch = (path: string, options?: RequestInit) =>
  fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });

async function fetchCurrentUser(): Promise<UserProfile> {
  const res = await apiFetch('/api/auth/me');
  if (res.status === 401) throw new Error('SESSION_EXPIRED');
  if (!res.ok)            throw new Error(`Server error: ${res.status}`);
  const data = await res.json();
  return (data.user ?? data) as UserProfile;
}

async function updateProfile(payload: Partial<UserProfile>): Promise<UserProfile> {
  const res = await apiFetch('/api/auth/update-profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? 'Failed to update profile');
  }
  const data = await res.json();
  return (data.user ?? data) as UserProfile;
}

async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await apiFetch('/api/auth/change-password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? 'Failed to change password');
  }
}

async function logoutUser(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  navy:    '#080E1A',
  card:    '#0F1826',
  border:  '#1C2A3A',
  accent:  '#5BC8F5',
  text:    '#E8F0FA',
  muted:   '#4A6080',
  green:   '#4CDE8A',
  red:     '#F5553A',
  yellow:  '#F5C842',
};

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT PROFILE MODAL
// ═══════════════════════════════════════════════════════════════════════════════

interface EditField { key: keyof UserProfile; label: string; icon: string; editable?: boolean }

const COMMON_FIELDS: EditField[] = [
  { key: 'firstName',   label: 'First Name',   icon: '👤' },
  { key: 'lastName',    label: 'Last Name',    icon: '👤' },
  { key: 'phoneNumber', label: 'Phone Number', icon: '📱' },
  { key: 'address',     label: 'Address',      icon: '📍' },
];

const DRIVER_FIELDS: EditField[] = [
  { key: 'todaName',       label: 'TODA Name',        icon: '🚌' },
  { key: 'licensePlate',   label: 'License Plate',    icon: '🔢' },
  { key: 'driversLicense', label: "Driver's License", icon: '🪪' },
  { key: 'sapiId',         label: 'SAPI ID',          icon: '🆔' },
];

const InputField = ({
  label,
  icon,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  icon: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={es.fieldWrap}>
      <Text style={es.fieldLabel}>{icon}  {label}</Text>
      <TextInput
        style={[es.fieldInput, focused && es.fieldInputFocused]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
        placeholderTextColor={C.muted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
};

interface EditProfileModalProps {
  visible: boolean;
  user: UserProfile;
  onClose: () => void;
  onSaved: (updated: UserProfile) => void;
}

function EditProfileModal({ visible, user, onClose, onSaved }: EditProfileModalProps) {
  const [form, setForm]       = useState<Partial<UserProfile>>({});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setForm({
        firstName:      user.firstName,
        lastName:       user.lastName,
        phoneNumber:    user.phoneNumber,
        address:        user.address ?? '',
        todaName:       user.todaName ?? '',
        licensePlate:   user.licensePlate ?? '',
        driversLicense: user.driversLicense ?? '',
        sapiId:         user.sapiId ?? '',
      });
      setError(null);
    }
  }, [visible, user]);

  const set = (key: keyof UserProfile) => (val: string) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile(form);
      onSaved(updated);
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const fields = user.role === 'driver'
    ? [...COMMON_FIELDS, ...DRIVER_FIELDS]
    : COMMON_FIELDS;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={es.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.navy} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* Header */}
          <View style={es.header}>
            <TouchableOpacity onPress={onClose} style={es.cancelBtn} disabled={saving}>
              <Text style={es.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={es.headerTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave} style={es.saveBtn} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={C.navy} />
                : <Text style={es.saveText}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={es.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Avatar display */}
            <View style={es.avatarRow}>
              <View style={es.avatarRing}>
                <View style={es.avatar}>
                  <Text style={es.avatarInitials}>
                    {(form.firstName?.[0] ?? user.firstName[0])}
                    {(form.lastName?.[0]  ?? user.lastName[0])}
                  </Text>
                </View>
              </View>
              <View>
                <Text style={es.avatarName}>
                  {form.firstName ?? user.firstName} {form.lastName ?? user.lastName}
                </Text>
                <Text style={es.avatarEmail}>{user.email}</Text>
              </View>
            </View>

            {/* Error */}
            {error && (
              <View style={es.errorBanner}>
                <Text style={es.errorText}>⚠️  {error}</Text>
              </View>
            )}

            {/* Email (read-only) */}
            <View style={es.sectionLabel}><Text style={es.sectionLabelText}>Account</Text></View>
            <View style={es.readonlyCard}>
              <Text style={es.readonlyIcon}>📧</Text>
              <View style={{ flex: 1 }}>
                <Text style={es.readonlyLabel}>Email (cannot be changed)</Text>
                <Text style={es.readonlyValue}>{user.email}</Text>
              </View>
              <View style={es.lockBadge}><Text style={{ fontSize: 12 }}>🔒</Text></View>
            </View>

            {/* Editable fields */}
            <View style={es.sectionLabel}>
              <Text style={es.sectionLabelText}>Personal Info</Text>
            </View>
            <View style={es.fieldsCard}>
              {fields.map((f, i) => (
                <React.Fragment key={f.key}>
                  <InputField
                    label={f.label}
                    icon={f.icon}
                    value={(form[f.key] as string) ?? ''}
                    onChange={set(f.key)}
                  />
                  {i < fields.length - 1 && <View style={es.fieldDivider} />}
                </React.Fragment>
              ))}
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const es = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.navy },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:   { fontSize: 17, fontWeight: '700', color: C.text },
  cancelBtn:     { paddingVertical: 6, paddingHorizontal: 4, minWidth: 60 },
  cancelText:    { color: C.muted, fontSize: 16 },
  saveBtn:       { backgroundColor: C.accent, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 18, minWidth: 60, alignItems: 'center' },
  saveText:      { color: C.navy, fontSize: 15, fontWeight: '700' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 24 },

  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 28, paddingHorizontal: 4 },
  avatarRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: C.accent, justifyContent: 'center', alignItems: 'center' },
  avatar:    { width: 54, height: 54, borderRadius: 27, backgroundColor: '#122040', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 20, fontWeight: '700', color: C.accent },
  avatarName:  { fontSize: 18, fontWeight: '700', color: C.text },
  avatarEmail: { fontSize: 13, color: C.muted, marginTop: 2 },

  errorBanner: { backgroundColor: '#2D1010', borderRadius: 10, borderWidth: 1, borderColor: '#F5553A40', padding: 14, marginBottom: 16 },
  errorText:   { color: C.red, fontSize: 14 },

  sectionLabel:     { marginBottom: 10, marginTop: 4, paddingHorizontal: 4 },
  sectionLabelText: { fontSize: 11, fontWeight: '700', color: C.accent, textTransform: 'uppercase', letterSpacing: 1.2 },

  readonlyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20, gap: 12 },
  readonlyIcon:  { fontSize: 20 },
  readonlyLabel: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginBottom: 3 },
  readonlyValue: { fontSize: 15, color: C.muted, fontWeight: '500' },
  lockBadge:     { width: 26, height: 26, borderRadius: 13, backgroundColor: C.border, justifyContent: 'center', alignItems: 'center' },

  fieldsCard:   { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 20 },
  fieldWrap:    { paddingHorizontal: 16, paddingVertical: 14 },
  fieldLabel:   { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginBottom: 8 },
  fieldInput:   { fontSize: 15, color: C.text, fontWeight: '500', borderBottomWidth: 1.5, borderBottomColor: C.border, paddingBottom: 8 },
  fieldInputFocused: { borderBottomColor: C.accent },
  fieldDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 16 },
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD MODAL
// ═══════════════════════════════════════════════════════════════════════════════

function getStrength(pw: string) {
  if (!pw) return { score: 0, label: '', color: 'transparent' };
  let s = 0;
  if (pw.length >= 6)              s++;
  if (/[A-Z]/.test(pw))           s++;
  if (/[0-9]/.test(pw))           s++;
  if (/[^A-Za-z0-9]/.test(pw))    s++;
  const levels = [
    { label: 'Too short', color: C.red },
    { label: 'Weak',      color: C.red },
    { label: 'Fair',      color: C.yellow },
    { label: 'Good',      color: C.accent },
    { label: 'Strong',    color: C.green },
  ];
  return { score: s, ...levels[s] };
}

// ── PwInput is defined at module level to prevent remount-on-rerender ──────────
const PwInput = ({
  label,
  value,
  onChange,
  id,
  showPw,
  setShowPw,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  id: string;
  showPw: Record<string, boolean>;
  setShowPw: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <View style={cp.fieldWrap}>
      <Text style={cp.fieldLabel}>{label}</Text>
      <View style={[cp.inputRow, focused && cp.inputFocused]}>
        <TextInput
          style={cp.input}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!showPw[id]}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={C.muted}
          placeholder="••••••••"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <TouchableOpacity
          onPress={() => setShowPw(s => ({ ...s, [id]: !s[id] }))}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ fontSize: 17 }}>{showPw[id] ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
}

function ChangePasswordModal({ visible, onClose }: ChangePasswordModalProps) {
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [showPw,   setShowPw]   = useState<Record<string, boolean>>({});
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [success,  setSuccess]  = useState(false);

  const reset = () => { setCurrent(''); setNext(''); setConfirm(''); setError(null); setSuccess(false); setSaving(false); };

  useEffect(() => { if (visible) reset(); }, [visible]);

  const strength = getStrength(next);

  const validate = () => {
    if (!current)               return 'Please enter your current password.';
    if (!next)                  return 'Please enter a new password.';
    if (next.length < 6)        return 'New password must be at least 6 characters.';
    if (next === current)       return 'New password must differ from current password.';
    if (next !== confirm)       return 'Passwords do not match.';
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError(null);
    try {
      await changePassword(current, next);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={cp.safe}>
        <StatusBar barStyle="light-content" backgroundColor={C.navy} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

          {/* Header */}
          <View style={cp.header}>
            <TouchableOpacity onPress={onClose} style={cp.cancelBtn} disabled={saving}>
              <Text style={cp.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={cp.headerTitle}>Change Password</Text>
            <View style={{ minWidth: 60 }} />
          </View>

          <ScrollView
            contentContainerStyle={cp.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {success ? (
              /* ── Success state ── */
              <View style={cp.successView}>
                <View style={cp.successIcon}><Text style={{ fontSize: 36 }}>🔐</Text></View>
                <Text style={cp.successTitle}>Password Updated!</Text>
                <Text style={cp.successSub}>Your password has been changed successfully.</Text>
                <TouchableOpacity style={cp.successBtn} onPress={onClose}>
                  <Text style={cp.successBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Icon + title */}
                <View style={cp.titleBlock}>
                  <View style={cp.keyIcon}><Text style={{ fontSize: 28 }}>🔑</Text></View>
                  <Text style={cp.title}>Update your password</Text>
                  <Text style={cp.subtitle}>Choose a strong password you haven't used before.</Text>
                </View>

                {/* Error */}
                {error && (
                  <View style={cp.errorBanner}>
                    <Text style={cp.errorText}>⚠️  {error}</Text>
                  </View>
                )}

                {/* Fields card */}
                <View style={cp.fieldsCard}>
                  <PwInput
                    label="Current Password"
                    value={current}
                    onChange={v => { setCurrent(v); setError(null); }}
                    id="current"
                    showPw={showPw}
                    setShowPw={setShowPw}
                  />

                  <View style={cp.divider} />

                  <PwInput
                    label="New Password"
                    value={next}
                    onChange={v => { setNext(v); setError(null); }}
                    id="next"
                    showPw={showPw}
                    setShowPw={setShowPw}
                  />

                  {/* Strength bar */}
                  {next.length > 0 && (
                    <View style={cp.strengthWrap}>
                      <View style={cp.strengthBars}>
                        {[1,2,3,4].map(i => (
                          <View key={i} style={[cp.strengthSeg, { backgroundColor: i <= strength.score ? strength.color : C.border }]} />
                        ))}
                      </View>
                      <Text style={[cp.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
                    </View>
                  )}

                  <View style={cp.divider} />

                  <PwInput
                    label="Confirm New Password"
                    value={confirm}
                    onChange={v => { setConfirm(v); setError(null); }}
                    id="confirm"
                    showPw={showPw}
                    setShowPw={setShowPw}
                  />
                </View>

                {/* Requirements */}
                <View style={cp.reqCard}>
                  <Text style={cp.reqTitle}>Password requirements</Text>
                  {[
                    { met: next.length >= 6,           text: 'At least 6 characters' },
                    { met: /[A-Z]/.test(next),          text: 'One uppercase letter' },
                    { met: /[0-9]/.test(next),          text: 'One number' },
                    { met: /[^A-Za-z0-9]/.test(next),   text: 'One special character' },
                  ].map((r, i) => (
                    <View key={i} style={cp.reqRow}>
                      <View style={[cp.reqDot, r.met ? cp.reqDotMet : cp.reqDotUnmet]} />
                      <Text style={[cp.reqText, r.met ? cp.reqTextMet : cp.reqTextUnmet]}>{r.text}</Text>
                    </View>
                  ))}
                </View>

                {/* Submit */}
                <TouchableOpacity
                  style={[cp.submitBtn, saving && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color={C.navy} />
                    : <Text style={cp.submitText}>Update Password</Text>
                  }
                </TouchableOpacity>
              </>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const cp = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.navy },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:   { fontSize: 17, fontWeight: '700', color: C.text },
  cancelBtn:     { paddingVertical: 6, paddingHorizontal: 4, minWidth: 60 },
  cancelText:    { color: C.muted, fontSize: 16 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 28 },

  titleBlock: { alignItems: 'center', marginBottom: 28 },
  keyIcon:    { width: 68, height: 68, borderRadius: 34, backgroundColor: '#122040', borderWidth: 2, borderColor: C.accent, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  title:      { fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 6 },
  subtitle:   { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },

  errorBanner: { backgroundColor: '#2D1010', borderRadius: 10, borderWidth: 1, borderColor: '#F5553A40', padding: 14, marginBottom: 16 },
  errorText:   { color: C.red, fontSize: 14 },

  fieldsCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 16 },
  fieldWrap:  { paddingHorizontal: 16, paddingVertical: 14 },
  fieldLabel: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600', marginBottom: 10 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: C.border, paddingBottom: 8 },
  inputFocused: { borderBottomColor: C.accent },
  input:      { flex: 1, fontSize: 16, color: C.text, fontWeight: '500' },
  divider:    { height: 1, backgroundColor: C.border },

  strengthWrap:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  strengthBars:  { flex: 1, flexDirection: 'row', gap: 4 },
  strengthSeg:   { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '600', width: 58, textAlign: 'right' },

  reqCard:    { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 20 },
  reqTitle:   { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  reqRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  reqDot:     { width: 8, height: 8, borderRadius: 4 },
  reqDotMet:  { backgroundColor: C.green },
  reqDotUnmet:{ backgroundColor: C.border },
  reqText:    { fontSize: 13 },
  reqTextMet: { color: C.green },
  reqTextUnmet:{ color: C.muted },

  submitBtn:  { backgroundColor: C.accent, borderRadius: 14, paddingVertical: 17, alignItems: 'center' },
  submitText: { fontSize: 16, fontWeight: '700', color: C.navy },

  successView:    { alignItems: 'center', paddingTop: 60 },
  successIcon:    { width: 88, height: 88, borderRadius: 44, backgroundColor: '#0D2D1E', borderWidth: 2, borderColor: C.green, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  successTitle:   { fontSize: 24, fontWeight: '700', color: C.text, marginBottom: 10 },
  successSub:     { fontSize: 15, color: C.muted, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
  successBtn:     { backgroundColor: C.green, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48 },
  successBtnText: { fontSize: 16, fontWeight: '700', color: '#060F0A' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

const RoleBadge = ({ role }: { role: Role }) => {
  const map: Record<Role, { bg: string; text: string; label: string }> = {
    driver:   { bg: '#1A3C5E', text: C.accent, label: 'Driver' },
    commuter: { bg: '#1A3D2B', text: C.green,  label: 'Commuter' },
    admin:    { bg: '#3D1A1A', text: '#F5855B', label: 'Admin' },
  };
  const c = map[role] ?? map.commuter;
  return (
    <View style={[ps.badge, { backgroundColor: c.bg }]}>
      <Text style={[ps.badgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
};

const StatusPill = ({ label, active }: { label: string; active: boolean }) => (
  <View style={[ps.pill, active ? ps.pillOn : ps.pillOff]}>
    <View style={[ps.dot, active ? ps.dotOn : ps.dotOff]} />
    <Text style={[ps.pillText, active ? ps.pillTextOn : ps.pillTextOff]}>{label}</Text>
  </View>
);

const RegBadge = ({ status }: { status: RegistrationStatus }) => {
  const map: Record<RegistrationStatus, { color: string; bg: string }> = {
    approved: { color: C.green,  bg: '#0D2D1E' },
    pending:  { color: C.yellow, bg: '#2D2610' },
    rejected: { color: C.red,    bg: '#2D1010' },
  };
  const s = map[status];
  return (
    <View style={[ps.regBadge, { backgroundColor: s.bg }]}>
      <Text style={[ps.regText, { color: s.color }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );
};

const InfoRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <View style={ps.infoRow}>
    <Text style={ps.infoIcon}>{icon}</Text>
    <View style={ps.infoContent}>
      <Text style={ps.infoLabel}>{label}</Text>
      <Text style={ps.infoValue}>{value}</Text>
    </View>
  </View>
);

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={ps.card}>
    <Text style={ps.cardTitle}>{title}</Text>
    <View style={ps.cardDivider} />
    {children}
  </View>
);

const ActionRow = ({
  icon, label, sublabel, onPress, color = C.text, danger = false, last = false,
}: {
  icon: string; label: string; sublabel?: string; onPress: () => void;
  color?: string; danger?: boolean; last?: boolean;
}) => (
  <>
    <TouchableOpacity style={ps.actionRow} onPress={onPress} activeOpacity={0.7}>
      <View style={[ps.actionIconWrap, danger ? ps.actionIconDanger : ps.actionIconDefault]}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[ps.actionLabel, { color }]}>{label}</Text>
        {sublabel ? <Text style={ps.actionSublabel}>{sublabel}</Text> : null}
      </View>
      <Text style={[ps.actionChevron, danger && { color: C.red }]}>›</Text>
    </TouchableOpacity>
    {!last && <View style={ps.actionDivider} />}
  </>
);

const ps = StyleSheet.create({
  badge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText:{ fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  pill:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 5 },
  pillOn:     { backgroundColor: '#0D2D1E' },
  pillOff:    { backgroundColor: '#2D1010' },
  dot:        { width: 6, height: 6, borderRadius: 3 },
  dotOn:      { backgroundColor: C.green },
  dotOff:     { backgroundColor: C.red },
  pillText:   { fontSize: 12, fontWeight: '600' },
  pillTextOn: { color: C.green },
  pillTextOff:{ color: C.red },

  regBadge:{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  regText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  card:       { backgroundColor: '#0F1826', marginHorizontal: 16, marginBottom: 16, borderRadius: 16, borderWidth: 1, borderColor: '#1C2A3A', padding: 20 },
  cardTitle:  { fontSize: 13, fontWeight: '700', color: C.accent, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 14 },
  cardDivider:{ height: 1, backgroundColor: '#1C2A3A', marginBottom: 16 },

  infoRow:    { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, gap: 12 },
  infoIcon:   { fontSize: 18, width: 28, textAlign: 'center', marginTop: 1 },
  infoContent:{ flex: 1, gap: 3 },
  infoLabel:  { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '600' },
  infoValue:  { fontSize: 15, color: C.text,  fontWeight: '500' },

  actionRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  actionIconWrap:   { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionIconDefault:{ backgroundColor: '#122040' },
  actionIconDanger: { backgroundColor: '#2D1010' },
  actionLabel:      { fontSize: 15, fontWeight: '600', color: C.text },
  actionSublabel:   { fontSize: 12, color: C.muted, marginTop: 2 },
  actionChevron:    { fontSize: 22, color: C.muted, fontWeight: '300' },
  actionDivider:    { height: 1, backgroundColor: '#1C2A3A' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// SKELETON & ERROR
// ═══════════════════════════════════════════════════════════════════════════════

const Bone = ({ w, h, r = 8 }: { w: number | string; h: number; r?: number }) => (
  <View style={{ width: w as any, height: h, borderRadius: r, backgroundColor: '#1C2A3A', marginVertical: 5 }} />
);

const LoadingView = () => (
  <View style={{ alignItems: 'center', paddingTop: 32, paddingHorizontal: 24 }}>
    <Bone w={88} h={88} r={44} />
    <View style={{ height: 8 }} />
    <Bone w={180} h={20} r={10} />
    <Bone w={130} h={14} r={8} />
    <View style={{ height: 20 }} />
    <Bone w="100%" h={130} r={16} />
    <View style={{ height: 12 }} />
    <Bone w="100%" h={200} r={16} />
    <View style={{ height: 12 }} />
    <Bone w="100%" h={120} r={16} />
  </View>
);

const ErrorView = ({ message, onRetry, onLogout }: { message: string; onRetry: () => void; onLogout?: () => void }) => {
  const expired = message === 'SESSION_EXPIRED';
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 }}>
      <Text style={{ fontSize: 44, marginBottom: 16 }}>{expired ? '🔐' : '⚠️'}</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: C.text, marginBottom: 8, textAlign: 'center' }}>
        {expired ? 'Session Expired' : 'Could not load profile'}
      </Text>
      <Text style={{ fontSize: 14, color: C.muted, textAlign: 'center', marginBottom: 28, lineHeight: 21 }}>
        {expired ? 'Your session has ended. Please log in again.' : 'Something went wrong connecting to the server.'}
      </Text>
      <TouchableOpacity
        style={[ps.card, { backgroundColor: C.accent, borderColor: C.accent, marginHorizontal: 0, marginBottom: 0, padding: 0, paddingVertical: 16, paddingHorizontal: 40 }]}
        onPress={expired ? onLogout : onRetry}
        activeOpacity={0.85}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.navy }}>
          {expired ? 'Go to Login' : 'Try Again'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PROFILE SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

export default function ProfileScreen() {
  const [user, setUser]         = useState<UserProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const [showEdit,     setShowEdit]     = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const loadUser = useCallback(async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      const profile = await fetchCurrentUser();
      setUser(profile);
    } catch (err: any) {
      const msg = err?.message ?? 'UNKNOWN';
      setError(msg);
      if (msg === 'SESSION_EXPIRED') handleLogout();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  const handleLogout = async () => {
    try { await logoutUser(); } catch (_) { /* ignore */ }
    router.replace('/');
  };

  const confirmLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: handleLogout },
      ],
    );
  };

  const memberSince = user
    ? new Date(user.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <SafeAreaView style={main.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.navy} />

      <ScrollView
        style={main.scroll}
        contentContainerStyle={main.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadUser(true)} tintColor={C.accent} colors={[C.accent]} />
        }
      >
        {/* ── Header ── */}
        <View style={main.header}>
          <View style={main.headerTopRow}>
            <TouchableOpacity
              style={main.backBtn}
              onPress={() => {
                if (!user) { router.back(); return; }
                if (user.role === 'driver')  router.replace('/driverHome');
                else if (user.role === 'admin') router.replace('/reportList');
                else router.replace('/userHome');
              }}
              activeOpacity={0.7}
            >
              <Text style={main.backIcon}>‹</Text>
            </TouchableOpacity>
          </View>
          <Text style={main.screenTitle}>Profile</Text>

          {user && (
            <View style={main.avatarSection}>
              <View style={main.avatarWrapper}>
                <View style={main.avatarRing}>
                  <View style={main.avatar}>
                    <Text style={main.avatarInitials}>{user.firstName[0]}{user.lastName[0]}</Text>
                  </View>
                </View>
                {user.isEmailVerified && (
                  <View style={main.verifiedBadge}>
                    <Text style={main.verifiedIcon}>✓</Text>
                  </View>
                )}
              </View>
              <Text style={main.fullName}>{user.firstName} {user.lastName}</Text>
              <Text style={main.emailText}>{user.email}</Text>
              <View style={main.pillRow}>
                <RoleBadge role={user.role} />
                <StatusPill label={user.isBanned ? 'Banned' : 'Active'} active={!user.isBanned} />
                {user.role === 'driver' && user.RegistrationStatus && (
                  <RegBadge status={user.RegistrationStatus} />
                )}
              </View>
              <Text style={main.memberSince}>Member since {memberSince}</Text>
            </View>
          )}
        </View>

        {/* ── States ── */}
        {loading && <LoadingView />}
        {!loading && error && <ErrorView message={error} onRetry={() => loadUser()} onLogout={handleLogout} />}

        {!loading && user && (
          <>
            {/* Ban banner */}
            {user.isBanned && (
              <View style={main.banBanner}>
                <Text style={main.banTitle}>🚫 Account {user.banUntil ? 'Suspended' : 'Permanently Banned'}</Text>
                {user.banReason && <Text style={main.banReason}>Reason: {user.banReason}</Text>}
                {user.banUntil  && <Text style={main.banExpiry}>Until: {new Date(user.banUntil).toLocaleString('en-PH')}</Text>}
              </View>
            )}

            {/* Personal Info */}
            <SectionCard title="Personal Information">
              <InfoRow icon="👤" label="First Name"   value={user.firstName} />
              <InfoRow icon="👤" label="Last Name"    value={user.lastName} />
              <InfoRow icon="📧" label="Email"        value={user.email} />
              <InfoRow icon="📱" label="Phone Number" value={user.phoneNumber} />
              {user.address && <InfoRow icon="📍" label="Address" value={user.address} />}
            </SectionCard>

            {/* Driver Details */}
            {user.role === 'driver' && (
              <SectionCard title="Driver Details">
                <InfoRow icon="🚌" label="TODA Name"        value={user.todaName       || '—'} />
                <InfoRow icon="🔢" label="License Plate"    value={user.licensePlate   || '—'} />
                <InfoRow icon="🪪" label="Driver's License" value={user.driversLicense || '—'} />
                <InfoRow icon="🆔" label="SAPI ID"          value={user.sapiId         || '—'} />
                {user.RegistrationStatus && (
                  <View style={ps.infoRow}>
                    <Text style={ps.infoIcon}>📋</Text>
                    <View style={ps.infoContent}>
                      <Text style={ps.infoLabel}>Registration Status</Text>
                      <RegBadge status={user.RegistrationStatus} />
                    </View>
                  </View>
                )}
              </SectionCard>
            )}

            {/* Account Security */}
            <SectionCard title="Account Security">
              <View style={ps.infoRow}>
                <Text style={ps.infoIcon}>✉️</Text>
                <View style={ps.infoContent}>
                  <Text style={ps.infoLabel}>Email Verification</Text>
                  <StatusPill label={user.isEmailVerified ? 'Verified' : 'Not Verified'} active={user.isEmailVerified} />
                </View>
              </View>
              <View style={[ps.infoRow, { marginBottom: 0 }]}>
                <Text style={ps.infoIcon}>🔒</Text>
                <View style={ps.infoContent}>
                  <Text style={ps.infoLabel}>Password</Text>
                  <Text style={ps.infoValue}>••••••••</Text>
                </View>
              </View>
            </SectionCard>

            {/* Account Actions */}
            <View style={ps.card}>
              <Text style={ps.cardTitle}>Account Actions</Text>
              <View style={ps.cardDivider} />

              <ActionRow
                icon="✏️"
                label="Edit Profile"
                sublabel="Update your personal information"
                onPress={() => setShowEdit(true)}
              />

              <ActionRow
                icon="🔑"
                label="Change Password"
                sublabel="Update your login password"
                onPress={() => setShowPassword(true)}
              />

              <ActionRow
                icon="🚪"
                label="Log Out"
                sublabel="Sign out of your account"
                onPress={confirmLogout}
                color={C.red}
                danger
                last
              />
            </View>
          </>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* ── Modals ── */}
      {user && (
        <>
          <EditProfileModal
            visible={showEdit}
            user={user}
            onClose={() => setShowEdit(false)}
            onSaved={(updated) => setUser(updated)}
          />
          <ChangePasswordModal
            visible={showPassword}
            onClose={() => setShowPassword(false)}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const main = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: C.navy },
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  header: {
    backgroundColor: '#0F1826',
    paddingTop: 24, paddingBottom: 32, paddingHorizontal: 24,
    borderBottomWidth: 1, borderBottomColor: '#1C2A3A', marginBottom: 20,
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backBtn:      { width: 36, height: 36, borderRadius: 12, backgroundColor: '#1C2A3A', justifyContent: 'center', alignItems: 'center' },
  backIcon:     { fontSize: 28, color: C.text, lineHeight: 32, marginLeft: -2, fontWeight: '300' },
  screenTitle:  { fontSize: 28, fontWeight: '700', color: C.text, letterSpacing: -0.5, marginBottom: 28 },

  avatarSection: { alignItems: 'center' },
  avatarWrapper: { position: 'relative', marginBottom: 16 },
  avatarRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 2.5, borderColor: C.accent, justifyContent: 'center', alignItems: 'center', padding: 4 },
  avatar:     { width: 82, height: 82, borderRadius: 41, backgroundColor: '#122040', justifyContent: 'center', alignItems: 'center' },
  avatarInitials: { fontSize: 30, fontWeight: '700', color: C.accent, letterSpacing: 1 },
  verifiedBadge:  { position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: C.green, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#0F1826' },
  verifiedIcon:   { fontSize: 11, color: '#060F0A', fontWeight: '800' },
  fullName:    { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.3, marginBottom: 4 },
  emailText:   { fontSize: 14, color: C.muted, marginBottom: 14 },
  pillRow:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 12 },
  memberSince: { fontSize: 12, color: C.muted, marginTop: 4 },

  banBanner: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#2D1010', borderRadius: 12, borderWidth: 1, borderColor: '#F5553A40', padding: 16 },
  banTitle:  { fontSize: 15, fontWeight: '700', color: C.red, marginBottom: 4 },
  banReason: { fontSize: 13, color: '#C0403A', marginBottom: 2 },
  banExpiry: { fontSize: 12, color: C.muted },
});